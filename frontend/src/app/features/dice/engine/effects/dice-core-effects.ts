import { makeAmbientPresets } from '@effectbuilder/ambient-presets';
import { createEffect, defaultMotion, EFFECT_KINDS, EffectDefinition, EffectLayer, parseEffect, VARIANTS } from '@effectbuilder/effect-definition';

export interface DiceCoreEffect { id: string; name: string; group: string; definition: EffectDefinition; }
export interface DiceCritCustomization { presetId: string; definition: EffectDefinition; }
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** The actual EffectBuilder compositions and all caster/target core styles. */
export const DICE_CORE_EFFECTS: readonly DiceCoreEffect[] = [
  ...makeAmbientPresets().map(({ role, effect }) => ({
    id: `eb-${role}-${slug(effect.name)}`, name: effect.name,
    group: role === 'caster' ? 'Caster effects' : 'Target effects', definition: effect,
  })),
  ...EFFECT_KINDS.flatMap(kind => VARIANTS[kind].flatMap(variant => {
    const definition = createEffect(variant.name, kind);
    const layer = definition.layers[0];
    if (layer.anchor === 'path') return [];
    layer.variant = variant.id; layer.motion = defaultMotion(kind, variant.id);
    return [{ id: `eb-core-${kind}-${variant.id}`, name: `${kind.replace(/_/g, ' ')} / ${variant.name}`,
      group: layer.anchor === 'caster' ? 'Caster core styles' : 'Target core styles', definition }];
  })),
];

const legacy: Record<string, string> = {
  'fx-solar-supernova': 'Dawn Benediction', 'fx-astral-singularity': 'Arcane Focus',
  'fx-sylvan-bloom': 'Verdant Awakening', 'fx-basalt-shatter': 'Glacial Fracture',
  'fx-void-fracture': 'Umbral Remnant', 'fx-ash-crumble': 'Afterburn Smoke',
  'fx-crimson-nova': 'symbol / Crimson mark', 'fx-aether-overclock': 'Storm Charge',
  'fx-gear-jam-spark': 'Static Afterimage', 'fx-withered-bramble': 'Briar Aftergrowth',
};
export function diceCoreEffect(id: string): DiceCoreEffect {
  return DICE_CORE_EFFECTS.find(effect => effect.id === id || effect.name === legacy[id]
    || id === `fx-builder-${slug(effect.name)}`) ?? DICE_CORE_EFFECTS[0];
}
export function diceCritDefinition(id: string, saved?: DiceCritCustomization): EffectDefinition {
  const definition = saved?.presetId === id ? saved.definition : diceCoreEffect(id).definition;
  return structuredClone(definition);
}

/** Keep the authored shaders and layer settings, with a bounded overlay budget. */
export function boundedDiceEffect(definition: EffectDefinition): EffectDefinition {
  definition = parseEffect(definition);
  const layers = definition.layers.slice(0, 4).map((layer): EffectLayer => ({ ...layer,
    count: Math.min(96, layer.count), duration: Math.max(100, Math.min(5000, layer.duration)),
    delay: Math.max(0, Math.min(1500, layer.delay)),
  }));
  return { ...definition, gameplay: undefined, summon: undefined,
    previewScene: { ...definition.previewScene, teleport: undefined, walls: [] }, layers };
}
