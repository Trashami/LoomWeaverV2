namespace LoomWeaver.Modules.Items;

public static class ItemAccessPolicy
{
    public static bool CanUseCharacter(string? assigned, string requested) =>
        !string.IsNullOrWhiteSpace(assigned) &&
        ItemRepository.CharacterKey(assigned).Equals(ItemRepository.CharacterKey(requested), StringComparison.OrdinalIgnoreCase);
}
