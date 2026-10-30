export type EffectTrajectoryType = 'arc' | 'cone' | 'beam' | 'sigil';

export interface EffectTimelinePresetVm {
  readonly id: string;
  readonly name: string;
  readonly trajectoryType: EffectTrajectoryType;
  readonly primaryColorHex: string;
  readonly secondaryColorHex: string;
  readonly particleCount: number;
  readonly durationMs: number;
  readonly keyframes: readonly string[];
}

export interface ActionRuleVm {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly actionCost: '1 Action' | '1 Bonus Action' | '1 Reaction' | 'Free Action';
  readonly rangeFeet: number;
  readonly triggerWhen: string;
  readonly conditionIf: string;
  readonly executeThen: string;
  readonly attackBonus: number;
  readonly saveDc: number;
  readonly damageDiceCount: number;
  readonly damageDiceSides: number;
  readonly damageBonus: number;
  readonly damageFormula: string;
  readonly linkedEffectPresetId: string;
  readonly canonStatus: 'approved' | 'draft';
}

export interface VttTokenVm {
  readonly key: string;
  readonly name: string;
  readonly roleLabel: string;
  readonly faction: 'party' | 'hostile' | 'ally';
  readonly initiative: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly armorClass: number;
  readonly x: number;
  readonly z: number;
  readonly colorHex: string;
  readonly actionUsed: boolean;
  readonly bonusUsed: boolean;
  readonly reactionUsed: boolean;
  readonly movementFeet: number;
  /** Sight range in feet. Falls back to the player sight setting when absent. */
  readonly sightFeet?: number;
  /** Darkvision range in feet. Extends vision when it exceeds sight. */
  readonly darkvisionFeet?: number;
}

export interface CombatResolutionLogVm {
  readonly id: string;
  readonly round: number;
  readonly attackerName: string;
  readonly targetName: string;
  readonly actionName: string;
  readonly distanceFeet: number;
  readonly hit: boolean;
  readonly isCritical: boolean;
  readonly damageDealt: number;
  readonly message: string;
}
