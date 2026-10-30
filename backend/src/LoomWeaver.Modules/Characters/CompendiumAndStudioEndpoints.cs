using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public static class CompendiumAndStudioEndpoints
{
    private static readonly IReadOnlyDictionary<string, (string Table, string SourceCol, string DescCol)> DatasetMap =
        new Dictionary<string, (string Table, string SourceCol, string DescCol)>(StringComparer.OrdinalIgnoreCase)
        {
            ["actions"] = ("dnd_actions", "source_book", "description"),
            ["abilities"] = ("dnd_abilities", "source_book", "description"),
            ["skills"] = ("dnd_skills", "source_book", "description"),
            ["senses"] = ("dnd_senses", "source_book", "description"),
            ["languages"] = ("dnd_languages", "source_book", "description"),
            ["conditions"] = ("dnd_conditions_diseases", "source_book", "description"),
            ["cults"] = ("dnd_cults_boons", "source_book", "description"),
            ["cults-boons"] = ("dnd_cults_boons", "source_book", "description"),
            ["decks"] = ("dnd_decks", "source_book", "description"),
            ["deck-cards"] = ("dnd_deck_cards", "source_book", "description"),
            ["deities"] = ("dnd_deities", "source_book", "description"),
            ["bastions"] = ("dnd_bastions", "source_book", "description"),
            ["charcreationoptions"] = ("dnd_char_creation_options", "source_book", "description"),
            ["char-options"] = ("dnd_char_creation_options", "source_book", "description"),
            ["encounterbuilder"] = ("dnd_encounter_builder_rules", "source_book", "raw_json"),
            ["fluff"] = ("dnd_fluff", "source_book", "description"),
            ["life"] = ("dnd_life_tables", "source_book", "description"),
            ["loot"] = ("dnd_loot_tables", "source_book", "raw_json"),
            ["objects"] = ("dnd_objects", "source_book", "description"),
            ["optionalfeatures"] = ("dnd_optional_features", "source_book", "description"),
            ["optional-features"] = ("dnd_optional_features", "source_book", "description"),
            ["psionics"] = ("dnd_psionics", "source_book", "description"),
            ["recipes"] = ("dnd_recipes", "source_book", "description"),
            ["rewards"] = ("dnd_rewards", "source_book", "description"),
            ["tables"] = ("dnd_tables", "source_book", "caption"),
            ["trapshazards"] = ("dnd_traps_hazards", "source_book", "description"),
            ["traps-hazards"] = ("dnd_traps_hazards", "source_book", "description"),
            ["variantrules"] = ("dnd_variant_rules", "source_book", "description"),
            ["variant-rules"] = ("dnd_variant_rules", "source_book", "description"),
            ["rules"] = ("dnd_variant_rules", "source_book", "description"),
            ["vehicles"] = ("dnd_vehicles", "source_book", "description"),
            ["monsterfeatures"] = ("dnd_monster_features", "source_book", "effect_desc"),
            ["legendary-groups"] = ("dnd_monster_legendary_groups", "source_book", "description"),
            ["monster-templates"] = ("dnd_monster_templates", "source_book", "description"),
            ["subclasses"] = ("dnd_subclasses", "source_book", "description"),
            ["class-features"] = ("dnd_class_features", "source_book", "description"),
            ["subraces"] = ("dnd_subraces", "source_book", "description"),
            ["item-metadata"] = ("dnd_item_metadata", "source_book", "description"),
            ["magic-variants"] = ("dnd_magic_variants", "source_book", "description"),
            ["adventures-books"] = ("dnd_adventures_books", "source_book", "storyline"),
            ["sources"] = ("dnd_sources", "id", "name"),
            ["classes"] = ("dnd_custom_classes", "source_book", "description"),
            ["species"] = ("dnd_custom_species", "source_book", "description"),
            ["races"] = ("dnd_custom_species", "source_book", "description"),
            ["backgrounds"] = ("dnd_backgrounds", "source_book", "description"),
            ["feats"] = ("dnd_feats", "source_book", "description"),
            ["spells"] = ("dnd_spells", "source_book", "description"),
            ["spell-effects"] = ("dnd_spell_effects", "source_book", "spell_name"),
            ["items"] = ("dnd_items", "source_id", "description"),
            ["monsters"] = ("dnd_monster_library", "source_id", "slug"),
            ["bestiary"] = ("dnd_monster_library", "source_id", "slug")
        };

    private static readonly List<CompendiumEntryContract> CompendiumEntries = new()
    {
        new(
            "srd-spell-sunbeam-luminary",
            "Radiant Sunbeam of the Arcane",
            "Spell",
            "dnd5e",
            "6th-Level Evocation",
            "1 Action · Concentration (1 min)",
            "Channels remnant Sidhe Ard creation weave into a 60-ft radiant beam; creatures make a CON save or take 6d8 Radiant damage and are blinded.",
            "6d8 Radiant · CON Save DC 17 · 60 ft Line"
        ),
        new(
            "srd-item-quiet-maw-pouch",
            "The Quiet Maw (Extradimensional Stasis Stitch)",
            "Equipment",
            "dnd5e",
            "Wondrous Item (Very Rare)",
            "Passive / Reaction",
            "Sewn into a bag of holding's lining; creatures swallowed enter a harmless pocket plane rather than suffering lethal bite damage.",
            "WIS Save DC 16 · Non-Lethal Extradimensional Containment"
        ),
        new(
            "srd-item-artificer-condenser",
            "Phosphor-Bronze Arc Condenser",
            "Equipment",
            "dnd5e",
            "Artificer Guild Relic (Rare)",
            "1 Bonus Action",
            "Post-war non-magical defensive capacitor built by artificers to counter unregistered wizardry and thralls.",
            "+2 AC vs. Spell Attacks · 3d8 Lightning Counter-Arc"
        ),
        new(
            "srd-feat-stone-sense-scholar",
            "Stone Sense Scholar",
            "Feat",
            "dnd5e",
            "Dwarven Heritage Feat",
            "1 Bonus Action (60 ft Tremorsense)",
            "Allows the bearer to sense subterranean rune wards, hollow caverns, and ancient bound dragons clawing at bedrock up to half a league away.",
            "Advantage on History/Masonry · 60 ft Runic Tremorsense"
        ),
        new(
            "srd-spell-tandem-volley",
            "Tandem Fire-Drake Volley",
            "Spell",
            "dnd5e",
            "3rd-Level Conjuration / Evocation",
            "1 Bonus Action (Familiar Command)",
            "A familiar exhales a concentrated cinder arc that ignites targets and illuminates fog-of-war tiles.",
            "4d6 Fire · DEX Save DC 16 · 15 ft Cone"
        ),
        new(
            "srd-feat-slingshot-tooth-crit",
            "Improvised Slingshot Mastery",
            "Feat",
            "dnd5e",
            "Feywild Outcast Trick",
            "1 Action (60/120 ft)",
            "Loads a tooth, pebble, or brass gear into a slingshot; critical hits bypass magical resistance and deal bonus force trauma to targets at 1 HP.",
            "1d8+4 Force/Bludgeoning · Crit Range 19-20"
        )
    };

    private static readonly List<ParticleEmitterCurveContract> EmitterPresets = new()
    {
        new(
            "emit-solar-supernova",
            "Radiant Luminary Supernova",
            420,
            1150,
            -1.2,
            38.0,
            0.35,
            2.40,
            "Additive",
            "#ffe299",
            "#ff6b4a"
        ),
        new(
            "emit-crimson-mist",
            "Vampire Blood-Mist",
            280,
            1600,
            0.4,
            65.0,
            0.50,
            1.85,
            "AlphaBlend",
            "#ff4d6d",
            "#2b0912"
        ),
        new(
            "emit-artificer-aether",
            "Artificer Phosphor-Bronze Spark",
            520,
            780,
            -3.8,
            24.0,
            0.22,
            1.15,
            "Additive",
            "#70d6ff",
            "#e5b85c"
        )
    };

    public static RouteGroupBuilder MapCompendiumAndStudioEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/compendium/search", async (string? q, string? category, int? limit, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var results = new List<CompendiumEntryContract>();
            var take = Math.Clamp(limit ?? 60, 1, 250);
            var query = (q ?? "").Trim();
            var cat = (category ?? "All").Trim();

            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);

                if (string.Equals(cat, "All", StringComparison.OrdinalIgnoreCase) || string.Equals(cat, "Spell", StringComparison.OrdinalIgnoreCase))
                {
                    await using var cmd = new MySqlCommand("""
                        SELECT id, name, COALESCE(spell_type, CONCAT('Level ', level, ' ', COALESCE(school, 'Evocation'))),
                               COALESCE(casting_time, '1 Action'), COALESCE(LEFT(description, 260), ''),
                               COALESCE(range_text, '60 feet'), COALESCE(duration_text, 'Instantaneous'),
                               image_path, COALESCE(source_book, 'PHB'), default_effect_id
                        FROM dnd_spells
                        WHERE (@q = '' OR name LIKE @like OR school LIKE @like OR description LIKE @like)
                        ORDER BY level ASC, name ASC
                        LIMIT @lim
                        """, db);
                    cmd.Parameters.AddWithValue("@q", query);
                    cmd.Parameters.AddWithValue("@like", $"%{query}%");
                    cmd.Parameters.AddWithValue("@lim", take);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var sid = Convert.ToInt64(r.GetValue(0));
                        results.Add(new CompendiumEntryContract(
                            $"spell-{sid}",
                            r.GetString(1),
                            "Spell",
                            "dnd5e",
                            r.GetString(2),
                            $"{r.GetString(3)} · {r.GetString(6)}",
                            r.GetString(4),
                            $"Range: {r.GetString(5)} · Source: {r.GetString(8)}",
                            r.IsDBNull(7) ? null : r.GetString(7),
                            r.GetString(8),
                            r.IsDBNull(9) ? null : r.GetString(9)
                        ));
                    }
                }

                if (string.Equals(cat, "All", StringComparison.OrdinalIgnoreCase) || string.Equals(cat, "Equipment", StringComparison.OrdinalIgnoreCase) || string.Equals(cat, "Item", StringComparison.OrdinalIgnoreCase))
                {
                    await using var cmd = new MySqlCommand("""
                        SELECT id, name, CONCAT(COALESCE(item_type, 'Item'), ' (', COALESCE(rarity, 'Common'), ')'),
                               COALESCE(LEFT(description, 260), ''), COALESCE(CAST(properties_json AS CHAR), ''), '',
                               image_path, COALESCE(source_id, 'DMG')
                        FROM dnd_items
                        WHERE (@q = '' OR name LIKE @like OR item_type LIKE @like OR description LIKE @like)
                        ORDER BY name ASC
                        LIMIT @lim
                        """, db);
                    cmd.Parameters.AddWithValue("@q", query);
                    cmd.Parameters.AddWithValue("@like", $"%{query}%");
                    cmd.Parameters.AddWithValue("@lim", take);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var iid = Convert.ToInt64(r.GetValue(0));
                        var dmg = string.IsNullOrWhiteSpace(r.GetString(4)) ? "Equipment / Wondrous" : $"{r.GetString(4)} {r.GetString(5)}".Trim();
                        results.Add(new CompendiumEntryContract(
                            $"item-{iid}",
                            r.GetString(1),
                            "Equipment",
                            "dnd5e",
                            r.GetString(2),
                            "Equip / Use Item",
                            r.GetString(3),
                            $"{dmg} · Source: {r.GetString(7)}",
                            r.IsDBNull(6) ? null : r.GetString(6),
                            r.GetString(7)
                        ));
                    }
                }

                if (string.Equals(cat, "All", StringComparison.OrdinalIgnoreCase) || string.Equals(cat, "Feat", StringComparison.OrdinalIgnoreCase))
                {
                    await using var cmd = new MySqlCommand("""
                        SELECT id, name, COALESCE(category, 'Feat'), COALESCE(LEFT(description, 260), ''),
                               image_path, COALESCE(source_book, 'PHB')
                        FROM dnd_feats
                        WHERE (@q = '' OR name LIKE @like OR description LIKE @like)
                        ORDER BY name ASC
                        LIMIT @lim
                        """, db);
                    cmd.Parameters.AddWithValue("@q", query);
                    cmd.Parameters.AddWithValue("@like", $"%{query}%");
                    cmd.Parameters.AddWithValue("@lim", take);
                    await using var r = await cmd.ExecuteReaderAsync(ct);
                    while (await r.ReadAsync(ct))
                    {
                        var fid = Convert.ToInt64(r.GetValue(0));
                        results.Add(new CompendiumEntryContract(
                            $"feat-{fid}",
                            r.GetString(1),
                            "Feat",
                            "dnd5e",
                            r.GetString(2),
                            "Passive / Feature",
                            r.GetString(3),
                            $"Source: {r.GetString(5)}",
                            r.IsDBNull(4) ? null : r.GetString(4),
                            r.GetString(5)
                        ));
                    }
                }
            }
            catch { }

            var seedMatches = CompendiumEntries
                .Where(c =>
                    (string.IsNullOrWhiteSpace(category) ||
                     string.Equals(category, "All", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(c.Category, category, StringComparison.OrdinalIgnoreCase)) &&
                    (string.IsNullOrWhiteSpace(q) ||
                     c.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                     c.Summary.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                     c.MechanicalPayload.Contains(q, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            results.InsertRange(0, seedMatches);
            return Results.Ok(results.Take(take * 2).ToList());
        });

        api.MapGet("/compendium/summary", async (LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var counts = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                foreach (var kvp in DatasetMap.DistinctBy(x => x.Value.Table))
                {
                    try
                    {
                        await using var cmd = new MySqlCommand($"SELECT COUNT(*) FROM `{kvp.Value.Table}`;", db);
                        counts[kvp.Key] = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
                    }
                    catch
                    {
                        counts[kvp.Key] = 0;
                    }
                }
            }
            catch { }
            return Results.Ok(new { datasets = counts, totalDatasets = counts.Count });
        });

        api.MapGet("/compendium/{dataset}", async (
            string dataset,
            string? search,
            string? source,
            int? limit,
            int? offset,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            if (!DatasetMap.TryGetValue(dataset, out var meta))
            {
                return Results.NotFound(new { message = $"Unknown compendium dataset '{dataset}'." });
            }

            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                var conditions = new List<string>();
                await using var cmd = db.CreateCommand();

                if (!string.IsNullOrWhiteSpace(search))
                {
                    conditions.Add($"(`name` LIKE @search OR `{meta.DescCol}` LIKE @search OR `{meta.SourceCol}` LIKE @search)");
                    cmd.Parameters.AddWithValue("@search", $"%{search.Trim()}%");
                }
                if (!string.IsNullOrWhiteSpace(source) && !string.Equals(source, "all", StringComparison.OrdinalIgnoreCase))
                {
                    conditions.Add($"LOWER(`{meta.SourceCol}`) = LOWER(@source)");
                    cmd.Parameters.AddWithValue("@source", source.Trim());
                }

                var whereSql = conditions.Count > 0 ? "WHERE " + string.Join(" AND ", conditions) : "";
                var take = Math.Clamp(limit ?? 100, 1, 1000);
                var skip = Math.Max(0, offset ?? 0);
                var orderCol = string.Equals(meta.Table, "dnd_spell_effects", StringComparison.OrdinalIgnoreCase) ? "spell_name" : "name";
                cmd.CommandText = $"SELECT * FROM `{meta.Table}` {whereSql} ORDER BY `{orderCol}` ASC LIMIT {take} OFFSET {skip};";

                var items = new List<Dictionary<string, object?>>();
                await using var r = await cmd.ExecuteReaderAsync(ct);
                while (await r.ReadAsync(ct))
                {
                    var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    for (var i = 0; i < r.FieldCount; i++)
                    {
                        row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                    }
                    items.Add(row);
                }
                return Results.Ok(new { dataset, table = meta.Table, items, total = items.Count });
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });

        api.MapPost("/campaigns/{campaignId:int}/maps/{sceneId}/sculpt-heightmap", (
            int campaignId,
            string sceneId,
            HeightmapSculptRequest req) =>
        {
            var biome = string.IsNullOrWhiteSpace(req.BiomePreset) ? "Default Biome" : req.BiomePreset.Trim();
            var radius = Math.Clamp(req.BrushRadiusMeters <= 0 ? 12.0 : req.BrushRadiusMeters, 2.0, 48.0);
            var delta = Math.Clamp(req.ElevationDelta, -15.0, 25.0);
            var water = Math.Clamp(req.WaterLevelMeters, -5.0, 12.0);
            var octaves = Math.Clamp(req.RoughnessOctaves <= 0 ? 4 : req.RoughnessOctaves, 1, 8);

            var summary =
                $"Sculpted '{biome}' heightmap (Radius={radius:F1}m, Elevation={delta:+0.0;-0.0;0.0}m, Octaves={octaves}, WaterTable={water:F1}m).";

            TableRealtimeEndpoints.RecordEvent(
                campaignId,
                "map_sculpted",
                "LoomMaps Sculptor",
                summary,
                "{}"
            );

            return Results.Ok(new HeightmapSculptResponse(
                sceneId,
                biome,
                radius,
                Math.Round(8.4 + Math.Max(0, delta), 2),
                water,
                4096,
                summary,
                DateTimeOffset.UtcNow
            ));
        });

        api.MapGet("/campaigns/{campaignId:int}/effects/emitter-presets", (int campaignId) =>
            Results.Ok(EmitterPresets));

        api.MapPost("/campaigns/{campaignId:int}/effects/emitter-presets", (
            int campaignId,
            ParticleEmitterCurveContract req) =>
        {
            var created = req with
            {
                Id = string.IsNullOrWhiteSpace(req.Id)
                    ? $"emit-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"
                    : req.Id
            };
            EmitterPresets.Insert(0, created);
            return Results.Ok(created);
        });

        api.MapCharacterCreatorCatalogEndpoints();
        api.MapCustomFeatsBackgroundsEndpoints();
        api.MapStoreEndpoints();

        return api;
    }
}
