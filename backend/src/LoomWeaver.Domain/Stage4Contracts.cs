namespace LoomWeaver.Domain;

public sealed record DiceSkinPresetContract(
    string Id,
    string Name,
    string MaterialType,
    string BaseColorHex,
    string RuneColorHex,
    double Metallic,
    double Roughness,
    string Nat20ShaderName,
    string Nat1ShaderName,
    string UnlockTier
);

public sealed record DiceForgeLoadoutContract(
    string SkinId,
    string ModelId,
    string SizePreset,
    string CoreColorHex,
    string NumberColorHex,
    string GlowColorHex,
    double GlowIntensity,
    double ReflectionMetallic,
    double SurfaceRoughness,
    bool RecessedNumbers,
    bool VeinPulse,
    string Nat20EffectId,
    string CritFailEffectId,
    string SoundProfileId
);

public sealed record DiceForgeMilestoneRewardContract(
    string Id,
    string Title,
    string Description,
    string TargetType,
    string TargetItemId,
    string TargetItemName,
    bool IsCompleted,
    bool IsClaimed,
    int BonusLoommarks
);

public sealed record DiceForgeUserPresetContract(
    string Id,
    string Name,
    string UpdatedAt,
    bool IsPublished,
    object Config
);

public sealed record DiceForgeMarketplacePresetContract(
    string Id,
    string Name,
    string AuthorName,
    string Description,
    int Downloads,
    double Rating,
    IReadOnlyList<string> Tags,
    string PublishedAt,
    object Config
);

public sealed record DiceForgeUserStateContract(
    int CampaignId,
    int LoommarksBalance,
    IReadOnlyList<string> UnlockedSkinIds,
    IReadOnlyList<string> UnlockedModelIds,
    IReadOnlyList<DiceForgeMilestoneRewardContract> Milestones,
    DiceForgeLoadoutContract ActiveLoadout,
    IReadOnlyList<DiceForgeUserPresetContract>? SavedPresets = null,
    IReadOnlyList<DiceForgeMarketplacePresetContract>? MarketplacePresets = null
);

public sealed record DiceForgeUnlockRequestContract(
    string ItemType,
    string ItemId,
    string AcquisitionMethod,
    int? LoommarksCost
);

public sealed record DiceForgeUnlockResponseContract(
    bool Success,
    string Message,
    int LoommarksBalance,
    IReadOnlyList<string> UnlockedSkinIds,
    IReadOnlyList<string> UnlockedModelIds,
    IReadOnlyList<DiceForgeMilestoneRewardContract> Milestones
);

public sealed record DiceRollRequestContract(
    int Sides,
    int Count,
    int Modifier,
    string RollMode,
    string? Label,
    string? SkinId,
    string? ActorName,
    string? DamageType,
    string? ModelId = null,
    string? SizePreset = null,
    string? Nat20EffectId = null,
    string? CritFailEffectId = null,
    string? SoundProfileId = null
);

public sealed record DiceRollResponseContract(
    string Id,
    string Formula,
    string Label,
    int Sides,
    int Count,
    string RollMode,
    IReadOnlyList<int> RawRolls,
    IReadOnlyList<int> KeptRolls,
    int Modifier,
    int Total,
    bool IsNat20,
    bool IsNat1,
    string SkinId,
    string ShaderTriggered,
    string VerificationDigest,
    DateTimeOffset Timestamp
);

public sealed record AudioStemContract(
    string Id,
    string Name,
    string Role,
    string Waveform,
    double BaseFrequencyHz,
    double DefaultGain
);

public sealed record AudioScenePresetContract(
    string Id,
    string Name,
    string Mood,
    int Bpm,
    string KeySignature,
    string Description,
    double CrossfadeSeconds,
    IReadOnlyDictionary<string, double> StemGains
);

public sealed record AudioStateResponseContract(
    int CampaignId,
    string ActivePresetId,
    double MasterVolume,
    IReadOnlyList<AudioStemContract> Stems,
    IReadOnlyList<AudioScenePresetContract> Presets
);

public sealed record AudioTransitionRequestContract(
    string PresetId,
    double CrossfadeSeconds,
    string? Role
);

