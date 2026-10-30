using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Maps.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Maps.Features.SaveScene;

public sealed record VttWallDto(string Id, string Label, double X1, double Z1, double X2, double Z2, bool BlocksVision, bool BlocksMovement);
public sealed record VttSceneDto(string SceneKey, string Name, int Revision, IReadOnlyList<VttWallDto> Walls);
public sealed record VttSceneListItem(string SceneKey, string Name, int Revision);

/// <summary>Hands a saved map to the table: members receive only walls in VTT units, never the GM's full scene document.</summary>
public static class VttSceneEndpoints
{
    // A map square is 1.5 m (5 ft) and the VTT uses 2 world units per 5 ft square.
    private const double WorldUnitsPerMeter = 2 / 1.5;

    public static void MapVttSceneEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/maps/scenes", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);
            var items = new List<VttSceneListItem>();
            await using var db = await mysql.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand(
                "SELECT scene_key, revision, document_json FROM lw_battlemap_scenes WHERE campaign_id=@c AND (@gm = 1 OR visibility IN ('public','players')) ORDER BY updated_at DESC LIMIT 50", db);
            cmd.Parameters.AddWithValue("@c", campaignId);
            cmd.Parameters.AddWithValue("@gm", access.IsEffectiveGm ? 1 : 0);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                items.Add(new VttSceneListItem(r.GetString(0), NameOf(JsonSerializer.Deserialize<JsonElement>(r.GetString(2)), r.GetString(0)), r.GetInt32(1)));
            return Results.Ok(items);
        });

        group.MapGet("/campaigns/{campaignId:int}/maps/{sceneKey}/vtt-scene", async (
            int campaignId, string sceneKey, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);
            var stored = await MapSceneDocumentRepository.LoadAsync(mysql, campaignId, sceneKey, ct);
            if (stored is null || (!access.IsEffectiveGm && stored.Visibility == "gm"))
                return Results.NotFound(new { error = "That scene has not been saved." });
            return Results.Ok(Project(sceneKey, stored, access.IsEffectiveGm));
        });
    }

    public static VttSceneDto Project(string sceneKey, StoredMapSceneDocument stored, bool viewerIsGm)
    {
        var walls = new List<VttWallDto>();
        var includeWalls = viewerIsGm || stored.Visibility != "gm";
        if (includeWalls && stored.Document.TryGetProperty("walls", out var list) && list.ValueKind == JsonValueKind.Array)
        {
            foreach (var wall in list.EnumerateArray().Take(500))
            {
                var id = wall.TryGetProperty("id", out var i) ? i.GetString() ?? "wall" : "wall";
                var name = wall.TryGetProperty("name", out var n) ? n.GetString() ?? "Wall" : "Wall";
                if (!wall.TryGetProperty("points", out var pts) || pts.ValueKind != JsonValueKind.Array) continue;
                var points = pts.EnumerateArray()
                    .Where(p => p.ValueKind == JsonValueKind.Array && p.GetArrayLength() >= 2)
                    .Select(p => (X: p[0].GetDouble() * WorldUnitsPerMeter, Z: p[1].GetDouble() * WorldUnitsPerMeter))
                    .Take(400).ToList();
                for (var k = 0; k + 1 < points.Count; k++)
                    walls.Add(new VttWallDto($"{id}-{k}", name, points[k].X, points[k].Z, points[k + 1].X, points[k + 1].Z, true, true));
            }
        }

        return new VttSceneDto(sceneKey, NameOf(stored.Document, sceneKey), stored.Revision, walls);
    }

    private static string NameOf(JsonElement doc, string fallback) =>
        doc.ValueKind == JsonValueKind.Object && doc.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String
            ? n.GetString() ?? fallback : fallback;
}
