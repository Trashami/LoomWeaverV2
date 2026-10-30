using LoomWeaver.Domain;

namespace LoomWeaver.Infrastructure.MySql;

// Empty by design: when the database is unavailable, reads return no content instead of hardcoded campaigns.
public static class FallbackSeedData
{
    public static readonly IReadOnlyList<CampaignDto> Campaigns = [];

    public static readonly IReadOnlyList<EntitySummaryDto> Entities = [];

    public static readonly IReadOnlyList<AssetCardDto> Assets = [];

    public static readonly IReadOnlyList<SceneSummaryDto> Scenes = [];

    public static IReadOnlyList<EntitySummaryDto> FilterEntities(int campaignId, bool isGm, string? entityType) =>
        Entities
            .Where(e => e.CampaignId == campaignId)
            .Where(e => isGm || e.Visibility is "public" or "players")
            .Where(e => string.IsNullOrEmpty(entityType) || string.Equals(e.EntityType, entityType, StringComparison.OrdinalIgnoreCase))
            .ToList();
}
