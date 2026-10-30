using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Adventures;

// Adventure content is not seeded in code. Rooms, exits, places, and lore come from campaign data.
internal static class AdventureGuideSeedCatalog
{
    public static (string HeaderTitle, string HeaderSubtitle, string? AreaKey, string Epigraph, string Summary, string ImmediateSituation, string SensoryDescription) GetRoomMetadata(string scopeId, bool isGm) =>
        ("", "", null, "", "", "", "");

    public static IReadOnlyList<AdventureRoomExitDto> GetRoomExits(string scopeId, bool isGm) =>
        Array.Empty<AdventureRoomExitDto>();

    public static IReadOnlyList<AdventureGuideElementItemDto> GetPlacesTabItems(
        bool isGm,
        AdventureAssignedBattlemapDto assignedMap,
        Func<string, string, string> getState,
        HashSet<string> sharedIds) =>
        Array.Empty<AdventureGuideElementItemDto>();

    public static IReadOnlyList<AdventureGuideElementItemDto> GetLoreTabItems(bool isGm) =>
        Array.Empty<AdventureGuideElementItemDto>();
}
