using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Knowledge;

// Powers the @ reference picker in the Create editor. Players are excluded because they are accounts, not campaign content.
public static class ContentReferenceEndpoints
{
    private static readonly HashSet<string> ReferenceKinds = new(StringComparer.Ordinal)
    {
        "PlayerCharacter", "NPC", "Monster", "Location", "Faction", "Quest", "Artifact", "Encounter",
        "Session", "Event", "Secret", "Clue", "Claim", "Lore", "Room", "Scene", "Chapter", "Handout"
    };

    public static RouteGroupBuilder MapContentReferenceEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/references", ListReferencesAsync);
        return api;
    }

    private static async Task<IResult> ListReferencesAsync(
        int campaignId,
        string? kind,
        string? q,
        HttpContext context,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        var access = await CampaignAccessResolver.ResolveAsync(context, campaignId, null, ct);
        if (!access.IsMember) return Results.Forbid();

        var visibilityClause = access.IsEffectiveGm ? string.Empty : "AND visibility IN ('public', 'players')";
        await using var db = await mysql.OpenConnectionAsync(ct);

        if (string.IsNullOrWhiteSpace(kind))
        {
            var categories = new List<object>();
            await using (var cmd = new MySqlCommand($"""
                SELECT entity_type, COUNT(*) AS total
                FROM lw_entities
                WHERE campaign_id = @cid {visibilityClause}
                GROUP BY entity_type
                ORDER BY entity_type;
                """, db))
            {
                cmd.Parameters.AddWithValue("@cid", campaignId);
                await using var reader = await cmd.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    var type = reader.GetString("entity_type");
                    if (!ReferenceKinds.Contains(type)) continue;
                    categories.Add(new { kind = type, count = reader.GetInt64("total") });
                }
            }
            return Results.Ok(new { categories });
        }

        if (!ReferenceKinds.Contains(kind.Trim()))
            return Results.BadRequest(new { error = "Unknown reference kind." });

        var entityType = kind.Trim();
        var search = string.IsNullOrWhiteSpace(q) ? null : $"%{q.Trim()}%";
        var items = new List<object>();
        await using (var cmd = new MySqlCommand($"""
            SELECT entity_key, name, subtitle, visibility
            FROM lw_entities
            WHERE campaign_id = @cid AND entity_type = @type {visibilityClause}
              AND (@search IS NULL OR name LIKE @search)
            ORDER BY name
            LIMIT 50;
            """, db))
        {
            cmd.Parameters.AddWithValue("@cid", campaignId);
            cmd.Parameters.AddWithValue("@type", entityType);
            cmd.Parameters.AddWithValue("@search", (object?)search ?? DBNull.Value);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var key = reader.GetString("entity_key");
                items.Add(new
                {
                    compositeKey = $"{campaignId}:{entityType}:{key}",
                    kind = entityType,
                    label = reader.GetString("name"),
                    subtitle = reader["subtitle"] as string ?? string.Empty,
                    visibility = reader.GetString("visibility")
                });
            }
        }

        return Results.Ok(new { kind = entityType, items });
    }
}
