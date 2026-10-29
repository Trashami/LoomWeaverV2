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
