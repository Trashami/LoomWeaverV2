namespace LoomWeaver.Modules.Items;

public static class ItemAccessPolicy
{
    public static bool CanUseCharacter(string? assigned, string requested) =>
        !string.IsNullOrWhiteSpace(assigned) &&
        ItemRepository.CharacterKey(assigned).Equals(ItemRepository.CharacterKey(requested), StringComparison.OrdinalIgnoreCase);

    public static bool CanManageCharacter(string role, string? assigned, string requested) =>
        role == "gm" || CanUseCharacter(assigned, requested);
}
