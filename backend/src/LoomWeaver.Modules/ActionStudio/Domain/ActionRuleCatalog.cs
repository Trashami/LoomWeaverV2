using LoomWeaver.Domain;

namespace LoomWeaver.Modules.ActionStudio.Domain;

public static class ActionRuleCatalog
{
    private static readonly IReadOnlyList<CampaignActionRuleDto> PrimaryCoreRules =
    [
        new(
            Id: "rule-shield-reaction",
            RuleCode: "Reaction.ShieldSpell",
            Name: "Shield",
            Category: "Spells",
            SourceLabel: "Core Engine",
            RulesetCode: "dnd5e-2024",
            Summary: "An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC, including against the triggering attack, and you take no damage from Magic Missile.",
            ActionCost: "1 Reaction",
            ActionType: "1st-Level Abjuration Spell (Reaction)",
            RangeLabel: "Self",
            TargetLabel: "Self (Triggering Attack or Magic Missile)",
            AttackOrSaveLabel: "Interrupts Attack Roll vs AC",
            DamageOrEffectFormula: "+5 AC & Negate Magic Missile",
            SaveDc: 0,
            AcBonus: 5,
            DurationLabel: "Until the start of your next turn",
            RequiresConcentration: false,
            PrimaryClassName: "CombatRuleInterpreter",
            PrimaryMethodName: "ResolveShieldReactionWindow",
            SourceFilePath: "LoomWeaver.Modules/ActionStudio/Engine/CombatRuleEngineInterpreter.cs",
            Clauses:
            [
                new("c-sh-1", "When", ["An attack hits you", "Magic Missile targets you"], "MidiCombatAutomationService", "openReactionWindow", "Triggers when hit by an attack roll or targeted by Magic Missile.", "ANY"),
                new("c-sh-2", "Has", ["Reaction available", "Appropriate 1st-level spell slot available"], "CombatSessionStateService", "consumeActionResource", "Requires both an unspent Reaction and an available 1st-level+ spell slot.", "ALL"),
                new("c-sh-3", "Contains", ["Applicable casting requirements (Verbal, Somatic)", "Action.Tags Contains 'Reaction'"], "CombatRuleInterpreter", "ResolveShieldReactionWindow", "Verifies spell components and reaction eligibility.", "ALL"),
                new("c-sh-4", "With", ["Grant +5 AC until the start of your next turn"], "CharacterCalculationEngine", "ComputeSpellSaveDc", "Applies temporary +5 AC bonus.", "ALL"),
                new("c-sh-5", "Then", ["Spend the required resources (1 Reaction + 1st-level Spell Slot)", "Grant +5 AC until the start of your next turn", "Resolve the triggering attack or Magic Missile interaction"], "CombatRuleInterpreter", "ResolveShieldReactionWindow", "Spends resources, raises AC, and re-evaluates the triggering attack.", "ALL"),
                new("c-sh-6", "Else", ["Allow triggering attack to resolve against base AC"], "MidiCombatAutomationService", "executeWorkflow", "Standard attack resolution when reaction is not used or requirements fail.", "ALL")
            ],
            ScalingTiers:
            [
                new("1-4", "Self", "+5 AC until start of next turn; negates Magic Missile.", "Standard 1st-level Abjuration reaction barrier."),
                new("5-10", "Self", "+5 AC; recharges Abjuration Arcane Ward (+2 HP).", "Synergizes with School of Abjuration ward."),
                new("11-16", "Self", "+5 AC; eligible for Spell Mastery at high Wizard tiers.", "Consistent defensive reaction against multiattack."),
                new("17-20", "Self", "+5 AC; at-will casting with Spell Mastery (no slot spent).", "Archmage signature defensive reaction.")
            ],
            WorksWith: ["Mage Armor", "Bladesong", "Arcane Ward", "War Caster"],
            ConflictsWith: ["Incapacitated", "Shocking Grasp (No Reactions)", "Silence (Verbal Component)"],
            Tags: ["Reaction", "Abjuration", "AC Bonus", "Interrupt", "Spell", "Core Engine"],
            IsCustomizedForCampaign: false,
            UpdatedByUsername: "Core Engine SQL",
            UpdatedAt: "2026-10-26T00:00:00Z",
            IsCoreEngineRule: true
        ),
        new(
            Id: "rule-counterspell-interrupt",
            RuleCode: "Reaction.Counterspell",
            Name: "Counterspell",
            Category: "Spells",
            SourceLabel: "Core Engine",
            RulesetCode: "dnd5e-2024",
            Summary: "You attempt to interrupt a creature in the process of casting a spell within 60 feet. Automatically interrupts spells of 3rd level or lower, or requires a spellcasting ability check (DC 10 + spell level).",
            ActionCost: "1 Reaction",
            ActionType: "3rd-Level Abjuration Spell (Reaction)",
            RangeLabel: "60 feet",
            TargetLabel: "1 Creature Casting a Spell Within 60 ft",
            AttackOrSaveLabel: "Auto <= Slot Level or Ability Check DC 10 + Spell Level",
            DamageOrEffectFormula: "Negate Enemy Spell Cast",
            SaveDc: 14,
            AcBonus: 0,
            DurationLabel: "Instantaneous",
            RequiresConcentration: false,
            PrimaryClassName: "CombatRuleInterpreter",
            PrimaryMethodName: "ResolveCounterspellInterrupt",
            SourceFilePath: "LoomWeaver.Modules/ActionStudio/Engine/CombatRuleEngineInterpreter.cs",
            Clauses:
            [
                new("c-cs-1", "When", ["Hostile Creature Casts Spell Within 60 ft"], "MidiCombatAutomationService", "openReactionWindow", "Triggered on enemy spell preamble.", "ANY"),
                new("c-cs-2", "Where", ["Distance(Attacker, Target) <= 60 ft"], "CombatRuleInterpreter", "ResolveCounterspellInterrupt", "Enforces 60 ft reaction range.", "ALL"),
                new("c-cs-3", "Has", ["Reaction available", "Appropriate 3rd-level spell slot available"], "CombatSessionStateService", "consumeActionResource", "Spends reaction and 3rd+ level slot.", "ALL"),
                new("c-cs-4", "If", ["Spell.Level <= CounterspellSlotLevel"], "CombatRuleInterpreter", "ResolveCounterspellInterrupt", "Compares cast slot level against enemy spell level.", "ALL"),
                new("c-cs-5", "Then", ["Spend Reaction & 3rd-Level Slot", "Interrupt Spell Cast & Negate Effect"], "CombatRuleInterpreter", "ResolveCounterspellInterrupt", "Spell fails and has no effect.", "ALL"),
                new("c-cs-6", "Else", ["Roll Spellcasting Ability Check vs DC 10 + Spell Level"], "CombatRuleInterpreter", "ResolveCounterspellInterrupt", "On success, interrupts higher-level spell.", "ALL")
            ],
            ScalingTiers:
            [
                new("1-4", "60 ft", "Unavailable until 5th-level spellcaster.", "Requires 3rd-level spell slots."),
                new("5-10", "60 ft", "Auto-interrupts spells of 3rd level or lower.", "Base 3rd-level Counterspell slot."),
                new("11-16", "60 ft", "Upcast with 4th-6th slot to auto-negate matching tier.", "Scales with expended spell slot level."),
                new("17-20", "60 ft", "Upcast with 7th-9th slot to deny high-arcana spells.", "Full archmage spell denial.")
            ],
            WorksWith: ["Abjuration Savant", "Jack of All Trades", "Tactical Wit"],
            ConflictsWith: ["Subtle Spell (No Perceivable Components)", "Blindness", "Out of 60 ft Range"],
            Tags: ["Reaction", "Interrupt", "Spell Denial", "60 ft", "Core Engine"],
            IsCustomizedForCampaign: false,
            UpdatedByUsername: "Core Engine SQL",
            UpdatedAt: "2026-10-26T00:00:00Z",
            IsCoreEngineRule: true
        ),
        new(
            Id: "rule-opportunity-attack",
            RuleCode: "Combat.OpportunityAttack",
            Name: "Opportunity Attack",
            Category: "Actions",
            SourceLabel: "Core Engine",
            RulesetCode: "dnd5e-2024",
            Summary: "When a hostile creature that you can see moves out of your reach without taking the Disengage action, you can use your Reaction to make one melee attack against the provoking creature.",
            ActionCost: "1 Reaction",
            ActionType: "Melee Reaction Attack",
            RangeLabel: "5 feet (Reach)",
            TargetLabel: "1 Hostile Creature Leaving Reach",
            AttackOrSaveLabel: "Melee Attack Roll vs Target AC",
            DamageOrEffectFormula: "1d8 + STR/DEX Weapon Damage",
            SaveDc: 0,
            AcBonus: 0,
            DurationLabel: "Instantaneous (Before Target Leaves Reach)",
            RequiresConcentration: false,
            PrimaryClassName: "CombatRuleInterpreter",
            PrimaryMethodName: "ResolveOpportunityAttackTrigger",
            SourceFilePath: "LoomWeaver.Modules/ActionStudio/Engine/CombatRuleEngineInterpreter.cs",
            Clauses:
            [
                new("c-oa-1", "When", ["Hostile Leaves Reach Without Disengage"], "CombatRuleInterpreter", "ResolveOpportunityAttackTrigger", "Monitors token movement path across reach boundary.", "ANY"),
                new("c-oa-2", "Has", ["Reaction available"], "CombatSessionStateService", "consumeActionResource", "Requires unspent reaction.", "ALL"),
                new("c-oa-3", "Has Not", ["Target Has Not Taken Disengage Action"], "CombatSessionStateService", "consumeActionResource", "Cancelled if target disengaged or teleports.", "ALL"),
                new("c-oa-4", "Where", ["Distance(Attacker, Target) <= 5 ft"], "CombatRuleInterpreter", "ResolveOpportunityAttackTrigger", "Evaluated at the tile before exiting reach.", "ALL"),
                new("c-oa-5", "Then", ["Spend Reaction", "Pause Movement & Execute 1 Melee Attack"], "MidiCombatAutomationService", "executeWorkflow", "Resolves melee strike before movement completes.", "ALL")
            ],
            ScalingTiers:
            [
                new("1-4", "5 ft", "Single melee weapon attack on reach exit.", "Standard Reach Guard"),
                new("5-10", "5-10 ft", "Sentinel reduces target speed to 0 ft on hit.", "Lockdown Strike"),
                new("11-16", "5-10 ft", "War Caster allows single-target spell reaction.", "Arcane Opportunity"),
                new("17-20", "5-10 ft", "Cavalier / Vigilant extra opportunity reaction.", "Master Defender")
            ],
            WorksWith: ["Sentinel", "Polearm Master", "War Caster", "Sneak Attack (Off-Turn)"],
            ConflictsWith: ["Disengage Action", "Misty Step / Teleportation", "Forced Push Movement"],
            Tags: ["Reaction", "Melee", "Movement", "Reach", "Core Engine"],
            IsCustomizedForCampaign: false,
            UpdatedByUsername: "Core Engine SQL",
            UpdatedAt: "2026-10-26T00:00:00Z",
            IsCoreEngineRule: true
        ),
        new(
            Id: "rule-concentration-save",
            RuleCode: "SavingThrows.Concentration",
            Name: "Concentration Saving Throw",
            Category: "Conditions",
            SourceLabel: "Core Engine",
            RulesetCode: "dnd5e-2024",
            Summary: "Whenever you take damage while concentrating on a spell, you must make a Constitution saving throw to maintain concentration. The DC equals 10 or half the damage you take, whichever number is higher.",
            ActionCost: "Free (Triggered on Damage)",
            ActionType: "Constitution Saving Throw",
            RangeLabel: "Self",
            TargetLabel: "Concentrating Spellcaster",
            AttackOrSaveLabel: "CON Save vs max(10, floor(Damage / 2))",
            DamageOrEffectFormula: "DC = max(10, floor(Damage / 2))",
            SaveDc: 10,
            AcBonus: 0,
            DurationLabel: "Active Concentration Duration",
            RequiresConcentration: true,
            PrimaryClassName: "CombatRuleInterpreter",
            PrimaryMethodName: "EvaluateConcentrationSaveDc",
            SourceFilePath: "LoomWeaver.Modules/ActionStudio/Engine/CombatRuleEngineInterpreter.cs",
            Clauses:
            [
                new("c-cn-1", "When", ["Creature Takes Damage While Concentrating"], "CombatRuleInterpreter", "EvaluateConcentrationSaveDc", "Hooks into post-damage HP reduction.", "ANY"),
                new("c-cn-2", "Has", ["Target Has Concentration Active"], "CombatSessionStateService", "consumeActionResource", "Checks active concentration state on token.", "ALL"),
                new("c-cn-3", "With", ["Save DC = max(10, floor(Damage / 2))"], "CombatRuleInterpreter", "EvaluateConcentrationSaveDc", "Calculates dynamic Constitution save threshold.", "ALL"),
                new("c-cn-4", "If", ["Constitution Save >= max(10, floor(Damage / 2))"], "CombatRuleInterpreter", "EvaluateConcentrationSaveDc", "Compares d20 + CON save bonus against DC.", "ALL"),
                new("c-cn-5", "Then", ["Maintain Active Concentration Effects"], "CombatRuleInterpreter", "EvaluateConcentrationSaveDc", "Keeps active buff/debuff/aura on the map.", "ALL"),
                new("c-cn-6", "Else", ["Drop Concentration & Clear Linked Aura"], "CombatRuleInterpreter", "EvaluateConcentrationSaveDc", "Removes linked spell template and conditions.", "ALL")
            ],
            ScalingTiers:
            [
                new("1-4", "Self", "DC 10 minimum for 1-21 damage taken.", "Minimum Threshold"),
                new("5-10", "Self", "DC = floor(Damage / 2) for 22-40 damage.", "Heavy Strike Threshold"),
                new("11-16", "Self", "Advantage with War Caster or +Proficiency with Resilient.", "Feat Reinforcement"),
                new("17-20", "Self", "DC 21+ on 42+ boss damage strikes.", "Catastrophic Impact")
            ],
            WorksWith: ["War Caster (Advantage)", "Resilient (CON)", "Aura of Protection", "Bladesong (+INT to CON Save)"],
            ConflictsWith: ["Casting Another Concentration Spell", "Unconscious / 0 HP"],
            Tags: ["Saving Throw", "Concentration", "Spellcasting", "Constitution", "Core Engine"],
            IsCustomizedForCampaign: false,
            UpdatedByUsername: "Core Engine SQL",
            UpdatedAt: "2026-10-26T00:00:00Z",
            IsCoreEngineRule: true
        ),
        new(
            Id: "rule-sneak-attack",
            RuleCode: "Class.RogueSneakAttack",
            Name: "Sneak Attack",
            Category: "Class Features",
            SourceLabel: "Core Engine",
            RulesetCode: "dnd5e-2024",
            Summary: "Once per turn, you can deal extra precision damage to one creature you hit with an attack if you have Advantage on the attack roll, or if another enemy of the target is within 5 feet of it and you don't have Disadvantage.",
            ActionCost: "Free (1/Turn on Hit)",
            ActionType: "Class Feature",
            RangeLabel: "Weapon Range",
            TargetLabel: "1 Creature Hit by Finesse or Ranged Weapon",
            AttackOrSaveLabel: "Triggers on Hit with Advantage or Flanking Ally",
            DamageOrEffectFormula: "+3d6 Precision Damage (Scales 1d6-10d6)",
            SaveDc: 0,
            AcBonus: 0,
            DurationLabel: "Once Per Turn",
            RequiresConcentration: false,
            PrimaryClassName: "MidiCombatAutomationService",
            PrimaryMethodName: "evaluateSneakAttackEligibility",
            SourceFilePath: "frontend/src/app/services/midi-combat-automation.service.ts",
            Clauses:
            [
                new("c-sa-1", "When", ["Ranged Or Finesse Weapon Attack Hits"], "MidiCombatAutomationService", "evaluateSneakAttackEligibility", "Evaluated on weapon hit before damage roll.", "ANY"),
                new("c-sa-2", "Contains", ["Weapon.Properties Contains 'Finesse'", "Weapon.Properties Contains 'Ranged'"], "MidiCombatAutomationService", "evaluateSneakAttackEligibility", "Requires either a Finesse or a Ranged weapon.", "ANY"),
                new("c-sa-3", "Has Not", ["Attacker Has Not Used Sneak Attack This Turn", "Attacker Has Not Disadvantage"], "MidiCombatAutomationService", "evaluateSneakAttackEligibility", "Cannot trigger if attacker has Disadvantage.", "ALL"),
                new("c-sa-4", "If", ["Attack Has Advantage", "Ally Within 5 ft Of Target"], "MidiCombatAutomationService", "evaluateSneakAttackEligibility", "Requires Advantage OR an active ally within 5 ft.", "ANY"),
                new("c-sa-5", "Then", ["Add Sneak Attack Dice To Damage Roll"], "CharacterCalculationEngine", "EvaluateLevelScalingTier", "Adds level-scaled d6 dice to weapon damage.", "ALL")
            ],
            ScalingTiers:
            [
                new("1-4", "Weapon", "1d6 - 2d6 extra precision damage.", "Initiate Precision"),
                new("5-10", "Weapon", "3d6 - 5d6 extra precision damage.", "Veteran Ambush"),
                new("11-16", "Weapon", "6d6 - 8d6 extra precision damage.", "Master Assassin"),
                new("17-20", "Weapon", "9d6 - 10d6 extra precision damage.", "Mythic Vital Strike")
            ],
            WorksWith: ["Ranged Ricochet Slingshot", "Opportunity Attack (Off-Turn)", "Steady Aim"],
            ConflictsWith: ["Disadvantage on Attack Roll", "Heavy Non-Finesse Weapons"],
            Tags: ["Rogue", "Precision", "Finesse", "Class Feature", "Core Engine"],
            IsCustomizedForCampaign: false,
            UpdatedByUsername: "Core Engine SQL",
            UpdatedAt: "2026-10-26T00:00:00Z",
            IsCoreEngineRule: true
        )
    ];

    private static readonly IReadOnlyList<CampaignActionRuleDto> AllCoreEngineRules =
        [.. PrimaryCoreRules, .. ActionRuleCatalogExtended.GetExtendedCoreRules()];

    public static IReadOnlyList<CampaignActionRuleDto> GetDefaultRules() => AllCoreEngineRules;

    public static IReadOnlyList<CampaignActionRuleDto> GetInitialCampaignCustomRules(int campaignId) =>
        campaignId switch
        {
            1 =>
            [
                new(
                    Id: "rule-ricochet-slingshot",
                    RuleCode: "Campaign.RicochetSlingshot",
                    Name: "Ricochet Slingshot",
                    Category: "Actions",
                    SourceLabel: "Campaign Bypass",
                    RulesetCode: "dnd5e-2024",
                    Summary: "A tuned slingshot loaded with a rare projectile. Bypasses standard Ranged Attack to deal 3d8+5 piercing damage and execute a lethal finisher against wounded targets.",
                    ActionCost: "1 Action",
                    ActionType: "Ranged Weapon Attack (Campaign Custom)",
                    RangeLabel: "60 / 120 feet",
                    TargetLabel: "1 Creature in Line of Sight",
                    AttackOrSaveLabel: "+9 to Hit vs Target AC",
                    DamageOrEffectFormula: "3d8 + 5 Piercing + Fey Gold Ricochet",
                    SaveDc: 16,
                    AcBonus: 0,
                    DurationLabel: "Instantaneous",
                    RequiresConcentration: false,
                    PrimaryClassName: "MidiCombatAutomationService",
                    PrimaryMethodName: "executeWorkflow",
                    SourceFilePath: "frontend/src/app/services/midi-combat-automation.service.ts",
                    Clauses:
                    [
                        new("c-fv-1", "When", ["Ranged Slingshot Attack Declared"], "MidiCombatAutomationService", "executeWorkflow", "Initiates the ranged attack workflow.", "ANY"),
                        new("c-fv-2", "Contains", ["Weapon.Properties Contains 'Ranged'", "Action.Tags Contains 'Spell'"], "MidiCombatAutomationService", "evaluateSneakAttackEligibility", "Eligible for Sneak Attack and Fey ricochet.", "ALL"),
                        new("c-fv-3", "Where", ["Distance(Attacker, Target) <= 60 ft"], "MidiCombatAutomationService", "executeWorkflow", "Normal range 60 ft without disadvantage.", "ALL"),
                        new("c-fv-4", "If", ["AttackTotal >= TargetAC"], "CombatRuleInterpreter", "ResolveShieldReactionWindow", "Checks hit against target AC.", "ALL"),
                        new("c-fv-5", "Then", ["Deal 3d8+5 Piercing & Trigger Ricochet Arc"], "MidiCombatAutomationService", "executeWorkflow", "Deals 3d8+5 piercing and spawns fx-projectile-arc.", "ALL")
                    ],
                    ScalingTiers:
                    [
                        new("1-4", "60 ft", "1d8 + 4 piercing pebble or tooth.", "Scrap Tooth Shot"),
                        new("5-10", "60 ft", "3d8 + 5 piercing + Fey Gold Ricochet.", "Runic Dragon-Tooth Shot"),
                        new("11-16", "90 ft", "4d8 + 6 piercing; ignores half/three-quarters cover.", "Feywild Outcast Arc"),
                        new("17-20", "120 ft", "Guaranteed lethal finisher when target is at its last sliver of HP.", "Mountain-Slayer Slingshot")
                    ],
                    WorksWith: ["Sneak Attack", "Pocket-Maw Ammo Pouch", "Ember Assist"],
                    ConflictsWith: ["Wind Wall"],
                    Tags: ["Campaign Custom", "Ranged", "Slingshot"],
                    IsCustomizedForCampaign: true,
                    UpdatedByUsername: "GeoJason",
                    UpdatedAt: "2026-10-26T15:00:00Z",
                    IsCoreEngineRule: false,
                    BypassesCoreRuleId: "rule-attack-action"
                ),
                new(
                    Id: "rule-reagent-overchannel",
                    RuleCode: "Campaign.ReagentOverchannel",
                    Name: "Ritual Reagent Overchannel",
                    Category: "Actions",
                    SourceLabel: "Campaign Custom",
                    RulesetCode: "dnd5e-2024",
                    Summary: "Consumes refined ritual reagent during spellcasting to amplify spell damage by +2d8 Radiant/Necrotic and raise Spell Save DC by +2 for the cast.",
                    ActionCost: "1 Bonus Action",
                    ActionType: "Bonus Action Augmentation (Campaign Custom)",
                    RangeLabel: "Self",
                    TargetLabel: "Self (Augments Active Spell)",
                    AttackOrSaveLabel: "Increases Spell Save DC by +2",
                    DamageOrEffectFormula: "+2d8 Radiant/Necrotic & +2 Save DC",
                    SaveDc: 18,
                    AcBonus: 0,
                    DurationLabel: "Until the start of your next turn",
                    RequiresConcentration: false,
                    PrimaryClassName: "CharacterCalculationEngine",
                    PrimaryMethodName: "ComputeSpellSaveDc",
                    SourceFilePath: "LoomWeaver.GameSystems/Dnd5eSystemRules.cs",
                    Clauses:
                    [
                        new("c-ck-1", "When", ["Reagent Overchannel Declared"], "MidiCombatAutomationService", "executeWorkflow", "Declared alongside a leveled spell cast.", "ANY"),
                        new("c-ck-2", "Contains", ["Inventory.Reagents Contains 'Ritual Reagent'", "Action.Tags Contains 'Spell'"], "CharacterCalculationEngine", "ComputeSpellSaveDc", "Verifies ritual reagent in caster inventory.", "ALL"),
                        new("c-ck-3", "With", ["VFX Preset 'fx-ground-sigil'"], "CharacterCalculationEngine", "ComputeSpellSaveDc", "Triggers a ground sigil effect.", "ALL"),
                        new("c-ck-4", "Then", ["Apply +2d8 Necrotic/Radiant Surge"], "CharacterCalculationEngine", "ComputeSpellSaveDc", "Adds +2d8 damage and +2 Save DC.", "ALL")
                    ],
                    ScalingTiers:
                    [
                        new("1-4", "Self", "+1d8 damage and +1 Spell Save DC.", "Initiate Dose"),
                        new("5-10", "Self", "+2d8 damage and +2 Spell Save DC.", "Refined Dose"),
                        new("11-16", "Self", "+3d8 damage and +2 Spell Save DC.", "Guild Distillation"),
                        new("17-20", "Self", "+4d8 damage and +3 Spell Save DC.", "Overdraw")
                    ],
                    WorksWith: ["Thread-Seer Hex", "Binding Pulse"],
                    ConflictsWith: ["Antimagic Field"],
                    Tags: ["Campaign Custom", "Ritual Reagent", "Spell Augmentation"],
                    IsCustomizedForCampaign: true,
                    UpdatedByUsername: "GeoJason",
                    UpdatedAt: "2026-10-26T15:30:00Z",
                    IsCoreEngineRule: false,
                    BypassesCoreRuleId: null
                )
            ],
            2 =>
            [
                new(
                    Id: "rule-starstone-reactive-shield",
                    RuleCode: "Campaign.StarstoneReactiveShield",
                    Name: "Starstone Aegis Block (Campaign Bypass)",
                    Category: "Spells",
                    SourceLabel: "Campaign Bypass",
                    RulesetCode: "pf2e-remaster",
                    Summary: "Echoes of the Starstone campaign reaction bypass: raises AC by +4 and absorbs up to 10 physical damage from the triggering strike.",
                    ActionCost: "1 Reaction",
                    ActionType: "Starstone Reaction Bypass",
                    RangeLabel: "Self",
                    TargetLabel: "Self (Triggering Attack)",
                    AttackOrSaveLabel: "Interrupts Attack Roll vs AC",
                    DamageOrEffectFormula: "+4 AC & Reduce Damage by 10",
                    SaveDc: 0,
                    AcBonus: 4,
                    DurationLabel: "Until start of next turn",
                    RequiresConcentration: false,
                    PrimaryClassName: "CombatRuleInterpreter",
                    PrimaryMethodName: "ResolveShieldReactionWindow",
                    SourceFilePath: "LoomWeaver.Modules/ActionStudio/Engine/CombatRuleEngineInterpreter.cs",
                    Clauses:
                    [
                        new("c-st-1", "When", ["An attack hits you"], "MidiCombatAutomationService", "openReactionWindow", "Triggers on incoming hit.", "ANY"),
                        new("c-st-2", "Has", ["Reaction available"], "CombatSessionStateService", "consumeActionResource", "Requires unspent reaction.", "ALL"),
                        new("c-st-3", "Then", ["Spend 1 Reaction", "Grant +4 AC & Reduce Damage by 10"], "CombatRuleInterpreter", "ResolveShieldReactionWindow", "Applies Starstone ward.", "ALL")
                    ],
                    ScalingTiers: [new("1-20", "Self", "+4 AC & Hardness 10", "Starstone Aegis")],
                    WorksWith: ["Raise a Shield"],
                    ConflictsWith: ["Incapacitated"],
                    Tags: ["Campaign Custom", "Reaction", "Starstone"],
                    IsCustomizedForCampaign: true,
                    UpdatedByUsername: "GeoJason",
                    UpdatedAt: "2026-10-26T16:00:00Z",
                    IsCoreEngineRule: false,
                    BypassesCoreRuleId: "rule-shield-reaction"
                )
            ],
            3 =>
            [
                new(
                    Id: "rule-velvet-blood-parry",
                    RuleCode: "Campaign.VelvetBloodParry",
                    Name: "Celerity Blood-Mist Parry (Campaign Bypass)",
                    Category: "Actions",
                    SourceLabel: "Campaign Bypass",
                    RulesetCode: "vtm-v5",
                    Summary: "Court of Velvet Ash campaign reaction bypass: dissolve partially into crimson mist when struck, adding +6 AC and halving any remaining damage.",
                    ActionCost: "1 Reaction",
                    ActionType: "Kindred Discipline Reaction Bypass",
                    RangeLabel: "Self",
                    TargetLabel: "Self (Triggering Attack)",
                    AttackOrSaveLabel: "Interrupts Attack Roll vs AC",
                    DamageOrEffectFormula: "+6 AC & Halve Remaining Damage",
                    SaveDc: 0,
                    AcBonus: 6,
                    DurationLabel: "Instantaneous",
                    RequiresConcentration: false,
                    PrimaryClassName: "CombatRuleInterpreter",
                    PrimaryMethodName: "ResolveShieldReactionWindow",
                    SourceFilePath: "LoomWeaver.Modules/ActionStudio/Engine/CombatRuleEngineInterpreter.cs",
                    Clauses:
                    [
                        new("c-vb-1", "When", ["An attack hits you"], "MidiCombatAutomationService", "openReactionWindow", "Triggers on incoming hit.", "ANY"),
                        new("c-vb-2", "Has", ["Reaction available"], "CombatSessionStateService", "consumeActionResource", "Requires unspent reaction.", "ALL"),
                        new("c-vb-3", "Then", ["Spend 1 Reaction", "Grant +6 AC & Halve Remaining Damage"], "CombatRuleInterpreter", "ResolveShieldReactionWindow", "Applies Celerity mist evasion.", "ALL")
                    ],
                    ScalingTiers: [new("1-20", "Self", "+6 AC & Halve Damage", "Blood-Mist Evasion")],
                    WorksWith: ["Mist Step"],
                    ConflictsWith: ["Sunlight"],
                    Tags: ["Campaign Custom", "Reaction", "Velvet Ash"],
                    IsCustomizedForCampaign: true,
                    UpdatedByUsername: "GeoJason",
                    UpdatedAt: "2026-10-26T16:15:00Z",
                    IsCoreEngineRule: false,
                    BypassesCoreRuleId: "rule-parry-reaction"
                )
            ],
            _ => []
        };
}
