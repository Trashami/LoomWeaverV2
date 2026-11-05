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

export type DndSizeCategory =
  | 'tiny'
  | 'small'
  | 'medium'
  | 'large'
  | 'huge'
  | 'gargantuan';

export const DND_SIZE_ORDER: readonly DndSizeCategory[] = [
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
];

export const DND_SIZE_METRICS: Record<
  DndSizeCategory,
  { label: string; spaceFeet: number; gridSquares: number; scaleFactor: number }
> = {
  tiny: { label: 'Tiny', spaceFeet: 2.5, gridSquares: 0.5, scaleFactor: 0.5 },
  small: { label: 'Small', spaceFeet: 5, gridSquares: 1, scaleFactor: 0.8 },
  medium: { label: 'Medium', spaceFeet: 5, gridSquares: 1, scaleFactor: 1.0 },
  large: { label: 'Large', spaceFeet: 10, gridSquares: 2, scaleFactor: 2.0 },
  huge: { label: 'Huge', spaceFeet: 15, gridSquares: 3, scaleFactor: 3.0 },
  gargantuan: { label: 'Gargantuan', spaceFeet: 20, gridSquares: 4, scaleFactor: 4.0 },
};

export function getDndSizeScale(category?: string): number {
  const cat = (category?.toLowerCase() || 'medium') as DndSizeCategory;
  return DND_SIZE_METRICS[cat]?.scaleFactor ?? 1.0;
}

export type DndTokenSizeCategory = DndSizeCategory;

export const DND_TOKEN_SIZE_CATEGORIES: readonly { id: DndSizeCategory; label: string }[] = [
  { id: 'tiny', label: 'Tiny' },
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'huge', label: 'Huge' },
  { id: 'gargantuan', label: 'Gargantuan' },
];

export type VttConditionKey =
  | 'prone'
  | 'concentrating'
  | 'blessed'
  | 'hasted'
  | 'shielded'
  | 'poisoned'
  | 'invisible';

export type VttTokenLightPreset =
  | 'none'
  | 'torch'
  | 'lantern-hooded'
  | 'lantern_hooded'
  | 'lantern-bullseye'
  | 'lantern_bullseye'
  | 'candle'
  | 'spell-light'
  | 'spell_light'
  | 'daylight';

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
  readonly facingY?: number;
  readonly colorHex: string;
  readonly actionUsed: boolean;
  readonly bonusUsed: boolean;
  readonly reactionUsed: boolean;
  readonly movementFeet: number;
  readonly sightFeet?: number;
  readonly darkvisionFeet?: number;
  readonly canControl?: boolean;
  readonly avatarUrl?: string;
  readonly glbUrl?: string;
  readonly sizeCategory?: DndSizeCategory;
  readonly conditions?: readonly VttConditionKey[];
  readonly colorOverride?: string;
  readonly emitsLight?: boolean;
  readonly lightPreset?: VttTokenLightPreset;
  readonly lightBrightFeet?: number;
  readonly lightDimFeet?: number;
  readonly lightColorHex?: string;
  readonly lightFlicker?: number;
  readonly ambientGlowEnabled?: boolean;
  readonly ambientGlowColorHex?: string;
  readonly ambientGlowIntensity?: number;
  readonly ambientGlowRadiusFeet?: number;
}

const LEGACY_NEON_DEFAULTS = new Set([
  '#2ee66b',
  '#49e892',
  '#ef4444',
  '#ef5d72',
  '#737982',
  '#1b5e3a',
  '#7f1d1d',
  '#3d464d',
  '#d4a853',
  '#94a3b8',
]);

/**
 * Resolves the outer faction rim color for a token base:
 * - Friendly / Party (PC): Emerald green (#22c55e)
 * - Enemy / Hostile / Monster: Crimson red (#ef4444)
 * - NPC / Ally / Neutral: Arcane sapphire blue (#38bdf8)
 * - DM Override: Takes precedence if explicitly set to a custom color
 */
export function getTokenRimColorHex(
  token: Pick<VttTokenVm, 'faction' | 'roleLabel' | 'colorOverride' | 'colorHex'>,
): string {
  const override = token.colorOverride?.trim().toLowerCase();
  if (override && override.length > 0 && !LEGACY_NEON_DEFAULTS.has(override)) {
    return token.colorOverride!.trim();
  }
  const faction = token.faction;
  const role = (token.roleLabel || '').toLowerCase();
  if (faction === 'hostile' || role.includes('monster') || role.includes('enemy') || role.includes('hostile')) {
    return '#ef4444';
  }
  if (faction === 'party' || role === 'pc' || role.includes('player') || role.includes('lv.')) {
    return '#22c55e';
  }
  return '#38bdf8';
}

/**
 * Resolves the deeper outer-wall collar shade for a token base:
 * - Friendly (PC / party): Deep emerald (#15803d)
 * - Enemy (Hostile / monster): Deep crimson (#b91c1c)
 * - NPC / Ally: Deep sapphire blue (#1d4ed8)
 */
export function getTokenBaseColorHex(token: VttTokenVm): string {
  const override = token.colorOverride?.trim().toLowerCase();
  if (override && override.length > 0 && !LEGACY_NEON_DEFAULTS.has(override)) {
    return token.colorOverride!.trim();
  }
  const faction = token.faction;
  const role = (token.roleLabel || '').toLowerCase();
  if (faction === 'hostile' || role.includes('monster') || role.includes('enemy') || role.includes('hostile')) {
    return '#b91c1c';
  }
  if (faction === 'party' || role === 'pc' || role.includes('player') || role.includes('lv.')) {
    return '#15803d';
  }
  return '#1d4ed8';
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
