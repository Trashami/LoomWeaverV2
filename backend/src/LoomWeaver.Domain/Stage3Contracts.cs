namespace LoomWeaver.Domain;

public sealed record VttTokenDto(
    string Key,
    string Name,
    string RoleLabel,
    string Faction,
    int Initiative,
    int CurrentHp,
    int MaxHp,
    int ArmorClass,
    double X,
    double Z,
    string ColorHex,
    bool ActionUsed,
    bool BonusUsed,
    bool ReactionUsed,
    int MovementRemainingFeet,
    bool CanControl = false
);

public sealed record CombatResolutionRequest(
    string AttackerKey,
    string TargetKey,
    string ActionName,
    string ActionSlot,
    int RangeFeet,
    int AttackBonus,
    int SaveDc,
    int DamageDiceCount,
    int DamageDiceSides,
    int DamageBonus,
    string ParticlePresetId,
    string ViewerRole
);

public sealed record CombatResolutionResultDto(
    string AttackerKey,
    string TargetKey,
    string ActionName,
    double DistanceFeet,
    bool InRange,
    int RawD20,
    int TotalAttackOrSave,
    int TargetDefense,
    bool Hit,
    bool IsCritical,
    int DamageDealt,
    int TargetRemainingHp,
    bool TargetDefeated,
    string ParticlePresetId,
    string LogMessage
);

public sealed record EncounterCompletionRequest(
    string EncounterId,
    int TotalXp,
    int PartySize,
    string ViewerRole
);

public sealed record EncounterCompletionResultDto(
    string EncounterId,
    int TotalXpAwarded,
    int XpPerHero,
    IReadOnlyList<string> LevelUpTriggeredHeroes,
    string Summary
);

public sealed record ActionRuleDefinitionDto(
    string Id,
    string Name,
    string Category,
    string ActionCost,
    int RangeFeet,
    string TriggerWhen,
    string ConditionIf,
    string ExecuteThen,
    int AttackBonus,
    int SaveDc,
    string DamageFormula,
    string LinkedEffectPresetId,
    string CanonStatus
);

public sealed record CreateActionRuleRequest(
    string Name,
    string Category,
    string ActionCost,
    int RangeFeet,
    string TriggerWhen,
    string ConditionIf,
    string ExecuteThen,
    string DamageFormula,
    string LinkedEffectPresetId,
    string ViewerRole
);

public sealed record EffectTimelinePresetDto(
    string Id,
    string Name,
    string TrajectoryType,
    string PrimaryColorHex,
    string SecondaryColorHex,
    int ParticleCount,
    int DurationMs,
    IReadOnlyList<string> TimelineKeyframes
);
