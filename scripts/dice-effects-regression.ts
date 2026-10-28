import { Scene, Vector3 } from '@babylonjs/core';
import { BabylonEffectRuntime } from '@effectbuilder/babylon/native-runtime';
import { evaluateNativeEffect } from '@effectbuilder/babylon/native-frame';
import { DICE_CORE_EFFECTS, boundedDiceEffect, diceCritDefinition } from '../frontend/src/app/features/dice/engine/effects/dice-core-effects';

export function runDiceEffectsRegression(scene: Scene): string {
  const before = [scene.meshes.length, scene.materials.length, scene.textures.length, scene.lights.length];
  const signatures = new Set<string>();
  for (const effect of DICE_CORE_EFFECTS) {
    const definition = boundedDiceEffect(diceCritDefinition(effect.id));
    const frames = evaluateNativeEffect(definition, 650, {x:0,y:0}, {x:0,y:0}, 1, [{x:0,y:0}], {});
    signatures.add(JSON.stringify(frames.map(f => [f.layer.kind, f.layer.variant, f.particles, f.ribbons, f.fields])));
    const runtime = new BabylonEffectRuntime(scene, {pixelsPerUnit:28});
    runtime.draw(definition, 650, {x:0,y:0}, {x:0,y:0});
    runtime.dispose();
  }
  if (signatures.size < DICE_CORE_EFFECTS.length * 0.85) throw new Error('Core effects lost their distinct native geometry');
  const after = [scene.meshes.length, scene.materials.length, scene.textures.length, scene.lights.length];
  if (after.some((n,i)=>n!==before[i])) throw new Error(`Effects leaked scene resources: ${before} -> ${after}`);
  return `PASS: ${DICE_CORE_EFFECTS.length} native EffectBuilder styles, ${signatures.size} distinct frames, complete GPU resource cleanup.`;
}
