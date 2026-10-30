using LoomWeaver.Modules.Maps.Features.SaveScene;
using LoomWeaver.Modules.Maps.Infrastructure;

namespace LoomWeaver.Modules.Maps.Features.BuildWallsAndPaths;

public static class BuildWallsAndPathsHandler
{
    private static readonly Dictionary<string, SceneArchitectureStateDto> ArchitectureByScene = SeedArchitecture();

    public static SceneArchitectureStateDto GetArchitectureForRole(string sceneKey, string? role)
    {
        if (!ArchitectureByScene.TryGetValue(sceneKey, out var state))
        {
            state = ArchitectureByScene.Values.First() with { SceneKey = sceneKey };
            ArchitectureByScene[sceneKey] = state;
        }

        var isGm = MapPermissionPolicy.CanSaveSceneRevision(role ?? "gm");
        if (isGm)
        {
            return state;
        }

        var playerSafeWalls = state.Walls
            .Select(w => w with
            {
                Openings = w.Openings
                    .Where(o => !o.IsSecret || o.IsRevealedToPlayers)
                    .ToList()
            })
            .ToList();

        return state with { Walls = playerSafeWalls };
    }

    public static SceneArchitectureStateDto AddWallChamber(
        int campaignId,
        string sceneKey,
        CreateWallChamberRequest req)
    {
        var current = GetArchitectureForRole(sceneKey, "gm");
        var nextRev = current.Revision + 1;
        var points = GeneratePolygonVertices(req.DrawMode, req.CenterX, req.CenterZ, req.WidthMeters, req.DepthMeters);

        var wall = new MapWallChamberDto(
            Id: $"wall-{nextRev}",
            Name: req.Name.Trim(),
            DrawMode: req.DrawMode,
            Material: req.Material,
            ThicknessMeters: req.ThicknessMeters,
            HeightMeters: req.HeightMeters,
            Perspective: req.Perspective,
            Projection: req.Projection,
            HasCornerPosts: req.HasCornerPosts,
            LevelIndex: req.LevelIndex,
            Points: points,
            Openings: req.Openings ??
            [
                new($"open-{nextRev}-1", "double_door", 0.5, 2.4, false, false, true)
            ]
        );

        var snapshot = SceneRepository.GetOrCreateSnapshot(campaignId, sceneKey);
        var outboxId = SceneOutboxWriter.EnqueueRevisionProjection(
            snapshot with { Revision = nextRev },
            $"Added [{req.DrawMode}] chamber '{wall.Name}' ({wall.Material}, {wall.Perspective})");

        var updated = current with
        {
            Revision = nextRev,
            Walls = [.. current.Walls, wall],
            LastOutboxEventId = outboxId
        };

        ArchitectureByScene[sceneKey] = updated;
        return updated;
    }

    public static SceneArchitectureStateDto AddPathRibbon(
        int campaignId,
        string sceneKey,
        CreatePathRibbonRequest req)
    {
        var current = GetArchitectureForRole(sceneKey, "gm");
        var nextRev = current.Revision + 1;

        var path = new MapPathRibbonDto(
            Id: $"path-{nextRev}",
            Name: req.Name.Trim(),
            Style: req.Style,
            WidthMeters: req.WidthMeters,
            CurveAngleDeg: req.CurveAngleDeg,
            CliffStrataBands: req.CliffStrataBands,
            ColorHex: req.ColorHex,
            LevelIndex: req.LevelIndex,
            Waypoints: req.Waypoints
        );

        var snapshot = SceneRepository.GetOrCreateSnapshot(campaignId, sceneKey);
        var outboxId = SceneOutboxWriter.EnqueueRevisionProjection(
            snapshot with { Revision = nextRev },
            $"Traced [{req.Style}] path ribbon '{path.Name}' ({req.Waypoints.Count} waypoints)");

        var updated = current with
        {
            Revision = nextRev,
            Paths = [.. current.Paths, path],
            LastOutboxEventId = outboxId
        };

        ArchitectureByScene[sceneKey] = updated;
        return updated;
    }

    private static IReadOnlyList<WallPoint2D> GeneratePolygonVertices(
        string mode,
        double cx,
        double cz,
        double w,
        double d)
    {
        var hw = w / 2.0;
        var hd = d / 2.0;
        if (string.Equals(mode, "hexagon", StringComparison.OrdinalIgnoreCase))
        {
            return Enumerable.Range(0, 6)
                .Select(i =>
                {
                    var a = (i * Math.PI) / 3.0 - Math.PI / 6.0;
                    return new WallPoint2D(Math.Round(cx + hw * Math.Cos(a), 2), Math.Round(cz + hd * Math.Sin(a), 2));
                })
                .ToList();
        }

        if (string.Equals(mode, "octagon", StringComparison.OrdinalIgnoreCase))
        {
            return Enumerable.Range(0, 8)
                .Select(i =>
                {
                    var a = (i * Math.PI) / 4.0 - Math.PI / 8.0;
                    return new WallPoint2D(Math.Round(cx + hw * Math.Cos(a), 2), Math.Round(cz + hd * Math.Sin(a), 2));
                })
                .ToList();
        }

        if (string.Equals(mode, "l_shape", StringComparison.OrdinalIgnoreCase))
        {
            return
            [
                new(cx - hw, cz - hd),
                new(cx + hw, cz - hd),
                new(cx + hw, cz),
                new(cx, cz),
                new(cx, cz + hd),
                new(cx - hw, cz + hd)
            ];
        }

        return
        [
            new(cx - hw, cz - hd),
            new(cx + hw, cz - hd),
            new(cx + hw, cz + hd),
            new(cx - hw, cz + hd)
        ];
    }

    private static Dictionary<string, SceneArchitectureStateDto> SeedArchitecture() =>
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["scene-cinth-ballroom"] = new(
                SceneKey: "scene-cinth-ballroom",
                Revision: 15,
                Walls:
                [
                    new(
                        Id: "wall-rotunda",
                        Name: "Grand Rotunda Perimeter",
                        DrawMode: "octagon",
                        Material: "Obsidian Ashlar & Gold Filigree",
                        ThicknessMeters: 0.55,
                        HeightMeters: 3.4,
                        Perspective: "heavy",
                        Projection: "inward",
                        HasCornerPosts: true,
                        LevelIndex: 1,
                        Points:
                        [
                            new(-11, -4.5), new(-4.5, -11), new(4.5, -11), new(11, -4.5),
                            new(11, 4.5), new(4.5, 11), new(-4.5, 11), new(-11, 4.5)
                        ],
                        Openings:
                        [
                            new("op-main-gate", "double_door", 0.5, 2.8, true, false, true),
                            new("op-crypt-secret", "secret_door", 0.25, 1.6, false, true, false)
                        ]
                    ),
                    new(
                        Id: "wall-balcony-sanctum",
                        Name: "Lord Emrys Upper Balcony Chamber",
                        DrawMode: "room",
                        Material: "Gilded Marble",
                        ThicknessMeters: 0.45,
                        HeightMeters: 2.8,
                        Perspective: "auto",
                        Projection: "fixed-south",
                        HasCornerPosts: true,
                        LevelIndex: 2,
                        Points: [new(-9, 2), new(-2, 2), new(-2, 8), new(-9, 8)],
                        Openings: [new("op-balcony-arch", "archway", 0.5, 2.2, true, false, true)]
                    )
                ],
                Paths:
                [
                    new(
                        Id: "path-courtyard-cobble",
                        Name: "Royal Processional Cobblestone Causeway",
                        Style: "cobble_path",
                        WidthMeters: 2.4,
                        CurveAngleDeg: 35,
                        CliffStrataBands: 0,
                        ColorHex: "#8c7a62",
                        LevelIndex: 1,
                        Waypoints: [new(-13, -8), new(-3, -4), new(6, 3), new(13, 8)]
                    ),
                    new(
                        Id: "path-limestone-escarpment",
                        Name: "Northeast Limestone Cliff Ridge",
                        Style: "cliff_ridge",
                        WidthMeters: 3.1,
                        CurveAngleDeg: -40,
                        CliffStrataBands: 4,
                        ColorHex: "#6e7b82",
                        LevelIndex: 0,
                        Waypoints: [new(-12, 7), new(-2, 9), new(9, 6)]
                    )
                ],
                LastOutboxEventId: "outbox-map-scene-cinth-ballroom-r15-init"
            )
        };
}
