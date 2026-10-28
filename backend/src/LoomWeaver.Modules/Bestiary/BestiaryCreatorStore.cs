using System.Text.Json;
using System.Text.RegularExpressions;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Bestiary;

public sealed record CustomMonsterRecord(
    string Key, long CreatorUserId, string CreatorUsername, SaveCustomMonsterRequest Statblock,
    bool IsPublished, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record MonsterCollectionRecord(
    string Id, long OwnerUserId, string OwnerUsername, string Name, string Description,
    IReadOnlyList<int> CampaignIds, IReadOnlyList<string> MonsterKeys, DateTimeOffset UpdatedAt);

/// <summary>
/// User-owned bestiary content: custom monsters (any user may create and publish, always free) and DM monster collections.
/// Ownership is account based; campaign assignment of collections is validated by the caller (campaign GM only).
/// </summary>
public static partial class BestiaryCreatorStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly object Sync = new();
    private static readonly Dictionary<string, CustomMonsterRecord> Customs = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, MonsterCollectionRecord> Collections = new(StringComparer.OrdinalIgnoreCase);

    public static readonly IReadOnlySet<string> AllowedCr = new HashSet<string>(
        new[] { "0", "1/8", "1/4", "1/2" }.Concat(Enumerable.Range(1, 30).Select(i => i.ToString())));

    // ---------- Custom monsters ----------

    public static IReadOnlyList<CustomMonsterRecord> VisibleCustoms(long viewerId)
    {
        lock (Sync)
        {
            return Customs.Values
                .Where(c => c.IsPublished || c.CreatorUserId == viewerId)
                .OrderByDescending(c => c.UpdatedAt)
                .ToList();
        }
    }

    public static CustomMonsterRecord? FindVisible(string key, long viewerId)
    {
        lock (Sync)
        {
            return Customs.TryGetValue(key, out var c) && (c.IsPublished || c.CreatorUserId == viewerId) ? c : null;
        }
    }

    public static BestiaryMonsterSummaryDto Summarize(CustomMonsterRecord c, long viewerId)
    {
        var s = c.Statblock;
        var size = string.IsNullOrWhiteSpace(s.Size) ? "Medium" : s.Size!.Trim();
        var type = string.IsNullOrWhiteSpace(s.CreatureType) ? "monstrosity" : s.CreatureType!.Trim();
        var shortText = string.IsNullOrWhiteSpace(s.ShortDescription)
            ? BestiaryDetailFactory.BuildShortDescription(size, type, s.Alignment ?? "unaligned",
                s.Traits?.FirstOrDefault()?.Name, s.Actions?.FirstOrDefault()?.Name)
            : s.ShortDescription!.Trim();
        var cr = s.ChallengeRating ?? "0";
        return new BestiaryMonsterSummaryDto(
            c.Key, s.Name ?? "Unnamed Creature", s.ImageUrl ?? "", "", shortText, cr,
            BestiaryStatblockMapper.CrToNumber(cr), type, size, "Homebrew", s.ArmorClass, s.HitPoints,
            true, c.IsPublished, c.CreatorUsername, c.CreatorUserId == viewerId);
    }

    public static async Task<(CustomMonsterRecord? Record, string? Error)> SaveCustomAsync(
        LoomWeaverMySqlRepository mysql, long userId, string username, string? existingKey,
        SaveCustomMonsterRequest req, CancellationToken ct)
    {
        var (clean, error) = Validate(req);
        if (clean is null) return (null, error);

        CustomMonsterRecord record;
        lock (Sync)
        {
            if (existingKey is not null)
            {
                if (!Customs.TryGetValue(existingKey, out var current)) return (null, "Custom monster not found.");
                if (current.CreatorUserId != userId) return (null, "Only the creator can edit this custom monster.");
                record = current with
                {
                    Statblock = clean,
                    IsPublished = current.IsPublished || clean.PublishToMarket,
                    UpdatedAt = DateTimeOffset.UtcNow
                };
            }
            else
            {
                record = new CustomMonsterRecord(
                    $"cm-{Guid.NewGuid():N}"[..19], userId, username, clean, clean.PublishToMarket,
                    DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);
            }
        }

        await PersistCustomAsync(mysql, record, ct);
        lock (Sync) Customs[record.Key] = record;
        return (record, null);
    }

    public static async Task<(CustomMonsterRecord? Record, string? Error)> PublishAsync(
        LoomWeaverMySqlRepository mysql, long userId, string key, CancellationToken ct)
    {
        CustomMonsterRecord record;
        lock (Sync)
        {
            if (!Customs.TryGetValue(key, out var current)) return (null, "Custom monster not found.");
            if (current.CreatorUserId != userId) return (null, "Only the creator can publish this custom monster.");
            record = current with { IsPublished = true, UpdatedAt = DateTimeOffset.UtcNow };
        }
        await PersistCustomAsync(mysql, record, ct);
        lock (Sync) Customs[record.Key] = record;
        return (record, null);
    }

    private static Task<bool> PersistCustomAsync(LoomWeaverMySqlRepository mysql, CustomMonsterRecord r, CancellationToken ct) =>
        BestiaryPersistence.ExecuteAsync(mysql, new[]
        {
            BestiaryPersistence.Stmt("""
                INSERT INTO lw_custom_monsters (monster_key, creator_user_id, creator_username, name, challenge_rating,
                    creature_type, is_published, price_cents, statblock_json, created_at)
                VALUES (@k, @uid, @uname, @name, @cr, @type, @pub, 0, @json, @created)
                ON DUPLICATE KEY UPDATE name = @name, challenge_rating = @cr, creature_type = @type,
                    is_published = @pub, price_cents = 0, statblock_json = @json;
                """,
                ("@k", r.Key), ("@uid", r.CreatorUserId), ("@uname", r.CreatorUsername), ("@name", r.Statblock.Name),
                ("@cr", r.Statblock.ChallengeRating), ("@type", r.Statblock.CreatureType ?? "monstrosity"),
                ("@pub", r.IsPublished), ("@json", JsonSerializer.Serialize(r.Statblock, Json)), ("@created", r.CreatedAt.UtcDateTime))
        }, ct);

    private static (SaveCustomMonsterRequest? Clean, string? Error) Validate(SaveCustomMonsterRequest req)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length is < 2 or > 160) return (null, "Monster name must be between 2 and 160 characters.");
        var cr = (req.ChallengeRating ?? "1").Trim();
        if (!AllowedCr.Contains(cr)) return (null, "Challenge rating must be 0, 1/8, 1/4, 1/2, or 1-30.");
        var image = (req.ImageUrl ?? "").Trim();
        if (!BestiaryAccessPolicy.IsSafeAssetUrl(image)) return (null, "Image must be a site-relative path or an https URL.");

        static int Score(int v) => Math.Clamp(v <= 0 ? 10 : v, 1, 30);
        static string? Txt(string? v, int max) => string.IsNullOrWhiteSpace(v) ? null : v.Trim()[..Math.Min(v.Trim().Length, max)];
        static IReadOnlyList<BestiaryFeatureDto> Features(IReadOnlyList<BestiaryFeatureDto>? list) =>
            (list ?? Array.Empty<BestiaryFeatureDto>())
                .Where(f => !string.IsNullOrWhiteSpace(f.Name) || !string.IsNullOrWhiteSpace(f.Text))
                .Take(20)
                .Select(f => new BestiaryFeatureDto(Txt(f.Name, 120) ?? "Feature", Txt(f.Text, 2000) ?? ""))
                .ToList();

        var clean = req with
        {
            Name = name, ChallengeRating = cr, ImageUrl = image.Length > 0 ? image : null,
            ShortDescription = Txt(req.ShortDescription, 280), LoreText = Txt(req.LoreText, 4000),
            Size = Txt(req.Size, 20) ?? "Medium", CreatureType = Txt(req.CreatureType, 60) ?? "monstrosity",
            Alignment = Txt(req.Alignment, 60) ?? "unaligned",
            ArmorClass = Math.Clamp(req.ArmorClass <= 0 ? 10 : req.ArmorClass, 1, 30), ArmorClassNote = Txt(req.ArmorClassNote, 80),
            HitPoints = Math.Clamp(req.HitPoints <= 0 ? 1 : req.HitPoints, 1, 2000), HitDice = Txt(req.HitDice, 40),
            Speed = Txt(req.Speed, 120), Str = Score(req.Str), Dex = Score(req.Dex), Con = Score(req.Con),
            Int = Score(req.Int), Wis = Score(req.Wis), Cha = Score(req.Cha),
            SavingThrows = Txt(req.SavingThrows, 160), Skills = Txt(req.Skills, 200),
            DamageResistances = Txt(req.DamageResistances, 200), DamageImmunities = Txt(req.DamageImmunities, 200),
            ConditionImmunities = Txt(req.ConditionImmunities, 200), Senses = Txt(req.Senses, 200), Languages = Txt(req.Languages, 200),
            Traits = Features(req.Traits), Actions = Features(req.Actions), BonusActions = Features(req.BonusActions),
            Reactions = Features(req.Reactions), LegendaryActions = Features(req.LegendaryActions)
        };
        return (clean, null);
    }

    [GeneratedRegex(@"^(/[A-Za-z0-9_\-./%() ]+|https://[^\s""'<>]+)$")]
    private static partial Regex SafeAssetUrlRegex();

    // ---------- DM collections ----------

    public static IReadOnlyList<MonsterCollectionRecord> OwnedCollections(long ownerId)
    {
        lock (Sync)
        {
            return Collections.Values.Where(c => c.OwnerUserId == ownerId).OrderBy(c => c.Name).ToList();
        }
    }

    public static MonsterCollectionDto ToDto(MonsterCollectionRecord c) =>
        new(c.Id, c.Name, c.Description, c.OwnerUsername, c.CampaignIds, c.MonsterKeys, c.UpdatedAt);

    public static async Task<(MonsterCollectionRecord? Record, string? Error)> SaveCollectionAsync(
        LoomWeaverMySqlRepository mysql, long userId, string username, string? existingId,
        SaveMonsterCollectionRequest req, Func<int, bool> canAssignCampaign, CancellationToken ct)
    {
        var name = (req.Name ?? "").Trim();
        if (name.Length is < 2 or > 140) return (null, "Collection name must be between 2 and 140 characters.");
        var campaigns = (req.AssignedCampaignIds ?? Array.Empty<int>()).Distinct().ToList();
        if (campaigns.Any(id => !canAssignCampaign(id)))
            return (null, "Collections can only be assigned to campaigns where you are the DM.");
        var keys = (req.MonsterKeys ?? Array.Empty<string>())
            .Where(k => !string.IsNullOrWhiteSpace(k) && k.Length <= 64)
            .Select(k => k.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(500)
            .ToList();

        MonsterCollectionRecord record;
        lock (Sync)
        {
            if (existingId is not null)
            {
                if (!Collections.TryGetValue(existingId, out var current)) return (null, "Collection not found.");
                if (current.OwnerUserId != userId) return (null, "Only the DM who owns this collection can edit it.");
            }
            record = new MonsterCollectionRecord(
                existingId ?? $"mcol-{Guid.NewGuid():N}"[..21], userId, username, name,
                (req.Description ?? "").Trim() is { Length: > 600 } d ? d[..600] : (req.Description ?? "").Trim(),
                campaigns, keys, DateTimeOffset.UtcNow);
        }

        var statements = new List<(string, IReadOnlyDictionary<string, object?>)>
        {
            BestiaryPersistence.Stmt("""
                INSERT INTO lw_monster_collections (collection_id, owner_user_id, owner_username, name, description)
                VALUES (@id, @uid, @uname, @name, @desc)
                ON DUPLICATE KEY UPDATE name = @name, description = @desc;
                """, ("@id", record.Id), ("@uid", userId), ("@uname", username), ("@name", record.Name), ("@desc", record.Description)),
            BestiaryPersistence.Stmt("DELETE FROM lw_monster_collection_campaigns WHERE collection_id = @id;", ("@id", record.Id)),
            BestiaryPersistence.Stmt("DELETE FROM lw_monster_collection_entries WHERE collection_id = @id;", ("@id", record.Id))
        };
        statements.AddRange(campaigns.Select(cid => BestiaryPersistence.Stmt(
            "INSERT INTO lw_monster_collection_campaigns (collection_id, campaign_id) VALUES (@id, @cid);", ("@id", record.Id), ("@cid", cid))));
        statements.AddRange(keys.Select((k, i) => BestiaryPersistence.Stmt(
            "INSERT INTO lw_monster_collection_entries (collection_id, monster_key, sort_order) VALUES (@id, @k, @o);",
            ("@id", record.Id), ("@k", k), ("@o", i))));
        await BestiaryPersistence.ExecuteAsync(mysql, statements, ct);
        lock (Sync) Collections[record.Id] = record;
        return (record, null);
    }

    public static async Task<string?> DeleteCollectionAsync(LoomWeaverMySqlRepository mysql, long userId, string id, CancellationToken ct)
    {
        lock (Sync)
        {
            if (!Collections.TryGetValue(id, out var current)) return "Collection not found.";
            if (current.OwnerUserId != userId) return "Only the DM who owns this collection can delete it.";
        }
        await BestiaryPersistence.ExecuteAsync(mysql, new[]
        {
            BestiaryPersistence.Stmt("DELETE FROM lw_monster_collection_entries WHERE collection_id = @id;", ("@id", id)),
            BestiaryPersistence.Stmt("DELETE FROM lw_monster_collection_campaigns WHERE collection_id = @id;", ("@id", id)),
            BestiaryPersistence.Stmt("DELETE FROM lw_monster_collections WHERE collection_id = @id;", ("@id", id))
        }, ct);
        lock (Sync) Collections.Remove(id);
        return null;
    }

    // ---------- Startup load ----------

    public static async Task LoadAsync(MySqlConnection conn, CancellationToken ct)
    {
        var customs = new List<CustomMonsterRecord>();
        await using (var cmd = new MySqlCommand("SELECT * FROM lw_custom_monsters;", conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                var statblock = JsonSerializer.Deserialize<SaveCustomMonsterRequest>(BestiaryPersistence.ReadString(r, "statblock_json") ?? "{}", Json);
                if (statblock is null) continue;
                customs.Add(new CustomMonsterRecord(
                    BestiaryPersistence.ReadString(r, "monster_key")!, Convert.ToInt64(r["creator_user_id"]),
                    BestiaryPersistence.ReadString(r, "creator_username") ?? "Unknown", statblock,
                    Convert.ToBoolean(r["is_published"]), BestiaryPersistence.ReadDate(r, "created_at"), BestiaryPersistence.ReadDate(r, "updated_at")));
            }
        }

        var heads = new List<(string Id, long Owner, string Username, string Name, string Desc, DateTimeOffset Updated)>();
        await using (var cmd = new MySqlCommand("SELECT * FROM lw_monster_collections;", conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
                heads.Add((BestiaryPersistence.ReadString(r, "collection_id")!, Convert.ToInt64(r["owner_user_id"]),
                    BestiaryPersistence.ReadString(r, "owner_username") ?? "", BestiaryPersistence.ReadString(r, "name") ?? "",
                    BestiaryPersistence.ReadString(r, "description") ?? "", BestiaryPersistence.ReadDate(r, "updated_at")));
        }

        var campaignLinks = await ReadPairsAsync(conn, "SELECT collection_id, campaign_id FROM lw_monster_collection_campaigns;", ct);
        var entryLinks = await ReadPairsAsync(conn, "SELECT collection_id, monster_key FROM lw_monster_collection_entries ORDER BY sort_order;", ct);

        lock (Sync)
        {
            Customs.Clear();
            Collections.Clear();
            foreach (var c in customs) Customs[c.Key] = c;
            foreach (var h in heads)
            {
                Collections[h.Id] = new MonsterCollectionRecord(h.Id, h.Owner, h.Username, h.Name, h.Desc,
                    campaignLinks.Where(p => p.A == h.Id).Select(p => int.Parse(p.B)).ToList(),
                    entryLinks.Where(p => p.A == h.Id).Select(p => p.B).ToList(), h.Updated);
            }
        }
    }

    private static async Task<List<(string A, string B)>> ReadPairsAsync(MySqlConnection conn, string sql, CancellationToken ct)
    {
        var list = new List<(string, string)>();
        await using var cmd = new MySqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add((Convert.ToString(r.GetValue(0))!, Convert.ToString(r.GetValue(1))!));
        return list;
    }
}
