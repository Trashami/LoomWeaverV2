using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Bestiary;

public sealed record BestiaryListQuery(
    string? Search, string? Type, string? Source, double? CrMin, double? CrMax, string? Sort, int Offset, int Limit);

/// <summary>
/// Reads the official compendium (loomweaver.dnd_monster_library, synced from 5etools) and merges it with
/// custom monsters visible to the caller. Falls back to the SRD seed catalog when MySQL is unreachable.
/// </summary>
public static class BestiaryCatalogRepository
{
    private const string OfficialVisibility = "provider = '5etools' AND campaign_id IS NULL AND is_canonical = 1";
    private const string CrExpr =
        "(CASE cr_text WHEN '1/8' THEN 0.125 WHEN '1/4' THEN 0.25 WHEN '1/2' THEN 0.5 ELSE CAST(cr_text AS DECIMAL(6,3)) END)";

    private const string SummaryColumns = """
        id, source_id, name, cr_text, type_main, ac_json, alignment_json, image_path, token_url,
        JSON_UNQUOTE(JSON_EXTRACT(size_json, '$[0]')) AS size_code,
        JSON_EXTRACT(raw_json, '$.hp.average') AS hp_avg,
        JSON_EXTRACT(raw_json, '$.type') AS type_json,
        JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.trait[0].name')) AS trait0,
        JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.action[0].name')) AS action0,
        JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.action[1].name')) AS action1
        """;

    public static async Task<BestiaryPageDto> ListAsync(LoomWeaverMySqlRepository mysql, long viewerId, BestiaryListQuery q, CancellationToken ct)
    {
        var source = (q.Source ?? "all").Trim().ToLowerInvariant();
        var limit = Math.Clamp(q.Limit <= 0 ? 48 : q.Limit, 1, 200);
        var offset = Math.Max(0, q.Offset);

        var customs = source == "official"
            ? new List<BestiaryMonsterSummaryDto>()
            : BestiaryCreatorStore.VisibleCustoms(viewerId)
                .Select(c => BestiaryCreatorStore.Summarize(c, viewerId))
                .Where(c => source != "mine" || c.OwnedByViewer)
                .Where(c => source != "community" || c.IsPublished)
                .Where(c => Matches(c, q))
                .ToList();
        customs = Sort(customs, q.Sort).ToList();

        var customSlice = customs.Skip(offset).Take(limit).ToList();
        if (source is "mine" or "community")
            return new BestiaryPageDto(customSlice, customs.Count, offset, limit, true);

        var (official, officialTotal, online) = await QueryOfficialAsync(mysql, q, 0, offset + limit, ct);
        var merged = Sort(customs.Concat(official), q.Sort).Skip(offset).Take(limit).ToList();
        return new BestiaryPageDto(merged, customs.Count + officialTotal, offset, limit, online);
    }

    /// <summary>Resolves specific monsters (e.g. the contents of a DM collection) in the order given.</summary>
    public static async Task<BestiaryPageDto> ListByKeysAsync(LoomWeaverMySqlRepository mysql, long viewerId, IReadOnlyList<string> keys, CancellationToken ct)
    {
        var found = new Dictionary<string, BestiaryMonsterSummaryDto>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in keys.Where(k => k.StartsWith("cm-", StringComparison.OrdinalIgnoreCase)))
            if (BestiaryCreatorStore.FindVisible(key, viewerId) is { } c) found[key] = BestiaryCreatorStore.Summarize(c, viewerId);
        foreach (var seed in BestiarySeedCatalog.All.Where(s => keys.Contains(s.Summary.Key, StringComparer.OrdinalIgnoreCase)))
            found[seed.Summary.Key] = seed.Summary;

        var ids = keys
            .Where(k => k.StartsWith("off-", StringComparison.OrdinalIgnoreCase) && !k.StartsWith("off-seed-", StringComparison.OrdinalIgnoreCase))
            .Select(k => long.TryParse(k[4..], out var id) ? id : -1)
            .Where(id => id > 0)
            .Distinct()
            .Take(500)
            .ToList();
        var online = true;
        if (ids.Count > 0)
        {
            try
            {
                await using var conn = await mysql.OpenConnectionAsync(ct);
                var names = ids.Select((_, i) => $"@id{i}").ToList();
                await using var cmd = new MySqlCommand($"SELECT {SummaryColumns} FROM dnd_monster_library WHERE {OfficialVisibility} AND id IN ({string.Join(",", names)});", conn);
                for (var i = 0; i < ids.Count; i++) cmd.Parameters.AddWithValue(names[i], ids[i]);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var s = ReadSummary(r);
                    found[s.Key] = s;
                }
            }
            catch
            {
                online = false;
            }
        }

        var ordered = keys.Where(found.ContainsKey).Select(k => found[k]).ToList();
        return new BestiaryPageDto(ordered, ordered.Count, 0, ordered.Count, online);
    }

    public static async Task<BestiaryMonsterDetailDto?> GetDetailAsync(LoomWeaverMySqlRepository mysql, string key, long viewerId, CancellationToken ct)
    {
        if (key.StartsWith("cm-", StringComparison.OrdinalIgnoreCase))
        {
            var custom = BestiaryCreatorStore.FindVisible(key, viewerId);
            return custom is null ? null : BestiaryDetailFactory.FromCustom(BestiaryCreatorStore.Summarize(custom, viewerId), custom.Statblock, custom.CreatedAt);
        }

        if (key.StartsWith("off-seed-", StringComparison.OrdinalIgnoreCase))
        {
            var seed = BestiarySeedCatalog.All.FirstOrDefault(s => s.Summary.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
            return seed is null ? null : BestiaryDetailFactory.FromRawJson(seed.Summary, seed.RawJson);
        }

        if (!key.StartsWith("off-", StringComparison.OrdinalIgnoreCase) || !long.TryParse(key[4..], out var id)) return null;
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand($"SELECT {SummaryColumns}, raw_json FROM dnd_monster_library WHERE {OfficialVisibility} AND id = @id LIMIT 1;", conn);
            cmd.Parameters.AddWithValue("@id", id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return null;
            var summary = ReadSummary(r);
            return BestiaryDetailFactory.FromRawJson(summary, BestiaryPersistence.ReadString(r, "raw_json"));
        }
        catch
        {
            return null;
        }
    }

    private static async Task<(List<BestiaryMonsterSummaryDto> Items, int Total, bool Online)> QueryOfficialAsync(
        LoomWeaverMySqlRepository mysql, BestiaryListQuery q, int offset, int take, CancellationToken ct)
    {
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            var where = new List<string> { OfficialVisibility, "name IS NOT NULL" };
            void Bind(MySqlCommand c)
            {
                if (!string.IsNullOrWhiteSpace(q.Search)) c.Parameters.AddWithValue("@like", $"%{q.Search.Trim()}%");
                if (!string.IsNullOrWhiteSpace(q.Type) && q.Type != "all") c.Parameters.AddWithValue("@type", q.Type.Trim().ToLowerInvariant());
                if (q.CrMin is not null) c.Parameters.AddWithValue("@crMin", q.CrMin.Value);
                if (q.CrMax is not null) c.Parameters.AddWithValue("@crMax", q.CrMax.Value);
            }
            if (!string.IsNullOrWhiteSpace(q.Search)) where.Add("(name LIKE @like OR type_main LIKE @like OR source_id LIKE @like)");
            if (!string.IsNullOrWhiteSpace(q.Type) && q.Type != "all") where.Add("LOWER(type_main) = @type");
            if (q.CrMin is not null) where.Add($"{CrExpr} >= @crMin");
            if (q.CrMax is not null) where.Add($"{CrExpr} <= @crMax");
            var whereSql = "WHERE " + string.Join(" AND ", where);

            int total;
            await using (var countCmd = new MySqlCommand($"SELECT COUNT(*) FROM dnd_monster_library {whereSql};", conn))
            {
                Bind(countCmd);
                total = Convert.ToInt32(await countCmd.ExecuteScalarAsync(ct));
            }

            var items = new List<BestiaryMonsterSummaryDto>();
            if (take > 0)
            {
                var order = (q.Sort ?? "name").ToLowerInvariant() switch
                {
                    "name-desc" => "name DESC",
                    "cr" => $"{CrExpr} ASC, name ASC",
                    "cr-desc" => $"{CrExpr} DESC, name ASC",
                    _ => "name ASC, source_id ASC"
                };
                await using var cmd = new MySqlCommand(
                    $"SELECT {SummaryColumns} FROM dnd_monster_library {whereSql} ORDER BY {order} LIMIT {take} OFFSET {offset};", conn);
                Bind(cmd);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct)) items.Add(ReadSummary(r));
            }
            return (items, total, true);
        }
        catch
        {
            var seeds = Sort(BestiarySeedCatalog.All.Select(s => s.Summary).Where(s => Matches(s, q)), q.Sort).ToList();
            return (seeds.Skip(offset).Take(Math.Max(0, take)).ToList(), seeds.Count, false);
        }
    }

    private static BestiaryMonsterSummaryDto ReadSummary(MySqlDataReader r)
    {
        string? S(string c) => BestiaryPersistence.ReadString(r, c);
        static System.Text.Json.JsonElement Parse(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return default;
            try { return System.Text.Json.JsonDocument.Parse(json).RootElement.Clone(); }
            catch { return default; }
        }

        var cr = S("cr_text") ?? "0";
        var size = BestiaryStatblockMapper.SizeLabel(S("size_code"));
        var typeJson = Parse(S("type_json"));
        var type = typeJson.ValueKind == default ? (S("type_main") ?? "creature") : BestiaryStatblockMapper.TypeFromJson(typeJson);
        var alignment = BestiaryStatblockMapper.AlignmentFromJson(Parse(S("alignment_json")));
        var (ac, _) = BestiaryStatblockMapper.ArmorClassFromJson(Parse(S("ac_json")));
        var hp = int.TryParse(S("hp_avg"), out var h) ? h : 0;
        var action0 = S("action0");
        var signatureAction = string.Equals(action0, "Multiattack", StringComparison.OrdinalIgnoreCase) ? S("action1") : action0;

        return new BestiaryMonsterSummaryDto(
            $"off-{Convert.ToInt64(r["id"])}",
            S("name") ?? "Unknown Creature",
            S("image_path") ?? "",
            S("token_url") ?? "",
            BestiaryDetailFactory.BuildShortDescription(size, type, alignment, S("trait0"), signatureAction),
            cr,
            BestiaryStatblockMapper.CrToNumber(cr),
            type,
            size,
            S("source_id") ?? "MM",
            ac,
            hp,
            false,
            true,
            null,
            false);
    }

    private static bool Matches(BestiaryMonsterSummaryDto m, BestiaryListQuery q)
    {
        if (!string.IsNullOrWhiteSpace(q.Search) &&
            !m.Name.Contains(q.Search.Trim(), StringComparison.OrdinalIgnoreCase) &&
            !m.CreatureType.Contains(q.Search.Trim(), StringComparison.OrdinalIgnoreCase) &&
            !(m.CreatorUsername ?? "").Contains(q.Search.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
        if (!string.IsNullOrWhiteSpace(q.Type) && q.Type != "all" &&
            !m.CreatureType.StartsWith(q.Type.Trim(), StringComparison.OrdinalIgnoreCase)) return false;
        if (q.CrMin is not null && m.CrValue < q.CrMin) return false;
        if (q.CrMax is not null && m.CrValue > q.CrMax) return false;
        return true;
    }

    private static IEnumerable<BestiaryMonsterSummaryDto> Sort(IEnumerable<BestiaryMonsterSummaryDto> list, string? sort) =>
        (sort ?? "name").ToLowerInvariant() switch
        {
            "name-desc" => list.OrderByDescending(m => m.Name),
            "cr" => list.OrderBy(m => m.CrValue).ThenBy(m => m.Name),
            "cr-desc" => list.OrderByDescending(m => m.CrValue).ThenBy(m => m.Name),
            _ => list.OrderBy(m => m.Name)
        };
}
