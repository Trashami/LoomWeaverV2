using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Infrastructure.Neo4j;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Characters;

public sealed record LoomScopedNoteRequest(
    int CampaignId,
    string Title,
    string ContentHtml,
    string ContentText,
    string NoteType,
    string Visibility,
    string AuthorUsername,
    string SourceEntityKey,
    string SourceEntityName,
    IReadOnlyList<string> MentionedCompositeKeys
);

public static class CharacterCreatorCatalogEndpoints
{
    public static RouteGroupBuilder MapCharacterCreatorCatalogEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/characters/creator-catalog", async (HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var ownerId = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx)?.Id ?? -1;
            var species = new List<object>();
            var subraces = new List<object>();
            var classes = new List<object>();
            var subclasses = new List<object>();
            var backgrounds = new List<object>();
            var feats = new List<object>();
            var items = new List<object>();
            var spells = new List<object>();

            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, COALESCE(source_book, 'PHB'), COALESCE(size, 'Medium'),
                           COALESCE(speed_json, '{"walk":30}'), COALESCE(ability_score_increases_json, ''),
                           COALESCE(traits_json, '[]'), COALESCE(LEFT(description, 280), ''), image_path
                    FROM dnd_custom_species
                    WHERE is_public = 1
                    ORDER BY name ASC
                    LIMIT 300;
                    """, db))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        species.Add(new
                        {
                            id = r.GetInt64(0),
                            name = r.GetString(1),
                            sourceBook = r.GetString(2),
                            size = r.GetString(3),
                            speedJson = r.GetString(4),
                            abilityIncreasesJson = r.GetString(5),
                            traitsJson = r.GetString(6),
                            description = r.GetString(7),
                            imagePath = r.IsDBNull(8) ? null : r.GetString(8)
                        });
                    }
                }

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, race_name, COALESCE(source_book, 'PHB'),
                           COALESCE(ability_score_increases_json, ''), COALESCE(traits_json, '[]'),
                           COALESCE(LEFT(description, 220), ''), image_path
                    FROM dnd_subraces
                    WHERE is_public = 1
                    ORDER BY race_name ASC, name ASC
                    LIMIT 200;
                    """, db))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        subraces.Add(new
                        {
                            id = r.GetInt64(0),
                            name = r.GetString(1),
                            raceName = r.GetString(2),
                            sourceBook = r.GetString(3),
                            abilityIncreasesJson = r.GetString(4),
                            traitsJson = r.GetString(5),
                            description = r.GetString(6),
                            imagePath = r.IsDBNull(7) ? null : r.GetString(7)
                        });
                    }
                }

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, COALESCE(source_book, 'PHB'), COALESCE(hit_die, 'd8'),
                           COALESCE(primary_ability, 'STR'), COALESCE(saving_throws_json, '[]'),
                           spellcasting_ability, COALESCE(spellcasting_progression, 'none'),
                           COALESCE(subclass_title, 'Archetype'), COALESCE(LEFT(description, 280), ''), image_path
                    FROM dnd_custom_classes
                    WHERE is_public = 1
                    ORDER BY name ASC
                    LIMIT 80;
                    """, db))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        classes.Add(new
                        {
                            id = r.GetInt64(0),
                            name = r.GetString(1),
                            sourceBook = r.GetString(2),
                            hitDie = r.GetString(3),
                            primaryAbility = r.GetString(4),
                            savingThrowsJson = r.GetString(5),
                            spellcastingAbility = r.IsDBNull(6) ? null : r.GetString(6),
                            spellcastingProgression = r.GetString(7),
                            subclassTitle = r.GetString(8),
                            description = r.GetString(9),
                            imagePath = r.IsDBNull(10) ? null : r.GetString(10)
                        });
                    }
                }

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, short_name, class_name, COALESCE(source_book, 'PHB'),
                           COALESCE(LEFT(description, 220), '')
                    FROM v_dnd_subclasses_full
                    WHERE is_public = 1
                    ORDER BY class_name ASC, name ASC
                    LIMIT 400;
                    """, db))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        subclasses.Add(new
                        {
                            id = r.GetInt64(0),
                            name = r.GetString(1),
                            shortName = r.GetString(2),
                            className = r.GetString(3),
                            sourceBook = r.GetString(4),
                            description = r.GetString(5)
                        });
                    }
                }

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, COALESCE(source_book, 'PHB'),
                           COALESCE(CAST(skill_proficiencies_json AS CHAR), '[]'),
                           COALESCE(CAST(tool_proficiencies_json AS CHAR), '[]'),
                           COALESCE(feature_name, 'Background Feature'),
                           COALESCE(LEFT(feature_desc, 220), ''),
                           COALESCE(LEFT(description, 260), '')
                    FROM dnd_backgrounds
                    WHERE (is_canonical = 1 AND is_public = 1) OR (is_canonical = 0 AND owner_id = @owner)
                    ORDER BY name ASC
                    LIMIT 400;
                    """, db).WithParameter("@owner", ownerId))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        backgrounds.Add(new
                        {
                            id = r.GetInt64(0),
                            name = r.GetString(1),
                            sourceBook = r.GetString(2),
                            skillsJson = CatalogProficiencyJson.ToStringArray(r.GetString(3)),
                            toolsJson = CatalogProficiencyJson.ToStringArray(r.GetString(4)),
                            featureName = r.GetString(5),
                            featureDesc = r.GetString(6),
                            description = r.GetString(7)
                        });
                    }
                }

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, COALESCE(source_book, 'PHB'), COALESCE(category, 'General'),
                           COALESCE(CAST(prerequisite_json AS CHAR), ''),
                           COALESCE(LEFT(description, 280), '')
                    FROM dnd_feats
                    WHERE (is_canonical = 1 AND is_public = 1) OR (is_canonical = 0 AND owner_id = @owner)
                    ORDER BY name ASC
                    LIMIT 500;
                    """, db).WithParameter("@owner", ownerId))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        feats.Add(new
                        {
                            id = r.GetInt64(0),
                            name = r.GetString(1),
                            sourceBook = r.GetString(2),
                            category = r.GetString(3),
                            prerequisiteJson = r.GetString(4),
                            description = r.GetString(5)
                        });
                    }
                }

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, COALESCE(source_id, 'PHB'), COALESCE(item_type, 'Gear'),
                           COALESCE(rarity, 'none'), COALESCE(weight, 1.0), COALESCE(value_gp, 0),
                           COALESCE(CAST(properties_json AS CHAR), '{}'),
                           COALESCE(LEFT(description, 240), '')
                    FROM dnd_items
                    ORDER BY CASE WHEN rarity IN ('none', 'common', 'Common') THEN 0 ELSE 1 END, name ASC
                    LIMIT 450;
                    """, db))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        items.Add(new
                        {
                            id = Convert.ToInt64(r.GetValue(0)),
                            name = r.GetString(1),
                            source = r.GetString(2),
                            itemType = r.GetString(3),
                            rarity = r.GetString(4),
                            weight = Convert.ToDouble(r.GetValue(5)),
                            valueGp = Convert.ToDouble(r.GetValue(6)),
                            propertiesJson = r.GetString(7),
                            description = r.GetString(8)
                        });
                    }
                }

                await using (var cmd = new MySqlCommand("""
                    SELECT id, name, level, COALESCE(school, 'Evocation'),
                           COALESCE(casting_time, '1 Action'), COALESCE(range_text, '60 feet'),
                           COALESCE(duration_text, 'Instantaneous'), concentration, ritual,
                           COALESCE(CAST(classes_json AS CHAR), '[]'),
                           COALESCE(LEFT(description, 260), ''), COALESCE(source_book, 'PHB')
                    FROM dnd_spells
                    ORDER BY level ASC, name ASC
                    LIMIT 500;
                    """, db))
                await using (var r = await cmd.ExecuteReaderAsync(ct))
                {
                    while (await r.ReadAsync(ct))
                    {
                        spells.Add(new
                        {
                            id = Convert.ToInt64(r.GetValue(0)),
                            name = r.GetString(1),
                            level = Convert.ToInt32(r.GetValue(2)),
                            school = r.GetString(3),
                            castingTime = r.GetString(4),
                            range = r.GetString(5),
                            duration = r.GetString(6),
                            concentration = Convert.ToBoolean(r.GetValue(7)),
                            ritual = Convert.ToBoolean(r.GetValue(8)),
                            classesJson = r.GetString(9),
                            description = r.GetString(10),
                            sourceBook = r.GetString(11)
                        });
                    }
                }
            }
            catch
            {
                // Return partial or empty arrays on local dev when MySQL is offline
            }

            return Results.Ok(new
            {
                species,
                subraces,
                classes,
                subclasses,
                backgrounds,
                feats,
                items,
                spells
            });
        });

        api.MapPost("/loom/notes", async (
            LoomScopedNoteRequest req,
            LoomWeaverMySqlRepository mysql,
            LoomWeaverNeo4jService neo4j,
            CancellationToken ct) =>
        {
            var noteId = $"note-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
            var campaignId = req.CampaignId <= 0 ? 1 : req.CampaignId;
            var compositeKey = $"{campaignId}:Note:{noteId}";

            try
            {
                await using var db = await mysql.OpenConnectionAsync(ct);
                await using var cmd = new MySqlCommand("""
                    INSERT INTO lw_lore_entries (campaign_id, entry_key, category, title, subtitle, summary, visibility_scope, payload_json)
                    VALUES (@cid, @ekey, 'Notes', @title, @sub, @sum, @vis, @payload)
                    ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), visibility_scope = VALUES(visibility_scope), payload_json = VALUES(payload_json);
                    """, db);
                cmd.Parameters.AddWithValue("@cid", campaignId);
                cmd.Parameters.AddWithValue("@ekey", noteId);
                cmd.Parameters.AddWithValue("@title", req.Title);
                cmd.Parameters.AddWithValue("@sub", $"{req.NoteType} · {req.Visibility} · by {req.AuthorUsername}");
                cmd.Parameters.AddWithValue("@sum", req.ContentText);
                cmd.Parameters.AddWithValue("@vis", req.Visibility);
                cmd.Parameters.AddWithValue("@payload", JsonSerializer.Serialize(req));
                await cmd.ExecuteNonQueryAsync(ct);

                var neoVis = string.Equals(req.Visibility, "global", StringComparison.OrdinalIgnoreCase)
                    ? "players"
                    : "gm";

                await neo4j.ProjectCharacterOrNpcNodeAsync(
                    campaignId,
                    new EntitySummaryDto(
                        compositeKey,
                        campaignId,
                        "Note",
                        noteId,
                        req.Title,
                        $"{req.NoteType} · {req.Visibility}",
                        req.ContentText,
                        neoVis,
                        "approved",
                        "/characters"),
                    null,
                    null,
                    ct);

                var targets = (req.MentionedCompositeKeys ?? Array.Empty<string>()).Distinct().ToList();
                if (!string.IsNullOrWhiteSpace(req.SourceEntityKey) && !targets.Contains(req.SourceEntityKey))
                {
                    targets.Insert(0, req.SourceEntityKey);
                }

                var relIdx = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                foreach (var targetKey in targets)
                {
                    await neo4j.ProjectEntityRelationshipAsync(
                        relIdx++,
                        campaignId,
                        compositeKey,
                        "MENTIONS",
                        targetKey,
                        neoVis,
                        $"Mentioned in {req.Visibility} {req.NoteType} note '{req.Title}'",
                        1,
                        null,
                        null,
                        ct
                    );

                    if (!string.IsNullOrWhiteSpace(req.SourceEntityKey) && req.SourceEntityKey != targetKey)
                    {
                        await neo4j.ProjectEntityRelationshipAsync(
                            relIdx++,
                            campaignId,
                            req.SourceEntityKey,
                            "LINKED_IN_NOTE",
                            targetKey,
                            neoVis,
                            $"Connected via {req.Visibility} note '{req.Title}'",
                            1,
                            null,
                            null,
                            ct
                        );
                    }
                }
            }
            catch
            {
                // Non-fatal if DB or Neo4j is offline locally
            }

            return Results.Ok(new
            {
                noteId,
                compositeKey,
                req.Title,
                req.NoteType,
                req.Visibility,
                req.SourceEntityKey,
                req.MentionedCompositeKeys,
                savedAt = DateTimeOffset.UtcNow
            });
        });

        return api;
    }
}
