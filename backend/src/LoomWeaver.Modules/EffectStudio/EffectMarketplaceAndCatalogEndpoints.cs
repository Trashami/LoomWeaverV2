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

public static class EffectMarketplaceAndCatalogEndpoints
{
    private const int MaxBytes = 12 * 1024 * 1024;
    private static readonly Dictionary<string, (string Kind, string Mime)> AllowedExt = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = ("image", "image/png"),
        [".jpg"] = ("image", "image/jpeg"),
        [".jpeg"] = ("image", "image/jpeg"),
        [".webp"] = ("image", "image/webp"),
        [".gif"] = ("image", "image/gif"),
        [".glb"] = ("model3d", "model/gltf-binary"),
        [".gltf"] = ("model3d", "model/gltf+json")
    };

    private static readonly (string Name, int Level, string School, string CastingTime, string Range, string Duration)[] FallbackSpells =
    {
        ("Fireball", 3, "Evocation", "1 Action", "150 feet", "Instantaneous"),
        ("Magic Missile", 1, "Evocation", "1 Action", "120 feet", "Instantaneous"),
        ("Chain Lightning", 6, "Evocation", "1 Action", "150 feet", "Instantaneous"),
        ("Cone of Cold", 5, "Evocation", "1 Action", "Self (60-foot cone)", "Instantaneous"),
        ("Burning Hands", 1, "Evocation", "1 Action", "Self (15-foot cone)", "Instantaneous"),
        ("Lightning Bolt", 3, "Evocation", "1 Action", "Self (100-foot line)", "Instantaneous"),
        ("Eldritch Blast", 0, "Evocation", "1 Action", "120 feet", "Instantaneous"),
        ("Sacred Flame", 0, "Evocation", "1 Action", "60 feet", "Instantaneous"),
        ("Moonbeam", 2, "Evocation", "1 Action", "120 feet", "Concentration, up to 1 minute"),
        ("Call Lightning", 3, "Conjuration", "1 Action", "120 feet", "Concentration, up to 10 minutes"),
        ("Spirit Guardians", 3, "Conjuration", "1 Action", "Self (15-foot radius)", "Concentration, up to 10 minutes"),
        ("Spiritual Weapon", 2, "Evocation", "1 Bonus Action", "60 feet", "1 minute"),
        ("Shield", 1, "Abjuration", "1 Reaction", "Self", "1 round"),
        ("Wall of Fire", 4, "Evocation", "1 Action", "120 feet", "Concentration, up to 1 minute"),
        ("Ice Storm", 4, "Evocation", "1 Action", "300 feet", "Instantaneous"),
        ("Meteor Swarm", 9, "Evocation", "1 Action", "1 mile", "Instantaneous"),
        ("Sunbeam", 6, "Evocation", "1 Action", "Self (60-foot line)", "Concentration, up to 1 minute"),
        ("Thunderwave", 1, "Evocation", "1 Action", "Self (15-foot cube)", "Instantaneous"),
        ("Shatter", 2, "Evocation", "1 Action", "60 feet", "Instantaneous"),
        ("Darkness", 2, "Evocation", "1 Action", "60 feet", "Concentration, up to 10 minutes"),
        ("Hunger of Hadar", 3, "Conjuration", "1 Action", "150 feet", "Concentration, up to 1 minute"),
        ("Misty Step", 2, "Conjuration", "1 Bonus Action", "Self", "Instantaneous"),
        ("Dimension Door", 4, "Conjuration", "1 Action", "500 feet", "Instantaneous"),
        ("Cure Wounds", 1, "Evocation", "1 Action", "Touch", "Instantaneous"),
        ("Healing Word", 1, "Evocation", "1 Bonus Action", "60 feet", "Instantaneous")
    };

    public static RouteGroupBuilder MapEffectMarketplaceAndCatalogEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/effects/marketplace", async (LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var list = new List<object>();
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var p = await EffectLibraryAndAssignmentEndpoints.EnsureTablesAsync(db, ct);
                await using var cmd = new MySqlCommand($"""
                    SELECT id, title, description, author_name, module_data_json
                    FROM {p}marketplace_products
                    WHERE category IN ('spell_effect','effect_pack')
                      AND verification_status IN ('published','verified')
                      AND price_cents=0
                    ORDER BY created_at DESC LIMIT 100
                    """, db);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var d = JsonDocument.Parse(r.GetString(4)).RootElement;
                    var count = d.TryGetProperty("effects", out var effs) && effs.ValueKind == JsonValueKind.Array ? effs.GetArrayLength() : 1;
                    list.Add(new
                    {
                        id = r.GetInt64(0),
                        title = r.GetString(1),
                        description = r.IsDBNull(2) ? "" : r.GetString(2),
                        authorName = r.IsDBNull(3) ? "Creator" : r.GetString(3),
                        effectCount = count
                    });
                }
            }
            catch { }
            return Results.Ok(list);
        });

        api.MapGet("/effects/marketplace/{id:long}", async (long id, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var p = await EffectLibraryAndAssignmentEndpoints.EnsureTablesAsync(db, ct);
                await using var cmd = new MySqlCommand(
                    $"SELECT module_data_json FROM {p}marketplace_products WHERE id=@id AND category IN ('spell_effect','effect_pack') AND verification_status IN ('published','verified') AND price_cents=0",
                    db);
                cmd.Parameters.AddWithValue("@id", id);
                var json = await cmd.ExecuteScalarAsync(ct) as string;
                return json is null ? Results.NotFound() : Results.Content(json, "application/json");
            }
            catch
            {
                return Results.NotFound();
            }
        });

        api.MapPost("/effects/marketplace", async (PublishEffectPackRequest req, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Length > 120 || (req.Description?.Length ?? 0) > 2000 ||
                req.Effects is null || req.Effects.Length is < 1 or > 50 ||
                req.Effects.Any(d => !EffectDefinitionValidator.Valid(d) || d.TryGetProperty("summon", out _)))
            {
                return Results.BadRequest(new { message = "Provide a title and 1-50 valid effects." });
            }

            await using var db = await mysql.OpenConnectionAsync(ct);
            var p = await EffectLibraryAndAssignmentEndpoints.EnsureTablesAsync(db, ct);
            var slug = "fx-" + Guid.NewGuid().ToString("N");
            var payload = JsonSerializer.Serialize(new { format = "loomweaver-effect-pack", schemaVersion = 1, effects = req.Effects });

            await using var cmd = new MySqlCommand($"""
                INSERT INTO {p}marketplace_products(title,slug,subtitle,description,category,price_cents,badge_label,author_user_id,author_name,verification_status,tags_json,module_data_json)
                VALUES(@title,@slug,'Custom VTT spell visuals',@desc,@cat,0,'COMMUNITY',@uid,@author,'published','["VTT","Spell effects"]',@data);
                SELECT LAST_INSERT_ID();
                """, db);
            cmd.Parameters.AddWithValue("@title", req.Title.Trim());
            cmd.Parameters.AddWithValue("@slug", slug);
            cmd.Parameters.AddWithValue("@desc", req.Description ?? "");
            cmd.Parameters.AddWithValue("@cat", req.Effects.Length == 1 ? "spell_effect" : "effect_pack");
            cmd.Parameters.AddWithValue("@uid", u.Id);
            cmd.Parameters.AddWithValue("@author", u.DisplayName ?? u.Username);
            cmd.Parameters.AddWithValue("@data", payload);
            var id = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
            return Results.Ok(new { id });
        });

        api.MapPost("/summon-assets", async (HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var u = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (u is null) return Results.Unauthorized();
            if (!ctx.Request.HasFormContentType) return Results.BadRequest(new { error = "Expected multipart/form-data" });
            var form = await ctx.Request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file");
            if (file is null || file.Length == 0 || file.Length > MaxBytes)
                return Results.BadRequest(new { error = "File must be between 1 byte and 12 MB" });
            var ext = Path.GetExtension(file.FileName ?? "");
            if (!AllowedExt.TryGetValue(ext, out var meta))
                return Results.BadRequest(new { error = "Unsupported file type. Use PNG, JPG, WEBP, GIF, GLB, or GLTF." });

            using var ms = new MemoryStream((int)file.Length);
            await file.CopyToAsync(ms, ct);
            var id = $"{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
            await using var db = await mysql.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand(
                "INSERT INTO jane_scrum.mw_summon_assets (id,user_id,kind,mime_type,file_name,bytes) VALUES (@id,@u,@k,@m,@f,@b)", db);
            cmd.Parameters.AddWithValue("@id", id);
            cmd.Parameters.AddWithValue("@u", u.Id);
            cmd.Parameters.AddWithValue("@k", meta.Kind);
            cmd.Parameters.AddWithValue("@m", meta.Mime);
            cmd.Parameters.AddWithValue("@f", Path.GetFileName(file.FileName ?? id));
            cmd.Parameters.AddWithValue("@b", ms.ToArray());
            await cmd.ExecuteNonQueryAsync(ct);
            return Results.Ok(new { id, kind = meta.Kind, url = $"/api/summon-assets/{id}", fileName = file.FileName });
        });

        api.MapGet("/summon-assets/{id}", async (string id, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(id) || id.Length > 64) return Results.NotFound();
            await using var db = await mysql.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand("SELECT mime_type, bytes FROM jane_scrum.mw_summon_assets WHERE id=@id LIMIT 1", db);
            cmd.Parameters.AddWithValue("@id", id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return Results.NotFound();
            ctx.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.File((byte[])r["bytes"], r.GetString(0));
        });

        api.MapGet("/campaigns/{cid:long}/members", async (long cid, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var rows = await CampaignMembershipStore.ListMembersAsync(mysql, (int)cid, ct);
            var members = rows.Select((m, i) => (object)new
            {
                id = i + 1L,
                campaign_id = cid,
                user_id = m.UserId,
                role = m.MemberRole == "gm" ? "dm" : m.MemberRole,
                character_id = m.CharacterId,
                character_name = m.CharacterName ?? m.CharacterKey,
                username = m.Email,
                display_name = m.CharacterName ?? m.CharacterKey ?? m.Email,
                avatar_url = (string?)null
            }).ToList();

            return Results.Ok(new { members });
        });

        api.MapGet("/spells", async (string? search, string? school, string? source, int? level, int? offset, int? limit, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var lim = Math.Clamp(limit ?? 50, 1, 1000);
            var off = Math.Max(0, offset ?? 0);
            var items = new List<object>();
            var total = 0;

            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var clauses = new List<string>();
                if (!string.IsNullOrWhiteSpace(search))
                    clauses.Add("(name LIKE @s OR school LIKE @s OR source_book LIKE @s)");
                if (!string.IsNullOrWhiteSpace(school) && !string.Equals(school, "All", StringComparison.OrdinalIgnoreCase))
                    clauses.Add("LOWER(school) = LOWER(@school)");
                if (!string.IsNullOrWhiteSpace(source) && !string.Equals(source, "All", StringComparison.OrdinalIgnoreCase))
                    clauses.Add("LOWER(source_book) = LOWER(@src)");
                if (level.HasValue && level.Value >= 0)
                    clauses.Add("level = @lvl");

                var where = clauses.Count > 0 ? "WHERE " + string.Join(" AND ", clauses) : "";

                await using (var countCmd = new MySqlCommand($"SELECT COUNT(*) FROM dnd_spells {where}", db))
                {
                    if (!string.IsNullOrWhiteSpace(search)) countCmd.Parameters.AddWithValue("@s", $"%{search.Trim()}%");
                    if (!string.IsNullOrWhiteSpace(school)) countCmd.Parameters.AddWithValue("@school", school.Trim());
                    if (!string.IsNullOrWhiteSpace(source)) countCmd.Parameters.AddWithValue("@src", source.Trim());
                    if (level.HasValue) countCmd.Parameters.AddWithValue("@lvl", level.Value);
                    total = Convert.ToInt32(await countCmd.ExecuteScalarAsync(ct));
                }

                await using var cmd = new MySqlCommand(
                    $"""
                    SELECT id, name, level, COALESCE(school,'Evocation'), COALESCE(casting_time,'1 Action'),
                           COALESCE(range_text, spell_range, '60 feet'), COALESCE(duration_text, duration, 'Instantaneous'),
                           COALESCE(source_book, 'PHB'), image_path, default_effect_id, effect_json, foundry_json
                    FROM dnd_spells
                    {where}
                    ORDER BY level, name
                    LIMIT @lim OFFSET @off
                    """,
                    db);
                if (!string.IsNullOrWhiteSpace(search)) cmd.Parameters.AddWithValue("@s", $"%{search.Trim()}%");
                if (!string.IsNullOrWhiteSpace(school)) cmd.Parameters.AddWithValue("@school", school.Trim());
                if (!string.IsNullOrWhiteSpace(source)) cmd.Parameters.AddWithValue("@src", source.Trim());
                if (level.HasValue) cmd.Parameters.AddWithValue("@lvl", level.Value);
                cmd.Parameters.AddWithValue("@lim", lim);
                cmd.Parameters.AddWithValue("@off", off);

                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    items.Add(new
                    {
                        id = Convert.ToInt32(r.GetValue(0)),
                        name = r.GetString(1),
                        level = Convert.ToInt32(r.GetValue(2)),
                        school = r.GetString(3),
                        castingTime = r.GetString(4),
                        spellRange = r.GetString(5),
                        duration = r.GetString(6),
                        sourceBook = r.GetString(7),
                        imagePath = r.IsDBNull(8) ? null : r.GetString(8),
                        defaultEffectId = r.IsDBNull(9) ? null : r.GetString(9),
                        hasEffect = !r.IsDBNull(10),
                        hasFoundryData = !r.IsDBNull(11)
                    });
                }
            }
            catch { }

            if (items.Count == 0)
            {
                var q = (search ?? "").Trim();
                var filtered = FallbackSpells
                    .Where(s => string.IsNullOrEmpty(q) || s.Name.Contains(q, StringComparison.OrdinalIgnoreCase) || s.School.Contains(q, StringComparison.OrdinalIgnoreCase))
                    .ToList();
                total = filtered.Count;
                items.AddRange(filtered.Skip(off).Take(lim).Select((s, idx) => new
                {
                    id = idx + 1,
                    name = s.Name,
                    level = s.Level,
                    school = s.School,
                    castingTime = s.CastingTime,
                    spellRange = s.Range,
                    duration = s.Duration,
                    sourceBook = "PHB",
                    imagePath = (string?)"/5etools/spell-art/magic-missile.webp",
                    defaultEffectId = (string?)$"fx-spell-{s.Name.ToLowerInvariant().Replace(' ', '-')}",
                    hasEffect = true,
                    hasFoundryData = true
                }));
            }

            return Results.Ok(new { items, total });
        });

        api.MapGet("/spells/{id:long}/effect", async (long id, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                await using var cmd = new MySqlCommand(
                    """
                    SELECT se.effect_id, se.spell_id, se.spell_name, se.source_book, se.school, se.level,
                           se.energy_theme, se.delivery_mode, se.is_handcrafted, se.icon_url,
                           se.studio_document_json, se.vtt_definition_json
                    FROM dnd_spell_effects se
                    WHERE se.spell_id = @id
                    LIMIT 1
                    """,
                    db);
                cmd.Parameters.AddWithValue("@id", id);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct))
                {
                    return Results.Ok(new
                    {
                        effectId = r.GetString(0),
                        spellId = Convert.ToInt64(r.GetValue(1)),
                        spellName = r.GetString(2),
                        sourceBook = r.GetString(3),
                        school = r.GetString(4),
                        level = Convert.ToInt32(r.GetValue(5)),
                        energyTheme = r.GetString(6),
                        deliveryMode = r.GetString(7),
                        isHandcrafted = Convert.ToBoolean(r.GetValue(8)),
                        iconUrl = r.IsDBNull(9) ? null : r.GetString(9),
                        studioDocument = JsonDocument.Parse(r.GetString(10)).RootElement,
                        vttDefinition = JsonDocument.Parse(r.GetString(11)).RootElement
                    });
                }
            }
            catch { }
            return Results.NotFound(new { message = $"Spell effect for spell #{id} not found." });
        });

        api.MapGet("/assets/library", async (string? search, int? limit, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var lim = Math.Clamp(limit ?? 60, 1, 120);
            var assets = await mysql.GetAssetsAsync(null, ct);
            var q = (search ?? "").Trim();
            var items = assets
                .Where(a => string.IsNullOrEmpty(q) || a.Name.Contains(q, StringComparison.OrdinalIgnoreCase))
                .Take(lim)
                .Select(a => new { name = a.Name, tokenUrl = a.PreviewUrl ?? "/landing-assets/tokens/token-dragon.png" })
                .ToList();
            return Results.Ok(new { items, total = items.Count });
        });

        return api;
    }
}
