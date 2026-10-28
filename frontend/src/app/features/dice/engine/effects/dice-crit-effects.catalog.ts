import recipes from './effectbuilder-recipes.json';
export type DiceCritOutcomeKind = 'nat20' | 'critfail';

export interface DiceCritEffectPreset {
  id: string;
  recipeName?: string;
  outcomeKind: DiceCritOutcomeKind;
  name: string;
  description: string;
  primaryColorHex: string;
  secondaryColorHex: string;
  bloomBoost: number;
  particleCount: number;
  hasShockwaveRing: boolean;
  hasLightPillar: boolean;
  upwardDriftSpeed: number;
}

export const DICE_NAT20_EFFECTS: DiceCritEffectPreset[] = [
  {
    id: 'fx-solar-supernova',
    outcomeKind: 'nat20',
    name: 'Solar Supernova',
    description: 'Golden-emerald celestial pillar with expanding runic shockwave and rising embers',
    primaryColorHex: '#ffd166',
    secondaryColorHex: '#49e892',
    bloomBoost: 1.55,
    particleCount: 54,
    hasShockwaveRing: true,
    hasLightPillar: true,
    upwardDriftSpeed: 2.8
  },
  {
    id: 'fx-astral-singularity',
    outcomeKind: 'nat20',
    name: 'Astral Singularity',
    description: 'Cyan-violet gravity burst with orbital prism rings and starlight motes',
    primaryColorHex: '#56e6ff',
    secondaryColorHex: '#c06cff',
    bloomBoost: 1.65,
    particleCount: 60,
    hasShockwaveRing: true,
    hasLightPillar: true,
    upwardDriftSpeed: 3.1
  },
  {
    id: 'fx-sylvan-bloom',
    outcomeKind: 'nat20',
    name: 'Feywild Sylvan Bloom',
    description: 'Living emerald aura with spiraling fey fireflies and golden canopy pulse',
    primaryColorHex: '#2ee66b',
    secondaryColorHex: '#d9b77a',
    bloomBoost: 1.45,
    particleCount: 52,
    hasShockwaveRing: true,
    hasLightPillar: false,
    upwardDriftSpeed: 2.4
  },
  {
    id: 'fx-aether-overclock',
    outcomeKind: 'nat20',
    name: 'Aether Overclock',
    description: 'Pressurized amber-gold discharge with dual concentric artificer rings',
    primaryColorHex: '#ffb340',
    secondaryColorHex: '#73e2ff',
    bloomBoost: 1.5,
    particleCount: 50,
    hasShockwaveRing: true,
    hasLightPillar: true,
    upwardDriftSpeed: 2.9
  },
  {
    id: 'fx-crimson-nova',
    outcomeKind: 'nat20',
    name: 'Cinth Crimson Ascension',
    description: 'Noble crimson-silver flare with ascending bloodstone sparks',
    primaryColorHex: '#ff3b5c',
    secondaryColorHex: '#f5d0d8',
    bloomBoost: 1.5,
    particleCount: 54,
    hasShockwaveRing: true,
    hasLightPillar: true,
    upwardDriftSpeed: 2.7
  }
];

export const DICE_CRITFAIL_EFFECTS: DiceCritEffectPreset[] = [
  {
    id: 'fx-basalt-shatter',
    outcomeKind: 'critfail',
    name: 'Basalt Fault Fracture',
    description: 'Cracked ember shock-ring with heavy falling cinder fragments',
    primaryColorHex: '#ff425b',
    secondaryColorHex: '#591620',
    bloomBoost: 0.95,
    particleCount: 42,
    hasShockwaveRing: true,
    hasLightPillar: false,
    upwardDriftSpeed: -1.4
  },
  {
    id: 'fx-void-fracture',
    outcomeKind: 'critfail',
    name: 'Void Rift Collapse',
    description: 'Imploding violet-crimson rift with collapsing shadow motes',
    primaryColorHex: '#b538ff',
    secondaryColorHex: '#ff2e55',
    bloomBoost: 1.05,
    particleCount: 44,
    hasShockwaveRing: true,
    hasLightPillar: false,
    upwardDriftSpeed: -1.2
  },
  {
    id: 'fx-ash-crumble',
    outcomeKind: 'critfail',
    name: 'Ashen Smolder',
    description: 'Dying charcoal flare with low drifting ash and scorched ring',
    primaryColorHex: '#d9534f',
    secondaryColorHex: '#6c757d',
    bloomBoost: 0.8,
    particleCount: 36,
    hasShockwaveRing: true,
    hasLightPillar: false,
    upwardDriftSpeed: 0.6
  },
  {
    id: 'fx-gear-jam-spark',
    outcomeKind: 'critfail',
    name: 'Artificer Overload Spark',
    description: 'Erratic copper-red short-circuit sparks and smoke ring',
    primaryColorHex: '#ff6b35',
    secondaryColorHex: '#8c2d19',
    bloomBoost: 0.95,
    particleCount: 46,
    hasShockwaveRing: true,
    hasLightPillar: false,
    upwardDriftSpeed: -0.9
  },
  {
    id: 'fx-withered-bramble',
    outcomeKind: 'critfail',
    name: 'Withered Bramble Blight',
    description: 'Corrupted dark-amber pulse with decaying spore drift',
    primaryColorHex: '#c94a38',
    secondaryColorHex: '#3d2b1f',
    bloomBoost: 0.85,
    particleCount: 38,
    hasShockwaveRing: true,
    hasLightPillar: false,
    upwardDriftSpeed: -0.8
  }
];

for (const recipe of recipes) {
  const outcomeKind = recipe.sourceKind === 'caster' ? 'nat20' : 'critfail';
  const preset: DiceCritEffectPreset = {
    id: 'fx-builder-' + recipe.name.toLowerCase().replaceAll(' ', '-'), recipeName: recipe.name,
    name: recipe.name, description: recipe.description, outcomeKind,
    primaryColorHex: recipe.specs[0].color, secondaryColorHex: recipe.specs.at(-1)!.color,
    bloomBoost: 0.5, particleCount: 32, hasShockwaveRing: false, hasLightPillar: false, upwardDriftSpeed: 1,
  };
  (outcomeKind === 'nat20' ? DICE_NAT20_EFFECTS : DICE_CRITFAIL_EFFECTS).push(preset);
}

export function resolveNat20Effect(effectId: string | null | undefined): DiceCritEffectPreset {
  if (!effectId) return DICE_NAT20_EFFECTS[0];
  return DICE_NAT20_EFFECTS.find(e => e.id === effectId) ?? DICE_NAT20_EFFECTS[0];
}

export function resolveCritFailEffect(effectId: string | null | undefined): DiceCritEffectPreset {
  if (!effectId) return DICE_CRITFAIL_EFFECTS[0];
  return DICE_CRITFAIL_EFFECTS.find(e => e.id === effectId) ?? DICE_CRITFAIL_EFFECTS[0];
}
