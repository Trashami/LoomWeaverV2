using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Knowledge;

// Story content is authored per campaign and must come from the database. No hardcoded acts, beats, claims, or relationships.
public static class ConnectedStorySeedStore
{
    public static readonly object SyncLock = new();

    public static string ActiveBeatId { get; set; } = string.Empty;

    public static readonly List<StoryActColumnDto> Acts = new();

    public static readonly List<StorySessionSequenceItemDto> SessionSequence = new();

    public static readonly List<StoryLoreClueFeedItemDto> LoreAndCluesFeed = new();

    public static readonly List<StoryClaimDto> Claims = new();

    public static readonly List<EntityRelationshipDto> Relationships = new();
}
