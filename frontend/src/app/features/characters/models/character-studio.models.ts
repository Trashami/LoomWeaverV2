export type CharacterStudioViewMode = 'roster' | 'creator' | 'viewer';

export type CharacterSheetTab =
  | 'overview'
  | 'abilities'
  | 'skills'
  | 'feats'
  | 'spells'
  | 'equipment'
  | 'inventory'
  | 'background'
  | 'notes'
  | 'connections'
  | 'history';

export type LwNoteCategory =
  | 'character'
  | 'session'
  | 'npc'
  | 'location'
  | 'quest'
  | 'lore'
  | 'combat';

export type LwNoteVisibility = 'private' | 'dm-only' | 'global';

export interface LwNoteMentionTagVm {
  readonly compositeKey: string;
  readonly name: string;
  readonly entityType: string;
  readonly routeLink: string;
}

export interface CharacterRichNoteVm {
  readonly id: string;
  readonly title: string;
  readonly noteType: LwNoteCategory;
  readonly visibility: LwNoteVisibility;
  readonly authorUsername: string;
  readonly createdAtLabel: string;
  readonly contentHtml: string;
  readonly contentText: string;
  readonly sourceEntityKey: string;
  readonly sourceEntityName: string;
  readonly mentionedEntities: readonly LwNoteMentionTagVm[];
}

export interface CharacterMetEntityVm {
  readonly id: string;
  readonly compositeKey: string;
  readonly name: string;
  readonly entityType: 'NPC' | 'Place';
  readonly roleOrRegion: string;
  readonly dispositionOrStatus: string;
  readonly sessionMet: string;
  readonly summary: string;
  readonly details: string;
  readonly playerNotesOrClues: string;
  readonly routeLink: string;
  readonly connectedNames: readonly string[];
}

export interface CharacterCampaignHistoryEventVm {
  readonly id: string;
  readonly category: 'Session' | 'Encounter' | 'Quest' | 'Milestone';
  readonly title: string;
  readonly sessionLabel: string;
  readonly locationName: string;
  readonly summary: string;
  readonly outcomeOrReward: string;
  readonly routeLink: string;
  readonly compositeKey: string;
}

export interface AbilityScoreVm {
  readonly code: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  readonly label: string;
  readonly score: number;
  readonly modifier: number;
}

export interface SavingThrowVm {
  readonly code: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  readonly label: string;
  readonly bonus: number;
  readonly proficient: boolean;
}

export interface CharacterSkillVm {
  readonly id: string;
  readonly label: string;
  readonly abilityCode: AbilityScoreVm['code'];
  readonly bonus: number;
  readonly proficient: boolean;
  readonly expertise?: boolean;
}

export interface CharacterSpellVm {
  readonly id: string;
  readonly name: string;
  readonly school: string;
  readonly icon: string;
  readonly tone: 'emerald' | 'gold' | 'crimson' | 'neutral';
  readonly actionCost: string;
  readonly summary: string;
  readonly level?: number;
  readonly prepared?: boolean;
  readonly range?: string;
  readonly duration?: string;
  readonly concentration?: boolean;
  readonly ritual?: boolean;
}

export interface CharacterSpellGroupVm {
  readonly groupId: string;
  readonly label: string;
  readonly slotsRemaining: number;
  readonly slotsMax: number;
  readonly isCantrip?: boolean;
  readonly spells: readonly CharacterSpellVm[];
}

export interface EquipmentLoadoutItemVm {
  readonly id: string;
  readonly name: string;
  readonly slot: 'Armor' | 'Main Hand' | 'Off Hand' | 'Focus' | 'Companion' | 'Gear';
  readonly summary: string;
  readonly bonusLabel: string;
  readonly acBonus: number;
  readonly attackBonus: number;
  readonly equipped: boolean;
  readonly entitlement: 'free' | 'included' | 'purchased' | 'locked';
  readonly icon?: string;
  readonly weightLb?: number;
  readonly valueGp?: number;
  readonly rarity?: string;
  readonly source?: string;
}

export interface CharacterFeatureCardVm {
  readonly id: string;
  readonly title: string;
  readonly category: 'class' | 'feat' | 'ancestry';
  readonly summary: string;
  readonly icon: string;
  readonly tone: 'emerald' | 'gold' | 'crimson' | 'neutral';
}

export interface CharacterPersonalityVm {
  readonly personality: string;
  readonly ideals: string;
  readonly bonds: string;
  readonly flaws: string;
}

export interface CharacterConnectionChipVm {
  readonly id: string;
  readonly label: string;
  readonly routeLink: string;
  readonly compositeKey: string;
}

export interface CharacterConnectionsVm {
  readonly locations: readonly CharacterConnectionChipVm[];
  readonly npcs: readonly CharacterConnectionChipVm[];
  readonly factions: readonly CharacterConnectionChipVm[];
}

export interface CharacterSheetVm {
  readonly compositeKey: string;
  readonly characterKey: string;
  readonly ownerAccountId: string;
  readonly ownerUsername?: string;
  readonly campaignId: number;
  readonly name: string;
  readonly roleBadge: string;
  readonly portraitUrl: string;
  readonly pronouns: string;
  readonly alignment: string;
  readonly quote: string;
  readonly ancestryOrClan: string;
  readonly subrace: string;
  readonly classOrArchetype: string;
  readonly subclass: string;
  readonly backgroundName: string;
  readonly backgroundSummary: string;
  readonly tags: readonly string[];
  readonly systemCode: 'dnd5e' | 'pf2e' | 'vampire_v5';
  readonly level: number;
  readonly currentXp: number;
  readonly nextLevelXp: number;
  readonly levelUpEligible: boolean;
  readonly maxHp: number;
  readonly currentHp: number;
  readonly armorClass: number;
  readonly initiativeBonus: number;
  readonly speedFeet: number;
  readonly proficiencyBonus: number;
  readonly primaryAttackBonus: number;
  readonly actionEconomySummary: string;
  readonly abilities: readonly AbilityScoreVm[];
  readonly savingThrows: readonly SavingThrowVm[];
  readonly skills: readonly CharacterSkillVm[];
  readonly spellGroups: readonly CharacterSpellGroupVm[];
  readonly equipment: readonly EquipmentLoadoutItemVm[];
  readonly featureCards: readonly CharacterFeatureCardVm[];
  readonly features: readonly string[];
  readonly personality: CharacterPersonalityVm;
  readonly connections: CharacterConnectionsVm;
  readonly notes: readonly string[];
  readonly richNotes?: readonly CharacterRichNoteVm[];
  readonly metEntities?: readonly CharacterMetEntityVm[];
  readonly campaignHistory?: readonly CharacterCampaignHistoryEventVm[];
  readonly historyEvents: readonly string[];
}

export interface CreatorTraitVm {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}

export interface CreatorSubraceOptionVm {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly portraitUrl: string;
  readonly source: 'PHB' | 'SRD 5.1' | 'Homebrew';
}

export interface CreatorAncestryOptionVm {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly source: 'PHB' | 'SRD 5.1' | 'Homebrew';
  readonly portraitUrl: string;
  readonly galleryPortraits: readonly string[];
  readonly speedFeet?: number;
  readonly abilityBonuses?: Readonly<Partial<Record<AbilityScoreVm['code'], number>>>;
  readonly traits: readonly CreatorTraitVm[];
  readonly subraces: readonly CreatorSubraceOptionVm[];
}

export interface CreatorClassOptionVm {
  readonly id: string;
  readonly name: string;
  readonly subclassDefault: string;
  readonly subclasses?: readonly string[];
  readonly tagline: string;
  readonly hitDie: number;
  readonly primaryAbility: AbilityScoreVm['code'];
  readonly savingThrows: readonly [AbilityScoreVm['code'], AbilityScoreVm['code']];
  readonly features: readonly CharacterFeatureCardVm[];
  readonly startingSpells: readonly CharacterSpellGroupVm[];
}

export interface CreatorBackgroundOptionVm {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly summary: string;
  readonly source?: string;
  readonly recommendedClasses?: readonly string[];
  readonly recommendedAncestries?: readonly string[];
  readonly skillProficiencies: readonly string[];
  readonly toolProficiencies?: readonly string[];
  readonly featureName?: string;
  readonly defaultQuote: string;
  readonly personality: CharacterPersonalityVm;
}

export interface CreatorFeatOptionVm {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly source: string;
  readonly prerequisite: string;
  readonly abilityBonus: string;
  readonly summary: string;
}

export interface CharacterCreatorDraftVm {
  readonly name: string;
  readonly pronouns: string;
  readonly alignment: string;
  readonly quote: string;
  readonly portraitUrl: string;
  readonly level?: number;
  readonly ancestryId: string;
  readonly subraceId: string;
  readonly classId: string;
  readonly subclass: string;
  readonly backgroundId: string;
  readonly selectedSkills: readonly string[];
  readonly selectedFeatId: string;
  readonly startingPack: string;
  readonly equipmentItems?: readonly EquipmentLoadoutItemVm[];
  readonly equippedItemIds?: readonly string[];
  readonly backpackItemIds?: readonly string[];
  readonly personalityTrait?: string;
  readonly ideal?: string;
  readonly bond?: string;
  readonly flaw?: string;
  readonly abilities: Readonly<Record<AbilityScoreVm['code'], number>>;
}

export interface CampaignAdjustedRuleVm {
  readonly id: string;
  readonly categoryLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly castingOrActionTime: string;
  readonly rangeOrArea: string;
  readonly componentsOrSlot: string;
  readonly durationLabel: string;
  readonly sourceLabel: string;
  readonly damageOrBonusBadge: string;
  readonly standardRuleText: string;
  readonly campaignAdjustedRuleTitle: string;
  readonly campaignAdjustedRuleText: string;
  readonly campaignClauseFormula?: string;
  readonly tags: readonly string[];
  readonly rollConfig?: {
    readonly category: 'ability' | 'save' | 'skill' | 'initiative' | 'attack' | 'damage' | 'spell-attack' | 'feature' | 'combat-action';
    readonly actionSlotCost: 'none' | 'action' | 'bonus' | 'reaction' | 'movement';
    readonly diceSides: number;
    readonly diceCount: number;
    readonly modifier: number;
    readonly damageDiceCount?: number;
    readonly damageDiceSides?: number;
    readonly damageBonus?: number;
    readonly damageType?: string;
    readonly spellSlotLevel?: number;
    readonly limitedUseId?: string;
  };
}

export interface CharacterSheetActionRowVm {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly filterCategory: 'ATTACK' | 'ACTION' | 'BONUS ACTION' | 'REACTION' | 'OTHER' | 'LIMITED USE';
  readonly actionSlotCost: 'none' | 'action' | 'bonus' | 'reaction';
  readonly rangeLabel: string;
  readonly hitOrDcLabel: string;
  readonly attackBonus: number;
  readonly damageFormula: string;
  readonly damageDiceCount: number;
  readonly damageDiceSides: number;
  readonly damageBonus: number;
  readonly damageType: string;
  readonly notes: string;
  readonly description: string;
  readonly campaignRuleNote: string;
  readonly spellSlotLevel?: number;
  readonly limitedUseId?: string;
  readonly limitedUseMax?: number;
  readonly resetOn?: 'Short Rest' | 'Long Rest';
}

export interface CharacterCombatTelemetryVm {
  readonly characterKey: string;
  readonly characterName: string;
  readonly totalSessionRolls: number;
  readonly nat20Count: number;
  readonly critFailCount: number;
  readonly rollsByNumber: Readonly<Record<number, number>>;
  readonly landedStrikes: number;
  readonly missedStrikes: number;
  readonly attacksInterrupted: number;
  readonly attacksReducedDamage: number;
  readonly totalDamageDealt: number;
  readonly totalDamageReducedOrMitigated: number;
  readonly peakSingleHit: number;
  readonly spellsCastCount: number;
  readonly abilitiesUsedCount: number;
}

export interface CharacterSheetRollLogVm {
  readonly id: string;
  readonly characterKey: string;
  readonly characterName: string;
  readonly category: string;
  readonly itemName: string;
  readonly formula: string;
  readonly rawRolls: readonly number[];
  readonly naturalDie: number;
  readonly modifier: number;
  readonly total: number;
  readonly isNat20: boolean;
  readonly isCritFail: boolean;
  readonly hit: boolean | null;
  readonly damageDealt: number;
  readonly damageReduced: number;
  readonly wasInterrupted: boolean;
  readonly wasDamageReduced: boolean;
  readonly actionSlotConsumed: string;
  readonly trackedInSession: boolean;
  readonly trackedInEncounter: boolean;
  readonly summaryMessage: string;
  readonly sha256Digest: string;
  readonly timestampLabel: string;
}

export interface CharacterTurnEconomyState {
  readonly actionUsed: boolean;
  readonly bonusUsed: boolean;
  readonly reactionUsed: boolean;
  readonly movementUsedFeet: number;
  readonly heroicInspiration: boolean;
  readonly shortRestSpent: boolean;
  readonly longRestSpent: boolean;
  readonly rollMode: 'normal' | 'advantage' | 'disadvantage';
  readonly tempHp: number;
  readonly spellSlotsUsed: Readonly<Record<number, number>>;
  readonly limitedUsesSpent: Readonly<Record<string, number>>;
}

export const STANDARD_COMBAT_ACTIONS: readonly {
  readonly id: string;
  readonly name: string;
  readonly cost: 'action' | 'bonus' | 'reaction';
  readonly summary: string;
  readonly campaignAdjustment: string;
}[] = [
  { id: 'ca-attack', name: 'Attack', cost: 'action', summary: 'Make one melee or ranged weapon attack (or two with Extra Attack at Level 5+ martial classes).', campaignAdjustment: 'Weapon Mastery properties (Vex, Topple, Push, Cleave, Nick) trigger automatically on landed strikes.' },
  { id: 'ca-dash', name: 'Dash', cost: 'action', summary: 'Gain extra movement for the current turn equal to your Speed after applying modifiers.', campaignAdjustment: 'Rogues (Cunning Action) and Monks (Step of the Wind) may Dash as a Bonus Action.' },
  { id: 'ca-disengage', name: 'Disengage', cost: 'action', summary: 'Your movement does not provoke Opportunity Attacks for the rest of the current turn.', campaignAdjustment: 'Swashbucklers and Speedy feat bearers automatically avoid Opportunity Attacks from targets they strike.' },
  { id: 'ca-dodge', name: 'Dodge', cost: 'action', summary: 'Attack rolls against you have Disadvantage if you can see the attacker, and you make DEX saves with Advantage.', campaignAdjustment: 'Stacks with cover wards from your campaign (+2 AC behind barricades).' },
  { id: 'ca-grapple', name: 'Grapple', cost: 'action', summary: 'Target makes a STR or DEX saving throw (DC = 8 + STR mod + Prof. Bonus) or has the Grappled condition (Speed 0).', campaignAdjustment: 'Campaign-specific grapple modifications apply when set up in your campaign.' },
  { id: 'ca-help', name: 'Help', cost: 'action', summary: 'Grant an ally Advantage on their next ability check or attack roll against a creature within 5 ft.', campaignAdjustment: 'Familiars can take the Help action on their initiative count.' },
  { id: 'ca-hide', name: 'Hide', cost: 'action', summary: 'Make a DC 15 DEX (Stealth) check while Heavily Obscured or behind Cover to gain the Invisible condition.', campaignAdjustment: 'VTT 2.5D Line-of-Sight & Gradual Lighting automatically validates whether your token is in shadow.' },
  { id: 'ca-magic', name: 'Magic', cost: 'action', summary: 'Cast a spell that has a casting time of 1 Action or activate a magical item/feature.', campaignAdjustment: 'Consumes 1 Action and the required Spell Slot level; subject to Counterspell reaction within 60 ft.' },
  { id: 'ca-ready', name: 'Ready', cost: 'action', summary: 'Prepare a specific action triggered by a perceivable circumstance before your next turn (uses Reaction when triggered).', campaignAdjustment: 'Holding a spell requires Concentration until the trigger fires.' },
  { id: 'ca-search', name: 'Search', cost: 'action', summary: 'Make a WIS (Perception, Insight, Medicine, or Survival) check to discern concealed hazards or motives.', campaignAdjustment: 'Stone-sense grants automatic Advantage when searching subterranean stonework or dwarven runes.' },
  { id: 'ca-shove', name: 'Shove', cost: 'action', summary: 'Target makes a STR or DEX save (DC = 8 + STR mod + Prof. Bonus) or is pushed 5 ft or knocked Prone.', campaignAdjustment: 'Pushing a target into VTT elevation drop-offs or traps triggers immediate hazard damage.' },
  { id: 'ca-study', name: 'Study', cost: 'action', summary: 'Make an INT (Arcana, History, Investigation, Nature, or Religion) check to recall lore or analyze a foe.', campaignAdjustment: 'Reveals creature resistances and unlocks a Deep Link citation in The Loom.' },
  { id: 'ca-utilize', name: 'Utilize', cost: 'action', summary: 'Use a non-magical object, mechanism, healer kit, or lever.', campaignAdjustment: 'Drinking a Potion of Healing is a Bonus Action in this campaign; administering it to an ally is 1 Action.' },
];
