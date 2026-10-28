using LoomWeaver.Domain;
using LoomWeaver.Modules.Maps.Features.BuildWallsAndPaths;
using LoomWeaver.Modules.Maps.Features.SaveScene;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LoomWeaver.Modules.Maps;

public static class LoomMapsEndpoints
{
    private static readonly Dictionary<string, MapSceneGraphDto> Scenes = SeedScenes();

    public static void MapLoomMapsEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapLoomMapsStudioStage1Endpoints();
        Features.WorldAtlas.AtlasEndpoints.MapWorldAtlasEndpoints(group);
        group.MapBuildWallsAndPathsEndpoints();

        group.MapGet("/campaigns/{campaignId:int}/maps/{sceneKey}/scene-graph", (
            int campaignId,
            string sceneKey,
            string? role) =>
        {
            var isGm = string.Equals(role ?? "gm", "gm", StringComparison.OrdinalIgnoreCase);
            if (!Scenes.TryGetValue(sceneKey, out var scene))
            {
                scene = Scenes.Values.First();
            }

            var filteredStamps = scene.Stamps
                .Where(s => isGm || s.Visibility != "gm")
                .ToList();

            return Results.Ok(scene with { Stamps = filteredStamps });
        });

        group.MapPost("/campaigns/{campaignId:int}/maps/{sceneKey}/commands", (
            int campaignId,
            string sceneKey,
            MapSceneCommandRequest cmd) =>
        {
            if (!string.Equals(cmd.ViewerRole, "gm", StringComparison.OrdinalIgnoreCase))
            {
                return Results.Json(
                    new { error = "Forbidden: Only the GM may commit authoritative map scene edits." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            if (!Scenes.TryGetValue(sceneKey, out var scene))
            {
                scene = Scenes.Values.First();
            }

            var nextRevision = scene.Revision + 1;
            var stamps = scene.Stamps.ToList();
            var lights = scene.Lights.ToList();

            if (cmd.ToolId == "stamps")
            {
                stamps.Add(new MapStampNodeDto(
                    Id: $"stamp-{nextRevision}",
                    Label: cmd.AssetName ?? "Gothic Pillar Stamp",
                    Category: "Architecture",
                    X: cmd.X,
                    Z: cmd.Z,
                    Scale: 1.15,
                    RotationY: (cmd.Seed % 360) * (Math.PI / 180.0),
                    ColorHex: "#d4a853",
                    Visibility: "players"
                ));
            }
            else if (cmd.ToolId == "lighting")
            {
                lights.Add(new LightNodeDto(
                    Id: $"light-{nextRevision}",
                    Label: $"Brazier Point Light #{nextRevision}",
                    X: cmd.X,
                    Y: 4.5,
                    Z: cmd.Z,
                    Range: Math.Max(6, cmd.Radius * 2),
                    Intensity: Math.Clamp(cmd.Intensity / 50.0, 0.5, 2.5),
                    ColorHex: "#ffae52"
                ));
            }

            var updated = scene with
            {
                Revision = nextRevision,
                ScatterSeed = cmd.Seed > 0 ? cmd.Seed : scene.ScatterSeed,
                ScatterDensity = cmd.Intensity > 0 ? cmd.Intensity : scene.ScatterDensity,
                Stamps = stamps,
                Lights = lights
            };

            Scenes[scene.SceneKey] = updated;
            return Results.Ok(updated);
        });
    }

    private static Dictionary<string, MapSceneGraphDto> SeedScenes() =>
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["scene-cinth-ballroom"] = new(
                SceneKey: "scene-cinth-ballroom",
                CampaignId: 1,
                Name: "Cinth Grand Masquerade Ballroom",
                Biome: "Obsidian & Gold Cathedral",
                WeatherPreset: "Crimson Nocturne Mist",
                LightingProfile: "2.5D Candlelight & Chandelier Shadows",
                GridCols: 36,
                GridRows: 28,
                Revision: 14,
                ScatterSeed: 1042,
                ScatterDensity: 65,
                Stamps:
                [
                    new("st-1", "Lord Emrys Balcony Dais", "POI", -6, 4, 1.4, 0, "#d4a853", "players"),
                    new("st-2", "Cinth Artificer Clockwork Organ", "Prop", 5, 6, 1.2, 0.5, "#2ed39a", "players"),
                    new("st-3", "Hidden Vampire Coffin Vault", "Secret", 8, -5, 1.1, 0, "#ef5d72", "gm"),
                ],
                WaterSplines:
                [
                    new("ws-1", "Cinth Reflective Canal & Fountain Channel", 2.8, "#1e6b7b",
                        [[-14, 0.12, -8], [-5, 0.12, -2], [4, 0.12, 2], [14, 0.12, 7]])
                ],
                Lights:
                [
                    new("lt-1", "Grand Gold Chandelier", 0, 7, 0, 22, 1.6, "#ffcf75"),
                    new("lt-2", "Crimson Balcony Sconce", -6, 5, 4, 14, 1.2, "#ff6b6b"),
                ]
            )
        };
}
