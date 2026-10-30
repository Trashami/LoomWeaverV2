using LoomWeaver.Domain;

namespace LoomWeaver.Modules.ActionStudio.Domain;

public static class ActionEngineSymbolCatalog
{
    private static readonly IReadOnlyList<string> OrderedKeywords =
    [
        "When",
        "If",
        "Contains",
        "Has",
        "Has Not",
        "Where",
        "And",
        "Or",
        "With",
        "Then",
        "Else"
    ];

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> TokenCatalog =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["When"] =
            [
                "Attack Roll Hits Self",
                "Magic Missile Targets Self",
                "Hostile Creature Casts Spell Within 60 ft",
                "Hostile Leaves Reach Without Disengage",
                "Creature Takes Damage While Concentrating",
                "Combat Encounter Starts",
                "Turn Starts",
                "Ranged Or Finesse Weapon Attack Hits",
                "Ritual Overchannel Declared",
                "Ranged Slingshot Attack Declared"
            ],
            ["If"] =
            [
                "Reaction Available",
                "AttackTotal >= TargetAC",
                "Target Within Range",
                "Line Of Sight Clear",
                "Spell Slot Level >= 1",
                "Attack Has Advantage",
                "Ally Within 5 ft Of Target",
                "Constitution Save >= max(10, floor(Damage / 2))",
                "Target HP <= 15"
            ],
            ["Contains"] =
            [
                "Action.Tags Contains 'Spell'",
                "Action.Tags Contains 'Reaction'",
                "Weapon.Properties Contains 'Finesse'",
                "Weapon.Properties Contains 'Ranged'",
                "Damage.Types Contains 'Force'",
                "Spell.Components Contains 'Somatic'",
                "Target.Conditions Contains 'Hexed'",
                "Inventory.Reagents Contains 'Reagent'"
            ],
            ["Has"] =
            [
                "Defender Has Reaction Available",
                "Caster Has 1st-Level Spell Slot",
                "Caster Has 3rd-Level Spell Slot",
                "Attacker Has Line Of Sight",
                "Attacker Has Proficiency",
                "Target Has Concentration Active"
            ],
            ["Has Not"] =
            [
                "Target Has Not Taken Disengage Action",
                "Attacker Has Not Used Sneak Attack This Turn",
                "Defender Has Not Used Reaction This Round",
                "Attacker Has Not Disadvantage",
                "Target Has Not Total Cover"
            ],
            ["Where"] =
            [
                "Distance(Attacker, Target) <= 60 ft",
                "Distance(Attacker, Target) <= 5 ft",
                "Target.Role != Ally",
                "Spell.Level <= CounterspellSlotLevel",
                "Every 2nd Diagonal Tile Costs 10 ft"
            ],
            ["And"] =
            [
                "Reaction Is Unspent",
                "Spell Slot Is Available",
                "Target Is Visible",
                "Incoming Attack >= Current AC",
                "Within Weapon Or Spell Range"
            ],
            ["Or"] =
            [
                "Attack Is Magic Missile",
                "Ally Is Adjacent To Enemy",
                "Caster Expends Arcane Ward Charge",
                "Caster Succeeds Ability Check DC (10 + Spell.Level)"
            ],
            ["With"] =
            [
                "AC Bonus +5 Until Start Of Next Turn",
                "Save DC = max(10, floor(Damage / 2))",
                "Action Budget (1 Action, 1 Bonus, 1 Reaction)",
                "Scaling Dice By Character Level",
                "VFX Preset 'fx-ground-sigil'"
            ],
            ["Then"] =
            [
                "Consume Reaction & Grant +5 AC",
                "Recheck Hit Outcome & Negate Magic Missile",
                "Interrupt Spell Cast & Negate Effect",
                "Pause Movement & Execute 1 Melee Attack",
                "Maintain Active Concentration Effects",
                "Add Sneak Attack Dice To Damage Roll",
                "Apply Arcane +2d8 Necrotic/Radiant Surge",
                "Deal 3d8+5 Piercing & Trigger Ricochet Arc"
            ],
            ["Else"] =
            [
                "Allow Attack To Resolve Normally",
                "Roll Spellcasting Ability Check vs DC 10 + Spell Level",
                "Drop Concentration & Clear Linked Aura",
                "Apply Half Damage On Successful Save",
                "Keep Standard 5 ft Movement Cost"
            ]
        };

    private static readonly IReadOnlyList<RuleEngineSymbolDescriptorDto> Symbols =
    [
        new(
            "CombatRuleInterpreter",
            "LoomWeaver.Modules/ActionStudio/Engine/CombatRuleEngineInterpreter.cs",
            "Server Rules Engine (.NET 10)",
            "Authoritative server-side combat rule clause interpreter for reactions, interrupts, saves, and action economy.",
            [
                new("ResolveShieldReactionWindow", "ResolveShieldReactionWindow(int incomingRoll, int baseAc, bool isMagicMissile)", "ShieldResolution", "Evaluates Shield (+5 AC until start of next turn) and blocks Magic Missile.", ["Reaction Available", "Consume Reaction & Grant +5 AC"]),
                new("ResolveCounterspellInterrupt", "ResolveCounterspellInterrupt(int castSlotLevel, int targetSpellLevel, int checkTotal)", "InterruptResolution", "Resolves Counterspell auto-cancel vs ability check against DC 10 + spell level.", ["Hostile Creature Casts Spell Within 60 ft", "Interrupt Spell Cast & Negate Effect"]),
                new("ResolveOpportunityAttackTrigger", "ResolveOpportunityAttackTrigger(bool leftReach, bool disengaged, bool teleported)", "OpportunityTrigger", "Triggers a reaction melee strike before the moving creature leaves reach.", ["Hostile Leaves Reach Without Disengage", "Pause Movement & Execute 1 Melee Attack"]),
                new("EvaluateConcentrationSaveDc", "EvaluateConcentrationSaveDc(int damageTaken, int conSaveTotal)", "ConcentrationOutcome", "Computes DC = max(10, floor(damage / 2)) and drops linked concentration effects on failure.", ["Creature Takes Damage While Concentrating", "Save DC = max(10, floor(Damage / 2))"]),
                new("ComputeDiagonalStepCost", "ComputeDiagonalStepCost(int diagonalCountThisTurn, string diagonalMode)", "MovementStepCost", "Computes 5-10-5 tactical grid movement or standard 5ft steps.", ["Every 2nd Diagonal Tile Costs 10 ft", "Keep Standard 5 ft Movement Cost"])
            ]
        ),
        new(
            "MidiCombatAutomationService",
            "frontend/src/app/services/midi-combat-automation.service.ts",
            "VTT Automation Pipeline",
            "Coordinates preamble, attack roll, hit/save evaluation, reaction windows, and damage application.",
            [
                new("openReactionWindow", "openReactionWindow(triggerType, defenderToken, incomingRoll)", "Promise<ReactionDecision>", "Prompts eligible defenders for Shield, Counterspell, Uncanny Dodge, or Absorb Elements.", ["When", "Reaction Available"]),
                new("executeWorkflow", "executeWorkflow(actorToken, targets, actionRule)", "Promise<WorkflowResult>", "Runs the 5-step combat workflow (Preamble -> Attack -> Reaction -> Save -> Damage).", ["Target Within Range", "AttackTotal >= TargetAC"]),
                new("evaluateSneakAttackEligibility", "evaluateSneakAttackEligibility(attacker, target, weapon, hasAdvantage, allyAdjacent)", "boolean", "Checks Finesse/Ranged weapon properties and Advantage or adjacent ally.", ["Weapon.Properties Contains 'Finesse'", "Add Sneak Attack Dice To Damage Roll"])
            ]
        ),
        new(
            "CombatSessionStateService",
            "frontend/src/app/services/combat-session-state.service.ts",
            "Combat Turn & Economy State",
            "Tracks per-combatant Action, Bonus Action, Reaction, Movement budgets, Initiative order, and active conditions.",
            [
                new("resetTurnResources", "resetTurnResources(combatantId, roundNumber)", "TurnBudgetState", "Restores 1 Action, 1 Bonus Action, 1 Reaction, and full movement speed at start of turn.", ["Turn Starts", "Action Budget (1 Action, 1 Bonus, 1 Reaction)"]),
                new("consumeActionResource", "consumeActionResource(combatantId, slotType)", "boolean", "Spends Action, Bonus Action, or Reaction and broadcasts state to the table.", ["Defender Has Reaction Available", "Consume Reaction & Grant +5 AC"]),
                new("rollInitiativeOrder", "rollInitiativeOrder(combatants, tieBreakerRule)", "InitiativeOrder[]", "Rolls d20 + DEX modifier + bonuses and sorts turn order.", ["Combat Encounter Starts", "With"])
            ]
        ),
        new(
            "CharacterCalculationEngine",
            "LoomWeaver.GameSystems/Dnd5eSystemRules.cs",
            "Character Sheet & Scaling Math",
            "Computes proficiency bonus, spell save DC, attack modifiers, Armor Class, and level 1-20 scaling tiers.",
            [
                new("ComputeSpellSaveDc", "ComputeSpellSaveDc(int proficiencyBonus, int spellcastingMod, int bonus)", "int", "Computes 8 + Proficiency Bonus + Spellcasting Ability Modifier.", ["Save DC = 8 + Prof + SpellMod"]),
                new("EvaluateLevelScalingTier", "EvaluateLevelScalingTier(int characterLevel, IReadOnlyList<ActionScalingTierDto> tiers)", "string", "Resolves cantrip and class feature dice progression at levels 1, 5, 11, and 17.", ["Scaling Dice By Character Level"])
            ]
        )
    ];

    public static IReadOnlyList<string> GetClauseKeywords() => OrderedKeywords;

    public static IReadOnlyDictionary<string, IReadOnlyList<string>> GetTokenSuggestions() => TokenCatalog;

    public static IReadOnlyList<RuleEngineSymbolDescriptorDto> GetEngineSymbols() => Symbols;
}
