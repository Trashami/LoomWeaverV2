using LoomWeaver.Modules.Maps.Domain;

namespace LoomWeaver.Modules.Maps.Infrastructure;

public static class SceneRepository
{
    private static readonly Dictionary<string, SceneRevisionSnapshotDto> Snapshots = SeedSnapshots();
    private static readonly IReadOnlyList<MapPresetTemplateDto> Presets = SeedPresets();
    private static readonly IReadOnlyList<MapCatalogAssetItemDto> CatalogAssets = SeedCatalogAssets();

    public static SceneRevisionSnapshotDto GetOrCreateSnapshot(int campaignId, string sceneKey)
    {
        if (Snapshots.TryGetValue(sceneKey, out var existing))
        {
            return existing;
        }

        var fallback = Snapshots.Values.First() with
        {
            SceneKey = sceneKey,
            CampaignId = campaignId
        };
        Snapshots[sceneKey] = fallback;
        return fallback;
    }

    public static SceneRevisionSnapshotDto CommitRevision(
        int campaignId,
        string sceneKey,
        SaveSceneRevisionRequest request)
    {
        var current = GetOrCreateSnapshot(campaignId, sceneKey);
        var nextRev = Math.Max(current.Revision + 1, request.ExpectedRevision + 1);

        var updated = new SceneRevisionSnapshotDto(
            SceneKey: sceneKey,
            CampaignId: campaignId,
            Title: string.IsNullOrWhiteSpace(request.Title) ? current.Title : request.Title.Trim(),
            Revision: nextRev,
            ActiveLevelIndex: request.ActiveLevelIndex,
            GhostLowerFloors: request.GhostLowerFloors,
            TestTokenSandbox: request.TestTokenSandbox,
            Grid: request.Grid,
            Levels: request.Levels.Count > 0 ? request.Levels : current.Levels,
            Layers: request.Layers.Count > 0 ? request.Layers : current.Layers,
            UpdatedBy: string.IsNullOrWhiteSpace(request.AuthorName) ? "Architect GM" : request.AuthorName,
            UpdatedAtUtc: DateTimeOffset.UtcNow
        );

        Snapshots[sceneKey] = updated;
        return updated;
    }

    public static IReadOnlyList<MapPresetTemplateDto> GetPresets() => Presets;

    public static IReadOnlyList<MapCatalogAssetItemDto> GetCatalogAssets(string? category, string? query)
    {
        var items = CatalogAssets.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(category) && !string.Equals(category, "all", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(category, "bump", StringComparison.OrdinalIgnoreCase))
                items = items.Where(a => a.IsLightAware3D);
            else if (string.Equals(category, "scatterable", StringComparison.OrdinalIgnoreCase))
                items = items.Where(a => a.IsScatterReady);
            else
                items = items.Where(a => string.Equals(a.Category, category, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = query.Trim();
            items = items.Where(a =>
                a.Name.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                a.Category.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                a.Subfolder.Contains(q, StringComparison.OrdinalIgnoreCase));
        }

        return items.ToList();
    }

    private static Dictionary<string, SceneRevisionSnapshotDto> SeedSnapshots() =>
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["scene-cinth-ballroom"] = new(
                SceneKey: "scene-cinth-ballroom",
                CampaignId: 1,
                Title: "Cinth Grand Masquerade Ballroom",
                Revision: 14,
                ActiveLevelIndex: 1,
                GhostLowerFloors: true,
                TestTokenSandbox: false,
                Grid: new MapGridConfigDto("square", 50, 40, true, true, "battlemap"),
                Levels:
                [
                    new("lvl-0", 0, "L0 · Subterranean Vampire Vaults", -20, 0),
                    new("lvl-1", 1, "L1 · Grand Ballroom & Canal Courtyard", 0, 15),
                    new("lvl-2", 2, "L2 · Crimson Balcony & Organ Loft", 15, 35)
                ],
                Layers:
                [
                    new("layer-base", "Base Floor & Marble", "floors", "grid", true, false, 100, "normal", 10),
                    new("layer-terrain", "Biome & Elevation Relief", "terrain", "mountain", true, false, 100, "normal", 20),
                    new("layer-water", "Reflective Canals & Splines", "water", "waves", true, false, 95, "screen", 30),
                    new("layer-walls", "Cutaway Walls & Portals", "walls", "shield", true, false, 100, "normal", 40),
                    new("layer-objects", "2D/3D Linked Stamps & Props", "objects", "box", true, false, 100, "normal", 50),
                    new("layer-lights", "2.5D Dynamic Lights & Shadows", "lights", "sun", true, false, 100, "screen", 60),
                    new("layer-notes", "GM Scene Notes & Secrets", "notes", "eye", true, false, 90, "normal", 70),
                    new("layer-overlays", "Cartography & Weather FX", "overlays", "compass", true, false, 85, "overlay", 80)
                ],
                UpdatedBy: "System starter template",
                UpdatedAtUtc: DateTimeOffset.UtcNow
            )
        };

    private static IReadOnlyList<MapPresetTemplateDto> SeedPresets() =>
    [
        new("preset-cinth-ballroom", "Cinth Grand Masquerade Ballroom", "city", "battlemap",
            "Obsidian and gold gothic cathedral ballroom with reflective canal splines, upper balcony dais, and hidden crypt vaults.",
            "castle", 36, 28, "Cinth Marble Ballroom Courtyard", "2.5D Chandelier & Sconce Shadows", 840, "3-Level Interior"),
        new("preset-gwaedhellain-canopy", "Shadow of the Mountain · Poisoned Forest", "wilderness", "battlemap",
            "Twisted ancient canopy above the rune-bound mountain cavern where dragon blood seeps into roots and stone.",
            "trees", 44, 34, "Gwaedhellain Poisoned Canopy", "Bioluminescent Spore & Dusk Mist", 928, "Canopy Occlusion"),
        new("preset-plains-of-red", "Plains of Red · Ancient Fey Battlefield", "wilderness", "battlemap",
            "Crimson clay escarpments, shattered fey monoliths, and limestone cliffs along the northeast road to Cinth.",
            "mountain", 48, 36, "Plains of Red Clay & Ruin", "High Sun & Long 4PM Cliff Shadows", 640, "Multi-Tier Cliffs"),
        new("preset-runic-prison", "Subterranean Dragon Rune Chamber", "dungeon", "battlemap",
            "Basalt cavern carved with hundred-year containment sigils, claw-scored runes, and molten fissures.",
            "flame", 40, 40, "Runic Subterranean Basalt", "Arcane Sigil Glow & Deep Darkness", 510, "Boss Arena"),
        new("preset-icrandor-atlas", "Icrandor Continental World Atlas", "world", "world_map",
            "Top-right North cartography canvas spanning Vandia, the Bay of Forgotten Treasures, Cinth, and Edhellain.",
            "compass", 80, 60, "Aged Parchment & Coastal Waterlines", "Celestial Astrolabe Daylight", 2150, "World Cartography")
    ];

    private static IReadOnlyList<MapCatalogAssetItemDto> SeedCatalogAssets() =>
    [
        new("cat-gothic-pillar", "Cinth Gothic Obsidian Pillar", "walls", "castle-timber", "3d-linked-stamp", true, false, 1.25, 18, "/map-assets/models-3d/Meshy_AI_Ancient_Pillars_Hal_1.glb"),
        new("cat-clockwork-organ", "Artificer Brass Pipe Organ", "furniture", "room-furnishings-v1", "3d-linked-stamp", true, false, 1.4, 14, "/map-assets/stamps-2d/room-furnishings-v1"),
        new("cat-banquet-table", "Masquerade Velvet Banquet Table", "furniture", "table-room-decor-v1", "2d-stamp", true, false, 1.15, 4, "/map-assets/stamps-2d/table-room-decor-v1"),
        new("cat-limestone-cliff", "Stackable Limestone Cliff Escarpment", "cliffs", "stackable-limestone-cliffs-v2", "3d-linked-stamp", true, true, 1.6, 20, "/map-assets/stamps/cliffs"),
        new("cat-poisoned-oak", "Gwaedhellain Canopy Elder Tree", "trees", "models-3d", "3d-linked-stamp", true, true, 1.8, 28, "/map-assets/models-3d/Meshy_AI_tree_ancient_1023214424_texture.glb"),
        new("cat-glowing-fungi", "Bioluminescent Underdark Mushroom Cluster", "plants", "models-3d", "3d-linked-stamp", true, true, 0.9, 6, "/map-assets/models-3d/Meshy_AI_Whispering_Fungal_Pea_1023201247_texture.glb"),
        new("cat-runic-obelisk", "Azure Sidhe Ard Runic Obelisk", "ruins", "models-3d", "3d-linked-stamp", true, false, 1.35, 16, "/map-assets/models-3d/Meshy_AI_Azure_Runic_Obelisk_1023201822_texture.glb"),
        new("cat-sewer-wall", "Modular Sewer & Crypt Archway", "walls", "sewer-dungeon-wall-library-v1", "wall-segment", true, false, 1.0, 12, "/map-assets/terrain-textures/sewer-dungeon-wall-library-v1"),
        new("cat-brazier-light", "Three-Arm Gothic Candelabra & Light", "lights", "models-3d", "light-stamp", true, false, 1.0, 8, "/map-assets/models-3d/Meshy_AI_Three_Arm_Gothic_Cand.glb"),
        new("cat-mountain-dragon", "Trapped Elder Dragon Monument", "dungeon", "models-3d", "3d-linked-stamp", true, false, 2.4, 30, "/map-assets/models-3d/mountain_dragon.glb")
    ];
}
