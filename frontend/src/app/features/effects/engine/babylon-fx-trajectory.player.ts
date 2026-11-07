import { Scene, Vector3 } from '@babylonjs/core';
import { playNativeEffect, prewarmNativeEffectShaders } from '@effectbuilder/babylon/native-runtime';
import { effectDuration } from '@effectbuilder/effect-definition';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';
import { WaterChannelTerrain } from '../../maps/engine/water/water-channel-terrain';
import { EffectTimelinePresetVm } from './effect-timeline.contract';
import { EffectBuilderVttResolver } from './effectbuilder-vtt-resolver';

export interface PlayVttSpellEffectOptions {
  readonly abilityName?: string;
  readonly characterId?: number;
  readonly campaignId?: number;
  readonly targets?: readonly { x: number; z: number }[];
  readonly onPlayStateChange?: (playing: boolean) => void;
}

export class BabylonFxTrajectoryPlayer {
  private readonly resolver = new EffectBuilderVttResolver();
  private readonly activeHandles = new Set<{ dispose: () => void }>();

  prefetchCampaignEffects(campaignId: number): void {
    this.resolver.prefetchForCampaign(campaignId);
  }

  prewarmStage(scene: Scene): void {
    prewarmNativeEffectShaders(scene);
  }

  play(
    scene: Scene | null,
    preset: EffectTimelinePresetVm,
    caster: { x: number; z: number },
    target: { x: number; z: number },
    options?: PlayVttSpellEffectOptions,
  ): void {
    if (!scene) return;

    const definition = this.resolver.resolveEffectDefinition({
      abilityName: options?.abilityName,
      characterId: options?.characterId,
      campaignId: options?.campaignId,
      preset,
    });

    const sampleSurfaceY = (x: number, z: number): number =>
      WaterChannelTerrain.sampleWaterOrGroundLevelAt(
        scene,
        x,
        z,
        TerrainMeshBuilder.sampleElevationAt(scene, x, z),
      );

    const casterGroundY = sampleSurfaceY(caster.x, caster.z);
    const casterVec = new Vector3(caster.x, casterGroundY + 0.52, caster.z);

    const rawTargets =
      options?.targets && options.targets.length > 0 ? options.targets : [target];

    const targetVecs = rawTargets.map((pt, idx) => {
      let tx = pt.x;
      let tz = pt.z;
      if (Math.hypot(tx - caster.x, tz - caster.z) < 0.05) {
        const angle = (idx * Math.PI * 2) / Math.max(1, rawTargets.length);
        tx += Math.cos(angle) * 0.35;
        tz += Math.sin(angle) * 0.35;
      }
      const ty = sampleSurfaceY(tx, tz);
      return new Vector3(tx, ty + 0.45, tz);
    });

    options?.onPlayStateChange?.(true);

    const combatTimeScale = 1.0;
    const handle = playNativeEffect(
      scene,
      definition,
      () => casterVec,
      () => targetVecs,
      {
        pixelsPerUnit: 66,
        scale: 0.85,
        elevationAt: (x: number, z: number) => sampleSurfaceY(x, z) + 0.28,
        lightGain: 4.2,
        timeScale: combatTimeScale,
      },
    );

    this.activeHandles.add(handle);
    const totalMs = Math.max(
      1400,
      Math.min(10000, Math.round(effectDuration(definition) / combatTimeScale) + 220),
    );
    setTimeout(() => {
      handle.dispose();
      this.activeHandles.delete(handle);
      if (this.activeHandles.size === 0) {
        options?.onPlayStateChange?.(false);
      }
    }, totalMs);
  }

  disposeAll(): void {
    for (const h of this.activeHandles) {
      h.dispose();
    }
    this.activeHandles.clear();
  }
}
