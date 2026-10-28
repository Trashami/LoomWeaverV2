import { DICE_CORE_EFFECTS, diceCoreEffect } from './dice-core-effects';
export type DiceCritOutcomeKind = 'nat20' | 'critfail';
export interface DiceCritEffectPreset {
  id: string; name: string; description: string; outcomeKind: DiceCritOutcomeKind;
  primaryColorHex: string; secondaryColorHex: string;
  bloomBoost: number; particleCount: number; hasShockwaveRing: boolean;
  hasLightPillar: boolean; upwardDriftSpeed: number;
}
function preset(id: string, outcomeKind: DiceCritOutcomeKind): DiceCritEffectPreset {
  const effect = diceCoreEffect(id);
  return { id, outcomeKind, name: effect.name, description: effect.definition.description,
    primaryColorHex: effect.definition.layers[0].color, secondaryColorHex: effect.definition.layers[0].secondaryColor,
    bloomBoost: 0.5, particleCount: 48, hasShockwaveRing: false, hasLightPillar: false, upwardDriftSpeed: 1 };
}
export const DICE_NAT20_EFFECTS = DICE_CORE_EFFECTS.map(effect => preset(effect.id, 'nat20'));
export const DICE_CRITFAIL_EFFECTS = DICE_CORE_EFFECTS.map(effect => preset(effect.id, 'critfail'));
export function resolveNat20Effect(id?: string | null): DiceCritEffectPreset { return preset(id || DICE_CORE_EFFECTS[0].id, 'nat20'); }
export function resolveCritFailEffect(id?: string | null): DiceCritEffectPreset { return preset(id || DICE_CORE_EFFECTS[0].id, 'critfail'); }
