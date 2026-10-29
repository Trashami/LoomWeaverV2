export interface VttSceneListItem {
  readonly sceneKey: string;
  readonly name: string;
  readonly revision: number;
}

export interface VttSceneResponse {
  readonly sceneKey: string;
  readonly name: string;
  readonly revision: number;
  readonly walls: readonly {
    readonly id: string;
    readonly label: string;
    readonly x1: number;
    readonly z1: number;
    readonly x2: number;
    readonly z2: number;
    readonly blocksVision: boolean;
    readonly blocksMovement: boolean;
  }[];
}

export interface CombatStateResponse {
  readonly round: number;
  readonly activeTokenKey: string | null;
  readonly revision: number;
}

export interface ServerVttToken {
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
  readonly movementRemainingFeet: number;
}

/** Server-authoritative combat responses; the API rolls dice and applies damage. */
export interface CombatResolutionResult {
  readonly distanceFeet: number;
  readonly inRange: boolean;
  readonly rawD20: number;
  readonly totalAttackOrSave: number;
  readonly hit: boolean;
  readonly isCritical: boolean;
  readonly damageDealt: number;
  readonly targetRemainingHp: number;
}

export interface EncounterCompletionResult {
  readonly summary: string;
}
