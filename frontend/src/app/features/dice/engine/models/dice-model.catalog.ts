import { DiceModelDefinition } from './dice-model.types';

export const DICE_MODEL_CATALOG: DiceModelDefinition[] = [
  {
    id: 'model-classic-chamfer',
    name: 'Classic Beveled Polyhedra',
    description: 'Balanced tabletop chamfer (0.955 bevel) with gap-free edge quads and corner caps.',
    geometryMode: 'procedural-chamfer',
    chamferFactor: 0.955,
    scaleMultiplier: 1.0,
    edgeSharpnessLabel: 'Balanced edges',
    unlockSource: 'free',
    priceLabel: 'Free',
    isDefaultUnlocked: true
  },
  {
    id: 'model-sharp-gem',
    name: 'Razor-Edge Guild Cut',
    description: 'Hand-lapped tournament gem cut (0.990 razor chamfer) with crisp planar facets.',
    geometryMode: 'procedural-chamfer',
    chamferFactor: 0.99,
    scaleMultiplier: 1.02,
    edgeSharpnessLabel: 'Almost sharp edges',
    unlockSource: 'free',
    priceLabel: 'Free',
    isDefaultUnlocked: true
  },
  {
    id: 'model-dwarven-heavy',
    name: 'Kildrid Deep-Forged Ingot',
    description: 'Deep stone-and-iron bevels with broad armored edges.',
    geometryMode: 'procedural-chamfer',
    chamferFactor: 0.82,
    scaleMultiplier: 1.06,
    edgeSharpnessLabel: 'Wide stone bevels',
    unlockSource: 'reward',
    priceLabel: 'Milestone Reward',
    rewardMilestoneId: 'milestone-dwarven-delve',
    loommarksCost: 350,
    isDefaultUnlocked: false
  },
  {
    id: 'model-caged-filigree',
    name: 'Cinth Hollow Filigree Cage',
    description: 'Open polyhedral edge cage with inset numbered panels.',
    geometryMode: 'procedural-chamfer',
    chamferFactor: 0.76,
    scaleMultiplier: 1.04,
    edgeSharpnessLabel: 'Open cage with inset faces',
    unlockSource: 'loommarks',
    priceLabel: '450 Loommarks',
    loommarksCost: 450,
    priceUsdCents: 299,
    isDefaultUnlocked: false
  },
  {
    id: 'model-custom-glb',
    name: 'Artificer Double-Faceted Cut',
    description: 'Double-cut facets around every face and corner.',
    geometryMode: 'procedural-chamfer',
    chamferFactor: 0.90,
    scaleMultiplier: 1.04,
    edgeSharpnessLabel: 'Two rows of cut facets',
    unlockSource: 'free',
    priceLabel: 'Included',
    isDefaultUnlocked: true
  }
];

export function resolveDiceModel(modelId?: string | null): DiceModelDefinition {
  if (!modelId) return DICE_MODEL_CATALOG[0];
  return DICE_MODEL_CATALOG.find(m => m.id === modelId) ?? DICE_MODEL_CATALOG[0];
}

export function registerDiceModel(model: DiceModelDefinition): void {
  const idx = DICE_MODEL_CATALOG.findIndex(m => m.id === model.id);
  if (idx >= 0) {
    DICE_MODEL_CATALOG[idx] = model;
  } else {
    DICE_MODEL_CATALOG.push(model);
  }
}
