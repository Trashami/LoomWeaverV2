import {
  ACTION_BAR_SKINS,
  ActionBarSkinId,
  DEFAULT_ACTION_BAR_SKIN,
} from '../vtt-action-bar/action-bar-skins';

export type ActionDockSkin = ActionBarSkinId;

export const ACTION_DOCK_SKINS = ACTION_BAR_SKINS;

export const DEFAULT_ACTION_DOCK_SKIN: ActionDockSkin = DEFAULT_ACTION_BAR_SKIN;

/** Minimal token shape the dock reads. The parent maps its own token model into this. */
export interface DockToken {
  id: number;
  name: string;
  imageUrl?: string | null;
  entityType?: 'pc' | 'npc' | 'monster' | null;
  hp?: number | null;
  maxHp?: number | null;
  armorClass?: number | null;
  inspiration?: boolean | null;
  /** Opaque reference the parent can use to open its character sheet. */
  sheetRef?: unknown;
}

/** A weapon attack or spell the token can use. */
export interface DockAction {
  id: string;
  name: string;
  kind: 'weapon' | 'spell' | 'bonus' | 'reaction';
  /** Economy cost label shown on bonus and reaction cards. */
  cost?: string | null;
  /** Material Icons ligature name, for example "gavel". */
  icon?: string | null;
  desc?: string | null;
  attackFormula?: string | null;
  damageFormula?: string | null;
  damageType?: string | null;
  minRangeFeet?: number | null;
  maxRangeFeet?: number | null;
  spellType?: string | null;
  requiresConcentration?: boolean | null;
  aoeShape?: string | null;
  aoeSizeFeet?: number | null;
}

export interface DockStandardAction {
  id: string;
  name: string;
  icon: string;
  tag: string;
  desc: string;
  conditionApplied?: string;
  statCheck?: string;
}

export interface DockSkill {
  name: string;
  ability: string;
}

export interface DockSave {
  ability: string;
  name: string;
}

export interface DockOnlineUser {
  userId: number;
  displayName: string;
  isDm?: boolean;
}

export type DockActionCategory =
  | 'melee'
  | 'ranged'
  | 'spells'
  | 'bonus'
  | 'reactions'
  | 'abilities'
  | 'saves'
  | 'actions';

export type DockActionTab = 'Attacks' | 'Spells' | 'Actions' | 'Skills' | 'Saves' | 'Utility';

export const DOCK_ABILITIES: readonly string[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export const DOCK_ACTION_TABS: readonly DockActionTab[] = [
  'Attacks',
  'Spells',
  'Actions',
  'Skills',
  'Saves',
  'Utility',
];

export const DOCK_STANDARD_ACTIONS: readonly DockStandardAction[] = [
  { id: 'attack', name: 'Attack', icon: 'gavel', tag: '1 Action', desc: 'Make one melee or ranged attack with a weapon or unarmed strike.' },
  { id: 'cast_spell', name: 'Cast a Spell', icon: 'auto_stories', tag: 'Varies', desc: 'Cast a cantrip or leveled spell from your spellbook or prepared list.' },
  { id: 'dash', name: 'Dash', icon: 'bolt', tag: '1 Action', desc: 'Gain extra movement equal to your speed for the current turn.' },
  { id: 'disengage', name: 'Disengage', icon: 'shield', tag: '1 Action', desc: 'Your movement does not provoke opportunity attacks for the rest of the turn.' },
  { id: 'dodge', name: 'Dodge', icon: 'verified_user', tag: '1 Action', desc: 'Any attack roll made against you has disadvantage, and you make DEX saving throws with advantage.', conditionApplied: 'Dodging' },
  { id: 'help', name: 'Help', icon: 'group', tag: '1 Action', desc: 'Give an ally advantage on their next ability check or attack roll before the start of your next turn.' },
  { id: 'hide', name: 'Hide', icon: 'visibility_off', tag: '1 Action', desc: 'Make a Dexterity (Stealth) check in an attempt to hide. If unseen, you gain advantage on attacks.', conditionApplied: 'Hidden', statCheck: 'Stealth' },
  { id: 'ready', name: 'Ready', icon: 'schedule', tag: '1 Action + Reaction', desc: 'Wait for a particular trigger before acting, holding your reaction to release your readied action.' },
  { id: 'search', name: 'Search', icon: 'search', tag: '1 Action', desc: 'Devote your attention to finding something by making a Wisdom (Perception) or Intelligence (Investigation) check.', statCheck: 'Perception' },
  { id: 'use_object', name: 'Use an Object', icon: 'inventory_2', tag: '1 Action', desc: 'Interact with a complex object, drink a potion, pull a mechanism, or draw a second weapon.' },
  { id: 'prone', name: 'Drop Prone / Stand Up', icon: 'arrow_downward', tag: 'Free / Half Move', desc: 'Drop prone to grant ranged attacks disadvantage against you (melee attacks gain advantage), or spend half movement to stand up.', conditionApplied: 'Prone' },
];

export const DOCK_SKILLS: readonly DockSkill[] = [
  { name: 'Acrobatics', ability: 'DEX' },
  { name: 'Animal Handling', ability: 'WIS' },
  { name: 'Arcana', ability: 'INT' },
  { name: 'Athletics', ability: 'STR' },
  { name: 'Deception', ability: 'CHA' },
  { name: 'History', ability: 'INT' },
  { name: 'Insight', ability: 'WIS' },
  { name: 'Intimidation', ability: 'CHA' },
  { name: 'Investigation', ability: 'INT' },
  { name: 'Medicine', ability: 'WIS' },
  { name: 'Nature', ability: 'INT' },
  { name: 'Perception', ability: 'WIS' },
  { name: 'Performance', ability: 'CHA' },
  { name: 'Persuasion', ability: 'CHA' },
  { name: 'Religion', ability: 'INT' },
  { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Stealth', ability: 'DEX' },
  { name: 'Survival', ability: 'WIS' },
];

export const DOCK_SAVES: readonly DockSave[] = [
  { ability: 'STR', name: 'Strength Save' },
  { ability: 'DEX', name: 'Dexterity Save' },
  { ability: 'CON', name: 'Constitution Save' },
  { ability: 'INT', name: 'Intelligence Save' },
  { ability: 'WIS', name: 'Wisdom Save' },
  { ability: 'CHA', name: 'Charisma Save' },
];

export const DOCK_CONDITIONS: readonly string[] = [
  'Hidden',
  'Faerie Fire',
  'Dodging',
  'Blessed',
  'Concentrating',
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];
