using LoomWeaver.Domain;

namespace LoomWeaver.GameSystems;

public interface IGameSystemRules
{
    string SystemCode { get; }
    string DisplayName { get; }
    IReadOnlyList<string> CoreAbilities { get; }
    string CalculateAdvancementSummary(int currentLevel);
}

public sealed class Dnd5eSystemRules : IGameSystemRules
{
    public string SystemCode => "dnd5e";
    public string DisplayName => "Dungeons & Dragons 5e (2024 / Custom)";
    public IReadOnlyList<string> CoreAbilities => ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    public string CalculateAdvancementSummary(int currentLevel) =>
        $"Level {currentLevel} -> {currentLevel + 1}: Hit Die + CON, Proficiency +{2 + (currentLevel / 4)}, Subclass/Feat milestone check.";
}

public sealed class Pathfinder2eSystemRules : IGameSystemRules
{
    public string SystemCode => "pf2e";
    public string DisplayName => "Pathfinder 2e Remaster (3-Action Economy)";
    public IReadOnlyList<string> CoreAbilities => ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    public string CalculateAdvancementSummary(int currentLevel) =>
        $"Level {currentLevel} -> {currentLevel + 1}: +1 Proficiency rank scaling, Ancestry/Class/Skill Feat slot.";
}

public sealed class VampireV5SystemRules : IGameSystemRules
{
    public string SystemCode => "vampire_v5";
    public string DisplayName => "Vampire: The Masquerade V5 (Hunger & Resonance)";
    public IReadOnlyList<string> CoreAbilities => ["Strength", "Dexterity", "Stamina", "Charisma", "Manipulation", "Composure", "Intelligence", "Wits", "Resolve"];
    public string CalculateAdvancementSummary(int currentLevel) =>
        $"Chronicle Tier {currentLevel}: Spend XP on Disciplines, Blood Potency, or Coterie Domain Haven.";
}
