using System.Text.Json;
using System.Text.RegularExpressions;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.EffectStudio.Engine;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.EffectStudio;

public sealed record EffectAssignmentDto(string SpellName, long CharacterId, JsonElement Definition);
public sealed record AssignEffectRequest(string SpellName, long? CharacterId, JsonElement? Definition, JsonElement? Effect);
public sealed record PublishEffectPackRequest(string Title, string? Description, JsonElement[] Effects);
public sealed record ImportCampaignEffectRequest(JsonElement FileContent, string? SpellName, long? CharacterId);

public static class EffectLibraryAndAssignmentEndpoints
{
    private static string Key(string name) => Regex.Replace((name ?? "").ToLowerInvariant(), "[^a-z0-9]", "");

    public static async Task<string> EnsureTablesAsync(MySqlConnection conn, CancellationToken ct)
    {
        var ddl = """
            CREATE TABLE IF NOT EXISTS lw_effect_library (
              user_id BIGINT NOT NULL,
              effect_id VARCHAR(80) NOT NULL,
              definition_json LONGTEXT NOT NULL,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (user_id, effect_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            CREATE TABLE IF NOT EXISTS lw_effect_assignments (
              campaign_id BIGINT NOT NULL,
              character_id BIGINT NOT NULL DEFAULT 0,
              spell_key VARCHAR(120) NOT NULL,
              spell_name VARCHAR(120) NOT NULL,
              definition_json LONGTEXT NOT NULL,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (campaign_id, character_id, spell_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            CREATE TABLE IF NOT EXISTS lw_summon_assets (
              id VARCHAR(64) NOT NULL PRIMARY KEY,
              user_id BIGINT NOT NULL,
              kind VARCHAR(16) NOT NULL,
              mime_type VARCHAR(80) NOT NULL,
              file_name VARCHAR(160) NOT NULL,
              bytes LONGBLOB NOT NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """;
        await using var cmd = new MySqlCommand(ddl, conn);
        await cmd.ExecuteNonQueryAsync(ct);
        return "lw_";
    }

    public static RouteGroupBuilder MapEffectLibraryAndAssignmentEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/effects/library", async (HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var p = await EnsureTablesAsync(db, ct);
                await using var cmd = new MySqlCommand(
                    $"SELECT definition_json FROM {p}effect_library WHERE user_id=@u ORDER BY updated_at DESC LIMIT 500", db);
                cmd.Parameters.AddWithValue("@u", u.Id);
                var list = new List<JsonElement>();
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    list.Add(JsonDocument.Parse(r.GetString(0)).RootElement.Clone());
                }
                return Results.Ok(list);
            }
            catch
            {
                return Results.Ok(Array.Empty<JsonElement>());
            }
        });

        api.MapPut("/effects/library/{id}", async (string id, JsonElement body, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(id) || id.Length > 80 || !EffectDefinitionValidator.Valid(body))
                return Results.BadRequest(new { message = "Invalid effect definition or motion parameters." });

            var normalizedJson = EffectDefinitionValidator.NormalizeEffectJsonForCampaign(body, null, out _, out _);
            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EnsureTablesAsync(db, ct);
            await using var cmd = new MySqlCommand(
                $"INSERT INTO {p}effect_library (user_id,effect_id,definition_json) VALUES (@u,@id,@j) ON DUPLICATE KEY UPDATE definition_json=@j, updated_at=CURRENT_TIMESTAMP",
                db);
            cmd.Parameters.AddWithValue("@u", u.Id);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@j", normalizedJson);
            await cmd.ExecuteNonQueryAsync(ct);
            return Results.Ok(new { id });
        });

        api.MapDelete("/effects/library/{id}", async (string id, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EnsureTablesAsync(db, ct);
            await using var cmd = new MySqlCommand($"DELETE FROM {p}effect_library WHERE user_id=@u AND effect_id=@id", db);
            cmd.Parameters.AddWithValue("@u", u.Id);
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync(ct);
            return Results.NoContent();
        });

        api.MapGet("/effects/{id}/standalone", async (string id, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EnsureTablesAsync(db, ct);
            await using var cmd = new MySqlCommand(
                $"SELECT definition_json FROM {p}effect_library WHERE effect_id=@id ORDER BY CASE WHEN user_id=@u THEN 0 ELSE 1 END LIMIT 1",
                db);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@u", u?.Id ?? 0);
            var rawJson = await cmd.ExecuteScalarAsync(ct) as string;
            if (string.IsNullOrWhiteSpace(rawJson)) return Results.NotFound(new { message = "Effect not found" });

            var effectElem = JsonDocument.Parse(rawJson).RootElement.Clone();
            var name = effectElem.TryGetProperty("name", out var n) ? n.GetString() ?? "effect" : "effect";
            var slug = Regex.Replace(name.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
            if (string.IsNullOrEmpty(slug)) slug = "effect";

            var envelope = JsonSerializer.Serialize(new
            {
                format = "loomweaver-effect",
                schemaVersion = 1,
                exportedAt = DateTimeOffset.UtcNow,
                portable = true,
                effect = effectElem
            }, new JsonSerializerOptions { WriteIndented = true });

            ctx.Response.Headers.ContentDisposition = $"attachment; filename=\"{slug}.lweffect.json\"";
            return Results.Text(envelope, "application/json");
        });

        api.MapPost("/effects/campaigns/{cid:long}/import", async (
            long cid,
            ImportCampaignEffectRequest req,
            HttpContext ctx,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();

            var raw = req.FileContent;
            var list = new List<JsonElement>();
            if (raw.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in raw.EnumerateArray()) list.Add(EffectDefinitionValidator.UnwrapStandaloneEnvelope(item));
            }
            else if (raw.ValueKind == JsonValueKind.Object && raw.TryGetProperty("effects", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in arr.EnumerateArray()) list.Add(EffectDefinitionValidator.UnwrapStandaloneEnvelope(item));
            }
            else
            {
                list.Add(EffectDefinitionValidator.UnwrapStandaloneEnvelope(raw));
            }

            var validEffects = list.Where(EffectDefinitionValidator.Valid).ToList();
            if (validEffects.Count == 0)
                return Results.BadRequest(new { message = "No valid effect definitions found in imported file." });

            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EnsureTablesAsync(db, ct);
            var importedEffects = new List<JsonElement>();

            foreach (var eff in validEffects)
            {
                var adaptedJson = EffectDefinitionValidator.NormalizeEffectJsonForCampaign(eff, cid, out var effId, out _);
                await using var libCmd = new MySqlCommand(
                    $"INSERT INTO {p}effect_library (user_id,effect_id,definition_json) VALUES (@u,@id,@j) ON DUPLICATE KEY UPDATE definition_json=@j, updated_at=CURRENT_TIMESTAMP",
                    db);
                libCmd.Parameters.AddWithValue("@u", u.Id);
                libCmd.Parameters.AddWithValue("@id", effId);
                libCmd.Parameters.AddWithValue("@j", adaptedJson);
                await libCmd.ExecuteNonQueryAsync(ct);

                if (!string.IsNullOrWhiteSpace(req.SpellName) && Key(req.SpellName).Length > 0)
                {
                    var chId = req.CharacterId ?? 0;
                    await using var assignCmd = new MySqlCommand(
                        $"INSERT INTO {p}effect_assignments (campaign_id,character_id,spell_key,spell_name,definition_json) VALUES (@c,@ch,@k,@n,@j) ON DUPLICATE KEY UPDATE spell_name=@n, definition_json=@j, updated_at=CURRENT_TIMESTAMP",
                        db);
                    assignCmd.Parameters.AddWithValue("@c", cid);
                    assignCmd.Parameters.AddWithValue("@ch", chId);
                    assignCmd.Parameters.AddWithValue("@k", Key(req.SpellName));
                    assignCmd.Parameters.AddWithValue("@n", req.SpellName.Trim());
                    assignCmd.Parameters.AddWithValue("@j", adaptedJson);
                    await assignCmd.ExecuteNonQueryAsync(ct);
                }

                importedEffects.Add(JsonDocument.Parse(adaptedJson).RootElement.Clone());
            }

            return Results.Ok(new { imported = importedEffects.Count, campaignId = cid, effects = importedEffects });
        });

        api.MapGet("/effects/campaigns/{cid:long}/assignments", async (long cid, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EnsureTablesAsync(db, ct);
            await using var cmd = new MySqlCommand(
                $"SELECT spell_name, character_id, definition_json FROM {p}effect_assignments WHERE campaign_id=@cid", db);
            cmd.Parameters.AddWithValue("@cid", cid);
            var list = new List<EffectAssignmentDto>();
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                list.Add(new EffectAssignmentDto(
                    r.GetString(0),
                    r.GetInt64(1),
                    JsonDocument.Parse(r.GetString(2)).RootElement.Clone()));
            }
            return Results.Ok(list);
        });

        api.MapPut("/effects/campaigns/{cid:long}/assignments", async (long cid, AssignEffectRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();

            var defElem = req.Definition ?? req.Effect ?? default;
            if (defElem.ValueKind == JsonValueKind.Undefined || !EffectDefinitionValidator.Valid(defElem) ||
                string.IsNullOrWhiteSpace(req.SpellName) || req.SpellName.Length > 120 || Key(req.SpellName).Length == 0)
            {
                return Results.BadRequest(new { message = "A valid effect and spell name are required." });
            }

            var chId = Math.Max(0, req.CharacterId ?? 0);
            var normalizedJson = EffectDefinitionValidator.NormalizeEffectJsonForCampaign(defElem, cid, out _, out _);

            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EnsureTablesAsync(db, ct);
            await using var cmd = new MySqlCommand(
                $"INSERT INTO {p}effect_assignments (campaign_id,character_id,spell_key,spell_name,definition_json) VALUES (@cid,@char,@key,@name,@json) ON DUPLICATE KEY UPDATE spell_name=@name, definition_json=@json, updated_at=CURRENT_TIMESTAMP",
                db);
            cmd.Parameters.AddWithValue("@cid", cid);
            cmd.Parameters.AddWithValue("@char", chId);
            cmd.Parameters.AddWithValue("@key", Key(req.SpellName));
            cmd.Parameters.AddWithValue("@name", req.SpellName.Trim());
            cmd.Parameters.AddWithValue("@json", normalizedJson);
            await cmd.ExecuteNonQueryAsync(ct);
            return Results.Ok(new { assigned = true, campaignId = cid, characterId = chId, spellName = req.SpellName.Trim() });
        });

        api.MapDelete("/effects/campaigns/{cid:long}/assignments", async (long cid, string spellName, long? characterId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            var chId = characterId ?? 0;
            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EnsureTablesAsync(db, ct);
            await using var cmd = new MySqlCommand(
                $"DELETE FROM {p}effect_assignments WHERE campaign_id=@cid AND character_id=@char AND spell_key=@key", db);
            cmd.Parameters.AddWithValue("@cid", cid);
            cmd.Parameters.AddWithValue("@char", chId);
            cmd.Parameters.AddWithValue("@key", Key(spellName));
            await cmd.ExecuteNonQueryAsync(ct);
            return Results.NoContent();
        });

        api.MapGet("/effects/campaigns/{cid:long}/summon-npcs", async (long cid, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            var access = await CampaignAccessResolver.ResolveAsync(ctx, (int)cid, null, ct);
            var list = new List<object>();
            await using var db = await mysql.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand("""
                SELECT id, title, artwork_url, visibility
                FROM lw_adventure_nodes
                WHERE campaign_id = @c AND node_kind = 'npc'
                  AND (@gm = 1 OR visibility <> 'gm')
                ORDER BY title LIMIT 200
                """, db);
            cmd.Parameters.AddWithValue("@c", cid);
            cmd.Parameters.AddWithValue("@gm", access.IsEffectiveGm ? 1 : 0);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                list.Add(new { id = r.GetString(0), name = r.GetString(1), tokenUrl = r.GetString(2) });
            return Results.Ok(list);
        });

        return api;
    }
}
