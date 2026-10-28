using LoomWeaver.Domain;

namespace LoomWeaver.Modules.Bestiary;

public static class BestiaryAccessPolicy
{
    public static bool IsEffectiveGm(string? membershipRole, string? previewRole) =>
        string.Equals(membershipRole, "gm", StringComparison.OrdinalIgnoreCase) &&
        !string.Equals(previewRole, "player", StringComparison.OrdinalIgnoreCase) &&
        !string.Equals(previewRole, "players", StringComparison.OrdinalIgnoreCase);

    public static bool CanReadSighting(MonsterSightingDto sighting, bool isGm, string? characterKey)
    {
        if (isGm || sighting.Visibility == "party") return true;
        var key = BestiaryCampaignStore.NormalizeCharacter(characterKey);
        return sighting.Visibility == "witnesses" && key.Length > 0 &&
            sighting.WitnessCharacterKeys.Any(w => BestiaryCampaignStore.NormalizeCharacter(w) == key);
    }

    public static bool IsSafeAssetUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;
        if (value.Length > 500 || value.Contains('\\') || value.Any(char.IsControl)) return false;
        if (value.StartsWith('/') && !value.StartsWith("//")) return !value.Contains("..");
        return Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && string.IsNullOrEmpty(uri.UserInfo);
    }
}
