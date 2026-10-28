import { GlowLayer, Scene, Vector3 } from '@babylonjs/core';
import { playNativeEffect } from '@effectbuilder/babylon/native-runtime';
import { DiceCritEffectPreset } from './dice-crit-effects.catalog';
import { boundedDiceEffect, diceCritDefinition, DiceCritCustomization } from './dice-core-effects';

/** Uses the same GPU geometry, shaders, timing and lights as EffectBuilder. */
export class DiceCritEffectsRunner {
  private active?: { dispose: () => void };
  triggerCritEffect(preset: DiceCritEffectPreset, origin: Vector3, scene: Scene,
    _glowLayer: GlowLayer | null, intensity = 0.55, saved?: DiceCritCustomization): void {
    this.clearActiveEffects();
    const definition = boundedDiceEffect(diceCritDefinition(preset.id, saved));
    const position = new Vector3(origin.x, 0.08, origin.z);
    this.active = playNativeEffect(scene, definition, () => position, () => [position],
      { pixelsPerUnit: 28, lightGain: Math.max(0, intensity) * 2 });
  }
  clearActiveEffects(): void { this.active?.dispose(); this.active = undefined; }
}
