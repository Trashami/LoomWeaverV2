using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Knowledge;

// Map, overlay, and location content is authored per campaign and must come from the database.
public static class WorldLoreStateStore
{
    public static readonly List<string> DefaultCategories =
    [
        "Kingdoms & Settlements",
        "Worlds & Regions",
        "Geography",
        "Cultures & Civilizations",
        "Factions & Organizations",
        "Religions & Deities",
        "Historical Events",
        "Languages",
        "Magic & Technology",
        "Myths & Legends",
        "Important Documents"
    ];

    public static readonly Dictionary<int, List<WorldMapSummaryDto>> MapsByCampaign = new();

    public static readonly Dictionary<int, List<WorldMapRegionOverlayDto>> OverlaysByCampaign = new();

    public static readonly Dictionary<int, List<LocationInspectorDetailDto>> LocationsByCampaign = new();
}
