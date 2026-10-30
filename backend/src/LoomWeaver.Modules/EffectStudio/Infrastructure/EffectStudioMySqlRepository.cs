using System.Text.Json;
using System.Text.RegularExpressions;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.EffectStudio.Domain;
using LoomWeaver.Modules.EffectStudio.Engine;
using MySqlConnector;

namespace LoomWeaver.Modules.EffectStudio.Infrastructure;

public sealed class EffectStudioMySqlRepository(
    LoomWeaverMySqlRepository mysql,
    EffectTimelineValidationEngine validationEngine)
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private static readonly List<CampaignEffectCharacterOptionDto> SeedCharacters = BuildSeedCharacters();
    private static readonly List<CampaignEffectSpellAssignmentDto> MemoryAssignments = new();
    private static bool _schemaReady;

    public static string NormalizeSpellKey(string? spellName) =>
        Regex.Replace((spellName ?? "rune-vortex").Trim().ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');

    public async Task EnsureSchemaAndSeedAsync(CancellationToken ct = default)
    {
        if (_schemaReady) return;
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            const string ddl = """
                CREATE TABLE IF NOT EXISTS lw_campaign_effects (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    campaign_id INT NOT NULL,
                    effect_id VARCHAR(80) NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    subtitle VARCHAR(180) NOT NULL DEFAULT 'Custom Visual Effect',
                    emitter_id VARCHAR(64) NOT NULL DEFAULT 'emit-holy-light',
                    canon_status VARCHAR(32) NOT NULL DEFAULT 'approved',
                    owner_username VARCHAR(64) NOT NULL DEFAULT 'GeoJason',
                    owner_role VARCHAR(32) NOT NULL DEFAULT 'gm',
                    document_json LONGTEXT NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_camp_effect (campaign_id, effect_id),
                    INDEX idx_camp_updated (campaign_id, updated_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                CREATE TABLE IF NOT EXISTS lw_campaign_effect_characters (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    campaign_id INT NOT NULL,
                    character_key VARCHAR(80) NOT NULL,
                    name VARCHAR(120) NOT NULL,
                    class_or_title VARCHAR(160) NOT NULL,
                    owner_username VARCHAR(64) NOT NULL,
                    role_scope VARCHAR(32) NOT NULL DEFAULT 'player',
                    known_spells_json TEXT NOT NULL,
                    UNIQUE KEY uq_camp_char (campaign_id, character_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                CREATE TABLE IF NOT EXISTS lw_campaign_effect_assignments (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    campaign_id INT NOT NULL,
                    campaign_name VARCHAR(120) NOT NULL DEFAULT 'Test Campaign',
                    character_key VARCHAR(80) NOT NULL,
                    character_name VARCHAR(120) NOT NULL,
                    spell_key VARCHAR(120) NOT NULL,
                    spell_name VARCHAR(120) NOT NULL,
                    effect_id VARCHAR(80) NOT NULL,
                    effect_name VARCHAR(120) NOT NULL,
                    assigned_by_username VARCHAR(64) NOT NULL DEFAULT 'GeoJason',
                    assigned_by_role VARCHAR(32) NOT NULL DEFAULT 'gm',
                    document_json LONGTEXT NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_camp_char_spell (campaign_id, character_key, spell_key),
                    INDEX idx_camp_char (campaign_id, character_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                CREATE TABLE IF NOT EXISTS mw_effect_assignments (
                    campaign_id BIGINT NOT NULL,
                    character_id BIGINT NOT NULL DEFAULT 0,
                    spell_key VARCHAR(120) NOT NULL,
                    spell_name VARCHAR(120) NOT NULL,
                    definition_json LONGTEXT NOT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (campaign_id, character_id, spell_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """;

            await using (var cmd = new MySqlCommand(ddl, conn))
            {
                await cmd.ExecuteNonQueryAsync(ct);
            }

            foreach (var ch in SeedCharacters)
            {
                const string upsertChar = """
                    INSERT INTO lw_campaign_effect_characters
                        (campaign_id, character_key, name, class_or_title, owner_username, role_scope, known_spells_json)
                    VALUES (@cid, @ckey, @name, @title, @owner, @scope, @spells)
                    ON DUPLICATE KEY UPDATE
                        name = @name,
                        class_or_title = @title,
                        known_spells_json = @spells;
                    """;
                await using var cCmd = new MySqlCommand(upsertChar, conn);
                cCmd.Parameters.AddWithValue("@cid", ch.CampaignId);
                cCmd.Parameters.AddWithValue("@ckey", ch.CharacterKey);
                cCmd.Parameters.AddWithValue("@name", ch.Name);
                cCmd.Parameters.AddWithValue("@title", ch.ClassOrTitle);
                cCmd.Parameters.AddWithValue("@owner", ch.OwnerUsername);
                cCmd.Parameters.AddWithValue("@scope", ch.RoleScope);
                cCmd.Parameters.AddWithValue("@spells", JsonSerializer.Serialize(ch.KnownSpells, JsonOpts));
                await cCmd.ExecuteNonQueryAsync(ct);
            }

            foreach (var doc in validationEngine.GetDocumentsForCampaign(1))
            {
                await SaveEffectDocumentToMySqlAsync(conn, doc, "GeoJason", "gm", ct);
            }

            _schemaReady = true;
        }
        catch
        {
            // Falls back gracefully to in-memory seed state when local MySQL is offline
        }
    }

    public async Task<IReadOnlyList<CampaignEffectCharacterOptionDto>> GetAuthorizedCharactersAsync(
        int campaignId,
        string? viewerRole,
        string? username,
        string? boundCharacter,
        CancellationToken ct = default)
    {
        await EnsureSchemaAndSeedAsync(ct);
        var isGm = IsGmRole(viewerRole, boundCharacter);
        var allForCampaign = new List<CampaignEffectCharacterOptionDto>();

        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            const string sql = """
                SELECT character_key, campaign_id, name, class_or_title, owner_username, role_scope, known_spells_json
                FROM lw_campaign_effect_characters
                WHERE campaign_id = @cid
                ORDER BY id;
                """;
            await using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@cid", campaignId);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var spells = JsonSerializer.Deserialize<List<string>>(reader.GetString(6), JsonOpts) ?? [];
                allForCampaign.Add(new CampaignEffectCharacterOptionDto(
                    reader.GetString(0), reader.GetInt32(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetString(5), spells));
            }
        }
        catch { }

        if (allForCampaign.Count == 0)
            allForCampaign = SeedCharacters.Where(c => c.CampaignId == campaignId || campaignId <= 0).ToList();

        if (isGm) return allForCampaign;

        var cleanUser = (username ?? string.Empty).Trim();
        var cleanBound = (boundCharacter ?? string.Empty).Trim();
        var playerMatches = allForCampaign.Where(c =>
            c.RoleScope == "player" &&
            (string.Equals(c.OwnerUsername, cleanUser, StringComparison.OrdinalIgnoreCase) ||
             (!string.IsNullOrWhiteSpace(cleanBound) && c.Name.Contains(cleanBound, StringComparison.OrdinalIgnoreCase)) ||
             (!string.IsNullOrWhiteSpace(cleanBound) && c.CharacterKey.EndsWith(cleanBound.ToLowerInvariant(), StringComparison.OrdinalIgnoreCase)))
        ).ToList();

        return playerMatches.Count > 0 ? playerMatches : allForCampaign.Where(c => c.RoleScope == "player").Take(1).ToList();
    }

    public async Task<IReadOnlyList<EffectStudioDocumentDto>> GetCampaignEffectsAsync(int campaignId, CancellationToken ct = default)
    {
        await EnsureSchemaAndSeedAsync(ct);
        var list = new List<EffectStudioDocumentDto>();
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand("SELECT document_json FROM lw_campaign_effects WHERE campaign_id = @cid ORDER BY updated_at DESC LIMIT 100;", conn);
            cmd.Parameters.AddWithValue("@cid", campaignId);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var doc = JsonSerializer.Deserialize<EffectStudioDocumentDto>(reader.GetString(0), JsonOpts);
                if (doc is not null) list.Add(doc);
            }
        }
        catch { }
        return list.Count > 0 ? list : validationEngine.GetDocumentsForCampaign(campaignId);
    }

    public async Task<IReadOnlyList<CampaignEffectSpellAssignmentDto>> GetCampaignAssignmentsAsync(int campaignId, CancellationToken ct = default)
    {
        await EnsureSchemaAndSeedAsync(ct);
        var list = new List<CampaignEffectSpellAssignmentDto>();
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            const string sql = """
                SELECT id, campaign_id, campaign_name, character_key, character_name, spell_key, spell_name,
                       effect_id, effect_name, assigned_by_username, assigned_by_role, updated_at, document_json
                FROM lw_campaign_effect_assignments WHERE campaign_id = @cid ORDER BY updated_at DESC;
                """;
            await using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@cid", campaignId);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var doc = JsonSerializer.Deserialize<EffectStudioDocumentDto>(reader.GetString(12), JsonOpts);
                list.Add(new CampaignEffectSpellAssignmentDto(
                    reader.GetInt64(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3),
                    reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
                    reader.GetString(8), reader.GetString(9), reader.GetString(10), reader.GetDateTime(11).ToString("O"), doc));
            }
        }
        catch { return MemoryAssignments.Where(a => a.CampaignId == campaignId).ToList(); }
        return list;
    }

    public async Task<EffectStudioDocumentDto> SaveEffectAsync(
        SaveEffectStudioDocumentRequest req,
        string? username,
        CancellationToken ct = default)
    {
        await EnsureSchemaAndSeedAsync(ct);
        var saved = validationEngine.ValidateAndSave(req);
        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            await SaveEffectDocumentToMySqlAsync(
                conn,
                saved,
                string.IsNullOrWhiteSpace(username) ? "GeoJason" : username,
                req.ViewerRole,
                ct);
        }
        catch
        {
            // Keep in-memory saved document if MySQL is offline locally
        }
        return saved;
    }

    public async Task<PushEffectToCampaignResponse> PushEffectToCampaignAsync(
        PushEffectToCampaignRequest req,
        CancellationToken ct = default)
    {
        await EnsureSchemaAndSeedAsync(ct);
        var cid = req.CampaignId <= 0 ? 1 : req.CampaignId;
        var isGm = IsGmRole(req.ViewerRole, req.BoundCharacter);
        var authorizedChars = await GetAuthorizedCharactersAsync(
            cid,
            req.ViewerRole,
            req.Username,
            req.BoundCharacter,
            ct);

        var targetChar = authorizedChars.FirstOrDefault(c =>
            string.Equals(c.CharacterKey, req.CharacterKey, StringComparison.OrdinalIgnoreCase))
            ?? authorizedChars.FirstOrDefault();

        if (targetChar is null)
        {
            throw new UnauthorizedAccessException("You do not have an authorized character in this campaign.");
        }

        if (!isGm && !string.Equals(targetChar.CharacterKey, req.CharacterKey, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("Players may only assign visual effects to their own character.");
        }

        var spellName = string.IsNullOrWhiteSpace(req.SpellName) ? "Rune Vortex" : req.SpellName.Trim();
        var spellKey = NormalizeSpellKey(spellName);

        var effectReq = req.Effect with
        {
            CampaignId = cid,
            ViewerRole = isGm ? "gm" : "players",
            Name = string.IsNullOrWhiteSpace(req.Effect.Name) || req.Effect.Name == "Unnamed Effect"
                ? $"{targetChar.Name}: {spellName}"
                : req.Effect.Name
        };

        var savedEffect = validationEngine.ValidateAndSave(effectReq) with
        {
            StatusLabel = $"Pushed · {targetChar.Name} ({spellName})"
        };

        var campaigns = await mysql.GetCampaignsAsync(ct);
        var campName = campaigns.FirstOrDefault(c => c.Id == cid)?.Name ?? "Test Campaign";
        var docJson = JsonSerializer.Serialize(savedEffect, JsonOpts);
        long assignmentId = MemoryAssignments.Count + 1;

        try
        {
            await using var conn = await mysql.OpenConnectionAsync(ct);
            await SaveEffectDocumentToMySqlAsync(
                conn,
                savedEffect,
                string.IsNullOrWhiteSpace(req.Username) ? "GeoJason" : req.Username,
                isGm ? "gm" : "players",
                ct);

            const string upsertAssign = """
                INSERT INTO lw_campaign_effect_assignments
                    (campaign_id, campaign_name, character_key, character_name, spell_key, spell_name,
                     effect_id, effect_name, assigned_by_username, assigned_by_role, document_json)
                VALUES
                    (@cid, @cname, @ckey, @charName, @skey, @sname, @eid, @ename, @uname, @role, @json)
                ON DUPLICATE KEY UPDATE
                    campaign_name = @cname,
                    character_name = @charName,
                    spell_name = @sname,
                    effect_id = @eid,
                    effect_name = @ename,
                    assigned_by_username = @uname,
                    assigned_by_role = @role,
                    document_json = @json,
                    updated_at = CURRENT_TIMESTAMP;
                SELECT id FROM lw_campaign_effect_assignments
                WHERE campaign_id = @cid AND character_key = @ckey AND spell_key = @skey LIMIT 1;
                """;
            await using (var cmd = new MySqlCommand(upsertAssign, conn))
            {
                cmd.Parameters.AddWithValue("@cid", cid);
                cmd.Parameters.AddWithValue("@cname", campName);
                cmd.Parameters.AddWithValue("@ckey", targetChar.CharacterKey);
                cmd.Parameters.AddWithValue("@charName", targetChar.Name);
                cmd.Parameters.AddWithValue("@skey", spellKey);
                cmd.Parameters.AddWithValue("@sname", spellName);
                cmd.Parameters.AddWithValue("@eid", savedEffect.Id);
                cmd.Parameters.AddWithValue("@ename", savedEffect.Name);
                cmd.Parameters.AddWithValue("@uname", string.IsNullOrWhiteSpace(req.Username) ? "GeoJason" : req.Username);
                cmd.Parameters.AddWithValue("@role", isGm ? "gm" : "players");
                cmd.Parameters.AddWithValue("@json", docJson);
                var scalar = await cmd.ExecuteScalarAsync(ct);
                if (scalar is not null) assignmentId = Convert.ToInt64(scalar);
            }

            // Also sync to legacy mw_effect_assignments for VTT compatibility
            const string legacySql = """
                INSERT INTO mw_effect_assignments (campaign_id, character_id, spell_key, spell_name, definition_json)
                VALUES (@cid, @chid, @skey, @sname, @json)
                ON DUPLICATE KEY UPDATE spell_name = @sname, definition_json = @json;
                """;
            await using (var lCmd = new MySqlCommand(legacySql, conn))
            {
                lCmd.Parameters.AddWithValue("@cid", cid);
                lCmd.Parameters.AddWithValue("@chid", Math.Abs(targetChar.CharacterKey.GetHashCode() % 10000));
                lCmd.Parameters.AddWithValue("@skey", spellKey);
                lCmd.Parameters.AddWithValue("@sname", spellName);
                lCmd.Parameters.AddWithValue("@json", docJson);
                await lCmd.ExecuteNonQueryAsync(ct);
            }
        }
        catch
        {
            // Keep in-memory assignment when MySQL is unavailable locally
        }

        var assignment = new CampaignEffectSpellAssignmentDto(
            Id: assignmentId,
            CampaignId: cid,
            CampaignName: campName,
            CharacterKey: targetChar.CharacterKey,
            CharacterName: targetChar.Name,
            SpellKey: spellKey,
            SpellName: spellName,
            EffectId: savedEffect.Id,
            EffectName: savedEffect.Name,
            AssignedByUsername: string.IsNullOrWhiteSpace(req.Username) ? "GeoJason" : req.Username,
            AssignedByRole: isGm ? "gm" : "players",
            UpdatedAt: DateTimeOffset.UtcNow.ToString("O"),
            EffectDocument: savedEffect
        );

        MemoryAssignments.RemoveAll(a =>
            a.CampaignId == cid &&
            string.Equals(a.CharacterKey, targetChar.CharacterKey, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(a.SpellKey, spellKey, StringComparison.OrdinalIgnoreCase));
        MemoryAssignments.Insert(0, assignment);

        return new PushEffectToCampaignResponse(
            Success: true,
            Message: $"Pushed '{savedEffect.Name}' to {campName} for {targetChar.Name} ({spellName}).",
            Assignment: assignment,
            SavedEffect: savedEffect
        );
    }

    private static async Task SaveEffectDocumentToMySqlAsync(
        MySqlConnection conn,
        EffectStudioDocumentDto doc,
        string username,
        string role,
        CancellationToken ct)
    {
        const string sql = """
            INSERT INTO lw_campaign_effects
                (campaign_id, effect_id, name, subtitle, emitter_id, canon_status, owner_username, owner_role, document_json)
            VALUES
                (@cid, @eid, @name, @sub, @emid, @canon, @uname, @role, @json)
            ON DUPLICATE KEY UPDATE
                name = @name,
                subtitle = @sub,
                emitter_id = @emid,
                canon_status = @canon,
                document_json = @json,
                updated_at = CURRENT_TIMESTAMP;
            """;
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@cid", doc.CampaignId);
        cmd.Parameters.AddWithValue("@eid", doc.Id);
        cmd.Parameters.AddWithValue("@name", doc.Name);
        cmd.Parameters.AddWithValue("@sub", doc.Subtitle);
        cmd.Parameters.AddWithValue("@emid", doc.ActiveEmitterId);
        cmd.Parameters.AddWithValue("@canon", doc.CanonStatus);
        cmd.Parameters.AddWithValue("@uname", username);
        cmd.Parameters.AddWithValue("@role", role);
        cmd.Parameters.AddWithValue("@json", JsonSerializer.Serialize(doc, JsonOpts));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static bool IsGmRole(string? role, string? boundCharacter) =>
        string.Equals(role, "gm", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "dm", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(boundCharacter, "GM", StringComparison.OrdinalIgnoreCase);

    private static List<CampaignEffectCharacterOptionDto> BuildSeedCharacters() =>
    [
        // Campaign 1: test seed
        new("pc-kildrid", 1, "Brenna", "Dwarven Cleric · Stone & Rune Scholar", "RyanIssak", "player",
            ["Rune Vortex", "Luminary Pillar", "Hexagonal Binding Pulse", "Spirit Guardians", "Healing Aura", "Flame Strike"]),
        new("pc-kycius", 1, "Sera", "Tabaxi Thread-Seer Warlock & Fire Drake", "StickHazen", "player",
            ["Overchannel Surge", "Arcane Magic Missile", "Fireball", "Fire-Drake Cinder Breath", "Arms of Hadar"]),
        new("pc-fivi", 1, "Tomas", "Feywild Outcast Rogue / Warlock", "DallasCrow", "player",
            ["Slingshot Loaded with a Tooth", "Fey Gold Ricochet Arc", "Eldritch Fey Blast", "Misty Step", "Pocket-Maw Ward"]),
        new("pc-dal", 1, "Aldric", "Elf Horizon Ranger · Heir of the Realm", "ScottBrogan", "player",
            ["Starlight Volley", "Hunter's Mark Bolt", "Zephyr Strike", "Conjure Barrage", "Rune Vortex"]),
        new("pc-munk", 1, "Osric", "Half-Orc Vanguard Fighter", "PeteHigano", "player",
            ["Homestead Sky-Breaker Cleave", "Heavy Weapon Strike", "Action Surge Shockwave", "Indomitable Warcry"]),
        new("npc-emrys", 1, "Sample NPC (GM)", "Reformer of the Council of Magic", "GeoJason", "gm",
            ["Rune Vortex", "Prism Lance", "Moonlight War Containment Seal", "Chain Lightning", "Meteor Swarm"]),
        new("mon-vaelkorath", 1, "Ancient Dragon (GM / Boss)", "The Bound Dragon Beneath the Mountain", "GeoJason", "gm",
            ["Corrupted Mountain Breath", "Runic Life-Tether Eruption", "Poisoned Canopy Shockwave"]),

        // Campaign 2: Echoes of the Starstone
        new("pc-starstone-magus", 2, "Vaelen Thorne", "Starstone Aether Magus", "GeoJason", "player",
            ["Spellstrike Lightning Arc", "Starstone Rune Vortex", "Horizon Thunder Sphere", "Arcane Cascade"]),
        new("pc-starstone-alchemist", 2, "Mirela Vance", "Clockwork Chirurgeon", "DallasCrow", "player",
            ["Alchemical Fire Burst", "Restorative Vapor Cloud", "Voltaic Capacitor Beam"]),
        new("gm-starstone-automaton", 2, "Archon Construct (GM)", "Absalom Vault Guardian", "GeoJason", "gm",
            ["Prismatic Energy Beam", "Clockwork Overload Nova", "Gravity Well Vortex"]),

        // Campaign 3: Court of Velvet Ash
        new("pc-velvet-tremere", 3, "Julian Vance", "Tremere Blood Sorcerer", "GeoJason", "player",
            ["Crimson Blood Mist", "Cauldron of Blood", "Shadow Swirl Step", "Scorpion's Touch"]),
        new("pc-velvet-lasombra", 3, "Seraphina Noctis", "Lasombra Oblivion Keeper", "DallasCrow", "player",
            ["Abyssal Shadow Swirl", "Arms of Ahriman", "Oblivion Portal"])
    ];
}
