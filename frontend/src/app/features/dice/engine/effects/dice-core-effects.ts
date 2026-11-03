import { computed, signal } from '@angular/core';
import { makeAmbientPresets } from '@effectbuilder/ambient-presets';
import {
  createEffect,
  createFireballComposition,
  createFireHitEffect,
  defaultMotion,
  defaultParticularForLayer,
  EFFECT_KINDS,
  EffectDefinition,
  EffectLayer,
  makePresets,
  parseEffect,
  VARIANTS,
} from '@effectbuilder/effect-definition';
import { makeGasCone, makeSpellTemplates } from '@effectbuilder/spell-templates';

export interface DiceCoreEffect {
  id: string;
  rawId?: string;
  name: string;
  group: string;
  definition: EffectDefinition;
}

export interface DiceCritCustomization {
  presetId: string;
  definition: EffectDefinition;
  customizedByUser?: boolean;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function isProjectileOrPathLayer(layer: EffectLayer): boolean {
  return (
    layer.anchor === 'path' ||
    layer.kind === 'projectile' ||
    layer.kind === 'sky_projectile' ||
    !!layer.missile ||
    !!layer.whip ||
    !!layer.mageHand ||
    layer.fireMaterial?.role === 'projectile' ||
    layer.cinematic?.style === 'beam'
  );
}

/**
 * Converts any EffectBuilder composition (saved user effect, built spell template, or core preset)
 * into a single-target/caster dice effect centered directly on the die with zero projectile flight.
 */
export function adaptEffectForSingleTargetDice(raw: EffectDefinition): EffectDefinition {
  const parsed = parseEffect(structuredClone(raw));
  const nonProjectile = parsed.layers.filter(layer => layer.enabled !== false && !isProjectileOrPathLayer(layer));

  let sourceLayers: EffectLayer[];
  if (nonProjectile.length > 0) {
    sourceLayers = nonProjectile;
  } else {
    const first = parsed.layers[0] ?? createEffect(parsed.name || 'Dice Impact', 'burst').layers[0];
    sourceLayers = [
      {
        ...first,
        kind: 'burst',
        variant: 'radial',
        anchor: 'target',
        delay: 0,
        duration: Math.max(650, first.duration || 950),
        size: Math.max(42, first.size || 56),
        motion: defaultMotion('burst', 'radial'),
        particular: first.particular ?? defaultParticularForLayer('burst', 'radial', first.color),
      },
    ];
  }

  const targetDelays = sourceLayers.filter(l => l.anchor === 'target').map(l => l.delay);
  const minTargetDelay = targetDelays.length > 0 ? Math.min(...targetDelays) : 0;
  const delayShift = minTargetDelay > 220 ? minTargetDelay - 120 : 0;

  const adaptedLayers = sourceLayers.slice(0, 6).map((layer): EffectLayer => {
    const adjustedDelay =
      layer.anchor === 'target' ? Math.max(0, layer.delay - delayShift) : Math.max(0, Math.min(350, layer.delay));
    const adjustedCinematic = layer.cinematic
      ? {
          ...layer.cinematic,
          style: layer.cinematic.style === 'beam' || layer.cinematic.style === 'cone' ? 'nova' : layer.cinematic.style,
          reachFeet: Math.min(20, Math.max(8, layer.cinematic.reachFeet || 12)),
          widthFeet: Math.min(20, Math.max(8, layer.cinematic.widthFeet || 12)),
        }
      : undefined;

    return {
      ...layer,
      anchor: 'target',
      delay: Math.max(0, Math.min(1200, adjustedDelay)),
      duration: Math.max(200, Math.min(4500, layer.duration)),
      count: Math.min(96, Math.max(12, layer.count)),
      missile: undefined,
      projectileCore: undefined,
      skyProjectile: undefined,
      mageHand: undefined,
      fireMaterial:
        layer.fireMaterial && layer.fireMaterial.role === 'projectile'
          ? { ...layer.fireMaterial, role: 'impact' }
          : layer.fireMaterial,
      cinematic: adjustedCinematic,
    };
  });

  return {
    ...parsed,
    gameplay: undefined,
    summon: undefined,
    previewScene: {
      ...parsed.previewScene,
      teleport: undefined,
      walls: [],
    },
    layers: adaptedLayers,
  };
}

const BUILT_SPELL_EFFECTS: DiceCoreEffect[] = [
  ...makeSpellTemplates(),
  makeGasCone(),
  createFireHitEffect(),
  createFireballComposition('caster'),
  createFireballComposition('impact'),
  ...makePresets(),
].map(effect => ({
  id: `eb-built-${slug(effect.id || effect.name)}`,
  rawId: effect.id,
  name: effect.name || effect.spellName || 'Built Effect',
  group: 'Built EffectBuilder effects',
  definition: adaptEffectForSingleTargetDice(effect),
}));

/** The EffectBuilder built compositions, ambient presets, and all caster/target core styles. */
export const DICE_CORE_EFFECTS: readonly DiceCoreEffect[] = [
  ...BUILT_SPELL_EFFECTS,
  ...makeAmbientPresets().map(({ role, effect }) => ({
    id: `eb-${role}-${slug(effect.name)}`,
    rawId: effect.id,
    name: effect.name,
    group: role === 'caster' ? 'Caster effects' : 'Target effects',
    definition: adaptEffectForSingleTargetDice(effect),
  })),
  ...EFFECT_KINDS.flatMap(kind =>
    VARIANTS[kind].flatMap(variant => {
      const definition = createEffect(variant.name, kind);
      const layer = definition.layers[0];
      if (layer.anchor === 'path' || kind === 'projectile' || kind === 'sky_projectile') return [];
      layer.variant = variant.id;
      layer.motion = defaultMotion(kind, variant.id);
      return [
        {
          id: `eb-core-${kind}-${variant.id}`,
          name: `${kind.replace(/_/g, ' ')} / ${variant.name}`,
          group: layer.anchor === 'caster' ? 'Caster core styles' : 'Target core styles',
          definition: adaptEffectForSingleTargetDice(definition),
        },
      ];
    })
  ),
];

const savedLibrarySignal = signal<readonly DiceCoreEffect[]>([]);

export const ALL_DICE_CORE_EFFECTS = computed<readonly DiceCoreEffect[]>(() => [
  ...savedLibrarySignal(),
  ...DICE_CORE_EFFECTS,
]);

export function registerSavedEffectBuilderEffects(effects: readonly EffectDefinition[]): void {
  const mapped: DiceCoreEffect[] = [];
  const seen = new Set<string>();

  for (const raw of effects) {
    if (!raw || typeof raw !== 'object') continue;
    try {
      const adapted = adaptEffectForSingleTargetDice(raw);
      const id = raw.id?.startsWith('eb-saved-') ? raw.id : `eb-saved-${raw.id || slug(adapted.name)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      mapped.push({
        id,
        rawId: raw.id,
        name: adapted.name || adapted.spellName || 'Saved Custom Effect',
        group: 'Saved EffectBuilder effects',
        definition: adapted,
      });
    } catch {
      // Skip malformed effect definitions
    }
  }
  savedLibrarySignal.set(mapped);
}

export function loadLocalEffectBuilderDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    const rawDraft = window.localStorage.getItem('mw-effectbuilder-draft-v1');
    if (!rawDraft) return;
    const parsed = parseEffect(JSON.parse(rawDraft));
    if (!parsed?.layers?.length) return;
    const current = savedLibrarySignal();
    const draftId = `eb-saved-${parsed.id || slug(parsed.name)}`;
    if (!current.some(item => item.id === draftId || item.rawId === parsed.id)) {
      registerSavedEffectBuilderEffects([parsed, ...current.map(c => c.definition)]);
    }
  } catch {
    // Ignore storage read errors
  }
}

const legacy: Record<string, string> = {
  'fx-solar-supernova': 'Dawn Benediction',
  'fx-astral-singularity': 'Arcane Focus',
  'fx-sylvan-bloom': 'Verdant Awakening',
  'fx-basalt-shatter': 'Glacial Fracture',
  'fx-void-fracture': 'Umbral Remnant',
  'fx-ash-crumble': 'Afterburn Smoke',
  'fx-crimson-nova': 'symbol / Crimson mark',
  'fx-aether-overclock': 'Storm Charge',
  'fx-gear-jam-spark': 'Static Afterimage',
  'fx-withered-bramble': 'Briar Aftergrowth',
};

export function diceCoreEffect(id: string): DiceCoreEffect {
  loadLocalEffectBuilderDraft();
  const all = ALL_DICE_CORE_EFFECTS();
  return (
    all.find(
      effect =>
        effect.id === id ||
        effect.rawId === id ||
        effect.name === legacy[id] ||
        effect.name.toLowerCase() === id.toLowerCase() ||
        id === `fx-builder-${slug(effect.name)}`
    ) ?? DICE_CORE_EFFECTS[0]
  );
}

export function diceCritDefinition(id: string, saved?: DiceCritCustomization): EffectDefinition {
  const resolved = diceCoreEffect(id);
  const useSaved =
    saved &&
    (saved.presetId === id || saved.presetId === resolved.id) &&
    saved.customizedByUser === true &&
    saved.definition?.layers?.length > 0;
  const definition = useSaved ? saved.definition : resolved.definition;
  return adaptEffectForSingleTargetDice(definition);
}

/** Keep the authored shaders and layer settings, with single-target dice bounds and no projectiles. */
export function boundedDiceEffect(definition: EffectDefinition): EffectDefinition {
  return adaptEffectForSingleTargetDice(definition);
}
