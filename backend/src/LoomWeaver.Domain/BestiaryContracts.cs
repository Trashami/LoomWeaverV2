namespace LoomWeaver.Domain;

// Bestiary contracts: official compendium monsters (dnd_monster_library), user-created custom monsters,
// DM-owned monster collections, per-campaign token/3D assignments, campaign/session/encounter placements,
// and Loom-tracked monster encounters (sightings + outcomes).

public sealed record BestiaryMonsterSummaryDto(
    string Key,
    string Name,
    string ImageUrl,
    string TokenUrl,
    string ShortDescription,
    string ChallengeRating,
    double CrValue,
    string CreatureType,
    string Size,
    string Source,
    int ArmorClass,
    int HitPoints,
    bool IsCustom,
    bool IsPublished,
    string? CreatorUsername,
    bool OwnedByViewer
);

public sealed record BestiaryFeatureDto(string Name, string Text);

public sealed record BestiaryMonsterDetailDto(
    BestiaryMonsterSummaryDto Summary,
    string Alignment,
    string ArmorClassLabel,
    string HitPointsLabel,
    string SpeedLabel,
    int Str,
    int Dex,
    int Con,
    int Int,
    int Wis,
    int Cha,
    string SavingThrows,
    string Skills,
    string DamageResistances,
    string DamageImmunities,
    string ConditionImmunities,
    string Senses,
    string Languages,
    int ExperiencePoints,
    IReadOnlyList<BestiaryFeatureDto> Traits,
    IReadOnlyList<BestiaryFeatureDto> Actions,
    IReadOnlyList<BestiaryFeatureDto> BonusActions,
    IReadOnlyList<BestiaryFeatureDto> Reactions,
    IReadOnlyList<BestiaryFeatureDto> LegendaryActions,
    string LoreText,
    IReadOnlyList<string> Environments,
    DateTimeOffset? CreatedAt
);

public sealed record BestiaryPageDto(
    IReadOnlyList<BestiaryMonsterSummaryDto> Items,
    int Total,
    int Offset,
    int Limit,
    bool DatabaseOnline
);

public sealed record SaveCustomMonsterRequest(
    string? Name,
    string? ShortDescription,
    string? LoreText,
    string? ImageUrl,
    string? Size,
    string? CreatureType,
    string? Alignment,
    string? ChallengeRating,
    int ArmorClass,
    string? ArmorClassNote,
    int HitPoints,
    string? HitDice,
    string? Speed,
    int Str,
    int Dex,
    int Con,
    int Int,
    int Wis,
    int Cha,
    string? SavingThrows,
    string? Skills,
    string? DamageResistances,
    string? DamageImmunities,
    string? ConditionImmunities,
    string? Senses,
    string? Languages,
    IReadOnlyList<BestiaryFeatureDto>? Traits,
    IReadOnlyList<BestiaryFeatureDto>? Actions,
    IReadOnlyList<BestiaryFeatureDto>? BonusActions,
    IReadOnlyList<BestiaryFeatureDto>? Reactions,
    IReadOnlyList<BestiaryFeatureDto>? LegendaryActions,
    bool PublishToMarket
);

public sealed record MonsterCollectionDto(
    string Id,
    string Name,
    string Description,
    string OwnerUsername,
    IReadOnlyList<int> AssignedCampaignIds,
    IReadOnlyList<string> MonsterKeys,
    DateTimeOffset UpdatedAt
);

public sealed record SaveMonsterCollectionRequest(
    string? Name,
    string? Description,
    IReadOnlyList<int>? AssignedCampaignIds,
    IReadOnlyList<string>? MonsterKeys
);

public sealed record CampaignMonsterAssignmentDto(
    int CampaignId,
    string MonsterKey,
    string? PrimaryTokenUrl,
    string? SecondaryTokenUrl,
    string? PrimaryModelUrl,
    string? SecondaryModelUrl,
    string UpdatedBy,
    DateTimeOffset UpdatedAt
);

public sealed record SaveMonsterAssignmentRequest(
    string? PrimaryTokenUrl,
    string? SecondaryTokenUrl,
    string? PrimaryModelUrl,
    string? SecondaryModelUrl
);

public sealed record CampaignMonsterPlacementDto(
    string Id,
    int CampaignId,
    string MonsterKey,
    string MonsterName,
    string Scope,
    string? SessionId,
    string? SessionLabel,
    string? EncounterId,
    string? EncounterLabel,
    int Count,
    string AddedBy,
    DateTimeOffset AddedAt
);

public sealed record AddMonsterPlacementRequest(
    string? MonsterKey,
    string? MonsterName,
    string? Scope,
    string? SessionId,
    string? SessionLabel,
    string? EncounterId,
    string? EncounterLabel,
    int? Count
);

public sealed record MonsterSightingDto(
    string Id,
    int CampaignId,
    string MonsterKey,
    string MonsterName,
    string Outcome,
    string? SessionId,
    string? SessionLabel,
    string? LocationName,
    string? EncounterId,
    string? EncounterLabel,
    IReadOnlyList<string> WitnessCharacterKeys,
    string Visibility,
    string? Notes,
    DateTimeOffset OccurredAt,
    string RecordedBy
);

public sealed record RecordMonsterSightingRequest(
    string? MonsterKey,
    string? MonsterName,
    string? Outcome,
    string? SessionId,
    string? SessionLabel,
    string? LocationName,
    string? EncounterId,
    string? EncounterLabel,
    IReadOnlyList<string>? WitnessCharacterKeys,
    string? Visibility,
    string? Notes,
    DateTimeOffset? OccurredAt
);

public sealed record MonsterOutcomeEntry(string? MonsterKey, string? MonsterName, string? Outcome);

public sealed record MonsterEncounterConcludedRequest(
    string? EncounterId,
    string? EncounterLabel,
    string? SessionId,
    string? SessionLabel,
    string? LocationName,
    IReadOnlyList<string>? WitnessCharacterKeys,
    IReadOnlyList<MonsterOutcomeEntry>? Monsters
);

public sealed record CampaignBestiaryStateDto(
    int CampaignId,
    bool IsEffectiveGm,
    IReadOnlyList<MonsterCollectionDto> Collections,
    IReadOnlyList<CampaignMonsterAssignmentDto> Assignments,
    IReadOnlyList<CampaignMonsterPlacementDto> Placements
);
