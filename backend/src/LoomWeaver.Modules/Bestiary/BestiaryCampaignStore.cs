using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Bestiary;

/// <summary>
/// Campaign-scoped bestiary state. Token/3D assignments and campaign/session/encounter placements are DM prep data
/// (never returned to players). Monster sightings are Loom canon: when and where the party met a creature and what
/// happened (defeated, killed, saved, befriended, ...), filtered per player character on the server.
/// </summary>
public static class BestiaryCampaignStore
{
    public static readonly IReadOnlyList<string> Outcomes = new[]
    {
        "encountered", "observed", "fought", "defeated", "killed", "fled", "escaped", "captured",
        "spared", "saved", "befriended", "allied", "negotiated", "recruited", "tamed", "betrayed"
    };

    public static readonly IReadOnlyList<string> Scopes = new[] { "campaign", "session", "encounter" };

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly object Sync = new();
    private static readonly Dictionary<(int, string), CampaignMonsterAssignmentDto> Assignments = new();
    private static readonly List<CampaignMonsterPlacementDto> Placements = new();
    private static readonly List<MonsterSightingDto> Sightings = new();

    // ---------- DM-only prep data ----------

    public static IReadOnlyList<CampaignMonsterAssignmentDto> AssignmentsFor(int campaignId)
    {
        lock (Sync) return Assignments.Values.Where(a => a.CampaignId == campaignId).ToList();
    }

    public static IReadOnlyList<CampaignMonsterPlacementDto> PlacementsFor(int campaignId)
    {
        lock (Sync) return Placements.Where(p => p.CampaignId == campaignId).OrderByDescending(p => p.AddedAt).ToList();
    }

    public static async Task<CampaignMonsterAssignmentDto> SaveAssignmentAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, string monsterKey, SaveMonsterAssignmentRequest req,
        long userId, string username, CancellationToken ct)
    {
        static string? Url(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
        if (new[] { req.PrimaryTokenUrl, req.SecondaryTokenUrl, req.PrimaryModelUrl, req.SecondaryModelUrl }
            .Any(url => !BestiaryAccessPolicy.IsSafeAssetUrl(url)))
            throw new Microsoft.AspNetCore.Http.BadHttpRequestException("Asset URLs must be site-relative paths or HTTPS URLs.");

        var dto = new CampaignMonsterAssignmentDto(campaignId, monsterKey, Url(req.PrimaryTokenUrl), Url(req.SecondaryTokenUrl),
            Url(req.PrimaryModelUrl), Url(req.SecondaryModelUrl), username, DateTimeOffset.UtcNow);

        await BestiaryPersistence.ExecuteAsync(mysql, new[]
        {
            BestiaryPersistence.Stmt("""
                INSERT INTO lw_campaign_monster_assets (campaign_id, monster_key, primary_token_url, secondary_token_url,
                    primary_model_url, secondary_model_url, updated_by_user_id, updated_by_username)
                VALUES (@c, @k, @pt, @st, @pm, @sm, @uid, @uname)
                ON DUPLICATE KEY UPDATE primary_token_url = @pt, secondary_token_url = @st, primary_model_url = @pm,
                    secondary_model_url = @sm, updated_by_user_id = @uid, updated_by_username = @uname;
                """,
                ("@c", campaignId), ("@k", monsterKey), ("@pt", dto.PrimaryTokenUrl), ("@st", dto.SecondaryTokenUrl),
                ("@pm", dto.PrimaryModelUrl), ("@sm", dto.SecondaryModelUrl), ("@uid", userId), ("@uname", username))
        }, ct);
        lock (Sync) Assignments[(campaignId, monsterKey)] = dto;
        return dto;
    }

    public static async Task<(CampaignMonsterPlacementDto? Placement, string? Error)> AddPlacementAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, AddMonsterPlacementRequest req, string username, CancellationToken ct)
    {
        var key = (req.MonsterKey ?? "").Trim();
        var scope = (req.Scope ?? "campaign").Trim().ToLowerInvariant();
        if (key.Length is 0 or > 64) return (null, "A monster is required.");
        if (!Scopes.Contains(scope)) return (null, "Scope must be campaign, session, or encounter.");
        if (scope == "session" && string.IsNullOrWhiteSpace(req.SessionId)) return (null, "Choose a session.");
        if (scope == "encounter" && string.IsNullOrWhiteSpace(req.EncounterId)) return (null, "Choose an encounter.");

        var dto = new CampaignMonsterPlacementDto(
            $"mpl-{Guid.NewGuid():N}"[..20], campaignId, key, Trim(req.MonsterName, 160) ?? key, scope,
            Trim(req.SessionId, 64), Trim(req.SessionLabel, 200), Trim(req.EncounterId, 64), Trim(req.EncounterLabel, 200),
            Math.Clamp(req.Count ?? 1, 1, 50), username, DateTimeOffset.UtcNow);

        await BestiaryPersistence.ExecuteAsync(mysql, new[]
        {
            BestiaryPersistence.Stmt("""
                INSERT INTO lw_campaign_monster_placements (placement_id, campaign_id, monster_key, monster_name, scope,
                    session_id, session_label, encounter_id, encounter_label, quantity, added_by_username, added_at)
                VALUES (@id, @c, @k, @n, @s, @sid, @sl, @eid, @el, @q, @u, @at);
                """,
                ("@id", dto.Id), ("@c", campaignId), ("@k", key), ("@n", dto.MonsterName), ("@s", scope),
                ("@sid", dto.SessionId), ("@sl", dto.SessionLabel), ("@eid", dto.EncounterId), ("@el", dto.EncounterLabel),
                ("@q", dto.Count), ("@u", username), ("@at", dto.AddedAt.UtcDateTime))
        }, ct);
        lock (Sync) Placements.Add(dto);
        return (dto, null);
    }

    public static async Task<bool> RemovePlacementAsync(LoomWeaverMySqlRepository mysql, int campaignId, string placementId, CancellationToken ct)
    {
        int removed;
        lock (Sync) removed = Placements.Count(p => p.CampaignId == campaignId && p.Id == placementId);
        if (removed == 0) return false;
        await BestiaryPersistence.ExecuteAsync(mysql, new[]
        {
            BestiaryPersistence.Stmt("DELETE FROM lw_campaign_monster_placements WHERE campaign_id = @c AND placement_id = @id;",
                ("@c", campaignId), ("@id", placementId))
        }, ct);
        lock (Sync) Placements.RemoveAll(p => p.CampaignId == campaignId && p.Id == placementId);
        return true;
    }

    // ---------- Loom canon: monster sightings ----------

    /// <summary>GM sees every sighting; players see party-wide records and records their own character witnessed.</summary>
    public static IReadOnlyList<MonsterSightingDto> SightingsVisibleTo(int campaignId, bool isGm, string boundCharacterKey, string? monsterKey = null)
    {
        var me = NormalizeCharacter(boundCharacterKey);
        lock (Sync)
        {
            return Sightings
                .Where(s => s.CampaignId == campaignId)
                .Where(s => monsterKey is null || string.Equals(s.MonsterKey, monsterKey, StringComparison.OrdinalIgnoreCase))
                .Where(s => BestiaryAccessPolicy.CanReadSighting(s, isGm, me))
                .OrderByDescending(s => s.OccurredAt)
                .ToList();
        }
    }

    public static async Task<(MonsterSightingDto? Sighting, string? Error)> RecordSightingAsync(
        LoomWeaverMySqlRepository mysql, int campaignId, RecordMonsterSightingRequest req, string username, CancellationToken ct)
    {
        var key = (req.MonsterKey ?? "").Trim();
        var outcome = (req.Outcome ?? "encountered").Trim().ToLowerInvariant();
        var visibility = (req.Visibility ?? "party").Trim().ToLowerInvariant();
        if (key.Length is 0 or > 64) return (null, "A monster is required.");
        if (!Outcomes.Contains(outcome)) return (null, $"Outcome must be one of: {string.Join(", ", Outcomes)}.");
        if (visibility is not ("party" or "witnesses" or "gm")) return (null, "Visibility must be party, witnesses, or gm.");

        var witnesses = (req.WitnessCharacterKeys ?? Array.Empty<string>())
            .Where(w => !string.IsNullOrWhiteSpace(w)).Select(w => w.Trim()[..Math.Min(w.Trim().Length, 64)])
            .Distinct(StringComparer.OrdinalIgnoreCase).Take(12).ToList();
        if (visibility == "witnesses" && witnesses.Count == 0) return (null, "Choose at least one witnessing character.");

        var dto = new MonsterSightingDto(
            $"msi-{Guid.NewGuid():N}"[..20], campaignId, key, Trim(req.MonsterName, 160) ?? key, outcome,
            Trim(req.SessionId, 64), Trim(req.SessionLabel, 200), Trim(req.LocationName, 200),
            Trim(req.EncounterId, 64), Trim(req.EncounterLabel, 200), witnesses, visibility, Trim(req.Notes, 1000),
            req.OccurredAt ?? DateTimeOffset.UtcNow, username);

        await BestiaryPersistence.ExecuteAsync(mysql, new[]
        {
            BestiaryPersistence.Stmt("""
                INSERT INTO lw_monster_sightings (sighting_id, campaign_id, monster_key, monster_name, outcome, session_id,
                    session_label, location_name, encounter_id, encounter_label, witness_keys_json, visibility, notes,
                    occurred_at, recorded_by_username)
                VALUES (@id, @c, @k, @n, @o, @sid, @sl, @loc, @eid, @el, @w, @v, @notes, @at, @u);
                """,
                ("@id", dto.Id), ("@c", campaignId), ("@k", key), ("@n", dto.MonsterName), ("@o", outcome),
                ("@sid", dto.SessionId), ("@sl", dto.SessionLabel), ("@loc", dto.LocationName), ("@eid", dto.EncounterId),
                ("@el", dto.EncounterLabel), ("@w", JsonSerializer.Serialize(witnesses, Json)), ("@v", visibility),
                ("@notes", dto.Notes), ("@at", dto.OccurredAt.UtcDateTime), ("@u", username))
        }, ct);
        lock (Sync) Sightings.Add(dto);
        return (dto, null);
    }

    /// <summary>Authorized Loom citations for monster sightings whose name or outcome matches the question.</summary>
    public static IReadOnlyList<LoomCitationDto> LoomCitations(int campaignId, bool isGm, string boundCharacterKey, string query, int take = 4)
    {
        var q = (query ?? "").Trim();
        if (q.Length < 3) return Array.Empty<LoomCitationDto>();
        return SightingsVisibleTo(campaignId, isGm, boundCharacterKey)
            .Where(s => q.Contains(s.MonsterName, StringComparison.OrdinalIgnoreCase) ||
                        s.MonsterName.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                        q.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                            .Any(word => word.Length > 3 && s.MonsterName.Contains(word, StringComparison.OrdinalIgnoreCase)))
            .Take(take)
            .Select(s => new LoomCitationDto(
                $"{campaignId}:MonsterSighting:{s.Id}",
                $"{s.MonsterName} - {char.ToUpperInvariant(s.Outcome[0])}{s.Outcome[1..]}",
                "Monster",
                $"{(s.SessionLabel ?? "Unlogged session")}{(s.LocationName is null ? "" : $" at {s.LocationName}")}: the party {s.Outcome} {s.MonsterName}{(s.EncounterLabel is null ? "" : $" during {s.EncounterLabel}")}.{(s.Notes is null ? "" : $" {s.Notes}")}",
                $"/bestiary?monster={Uri.EscapeDataString(s.MonsterKey)}",
                s.Visibility == "gm" ? "gm" : "players"))
            .ToList();
    }

    public static string NormalizeCharacter(string? key)
    {
        var k = (key ?? "").Trim().ToLowerInvariant();
        var colon = k.LastIndexOf(':');
        if (colon >= 0) k = k[(colon + 1)..];
        foreach (var prefix in new[] { "pc-", "char-", "npc-" })
            if (k.StartsWith(prefix)) return k[prefix.Length..];
        return k;
    }

    private static string? Trim(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, max)];

    // ---------- Startup load ----------

    public static async Task LoadAsync(MySqlConnection conn, CancellationToken ct)
    {
        var assignments = new List<CampaignMonsterAssignmentDto>();
        var placements = new List<CampaignMonsterPlacementDto>();
        var sightings = new List<MonsterSightingDto>();
        string? S(MySqlDataReader r, string c) => BestiaryPersistence.ReadString(r, c);

        await using (var cmd = new MySqlCommand("SELECT * FROM lw_campaign_monster_assets;", conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct))
                assignments.Add(new CampaignMonsterAssignmentDto(Convert.ToInt32(r["campaign_id"]), S(r, "monster_key")!,
                    S(r, "primary_token_url"), S(r, "secondary_token_url"), S(r, "primary_model_url"), S(r, "secondary_model_url"),
                    S(r, "updated_by_username") ?? "", BestiaryPersistence.ReadDate(r, "updated_at")));

        await using (var cmd = new MySqlCommand("SELECT * FROM lw_campaign_monster_placements;", conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct))
                placements.Add(new CampaignMonsterPlacementDto(S(r, "placement_id")!, Convert.ToInt32(r["campaign_id"]),
                    S(r, "monster_key")!, S(r, "monster_name") ?? "", S(r, "scope") ?? "campaign", S(r, "session_id"),
                    S(r, "session_label"), S(r, "encounter_id"), S(r, "encounter_label"), Convert.ToInt32(r["quantity"]),
                    S(r, "added_by_username") ?? "", BestiaryPersistence.ReadDate(r, "added_at")));

        await using (var cmd = new MySqlCommand("SELECT * FROM lw_monster_sightings;", conn))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct))
                sightings.Add(new MonsterSightingDto(S(r, "sighting_id")!, Convert.ToInt32(r["campaign_id"]), S(r, "monster_key")!,
                    S(r, "monster_name") ?? "", S(r, "outcome") ?? "encountered", S(r, "session_id"), S(r, "session_label"),
                    S(r, "location_name"), S(r, "encounter_id"), S(r, "encounter_label"),
                    JsonSerializer.Deserialize<List<string>>(S(r, "witness_keys_json") ?? "[]", Json) ?? new List<string>(),
                    S(r, "visibility") ?? "party", S(r, "notes"), BestiaryPersistence.ReadDate(r, "occurred_at"),
                    S(r, "recorded_by_username") ?? ""));

        lock (Sync)
        {
            Assignments.Clear();
            Placements.Clear();
            Sightings.Clear();
            foreach (var a in assignments) Assignments[(a.CampaignId, a.MonsterKey)] = a;
            Placements.RemoveAll(p => placements.Any(x => x.Id == p.Id));
            Placements.AddRange(placements);
            Sightings.RemoveAll(s => sightings.Any(x => x.Id == s.Id));
            Sightings.AddRange(sightings);
        }
    }
}
