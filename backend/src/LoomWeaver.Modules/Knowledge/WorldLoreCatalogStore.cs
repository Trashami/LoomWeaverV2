using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Knowledge;

// Markers, waypoints, lore, history, and discoveries are authored per campaign and must come from the database.
public static class WorldLoreCatalogStore
{
    public static readonly Dictionary<int, List<WorldMapMarkerDto>> MarkersByCampaign = new();

    public static readonly Dictionary<int, List<PartyJourneyWaypointDto>> WaypointsByCampaign = new();

    public static readonly Dictionary<int, List<LoreEntryDto>> LoreByCampaign = new();

    public static readonly Dictionary<int, List<WorldHistoryChronicleEventDto>> HistoryByCampaign = new();

    public static readonly Dictionary<int, List<RecentWorldDiscoveryDto>> DiscoveriesByCampaign = new();
}
