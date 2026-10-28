import { Scene } from '@babylonjs/core';
import type { WaterSplineNode } from '../map-scene-contract';
import { WaterChannelTerrain } from './water-channel-terrain';
import { createWaterMesh } from './water-surface-geometry';
import { WaterSurfaceMaterial } from './water-surface-material';
import { createWaterfallSpray } from './waterfall-spray';

export class WaterSplineBuilder {
  private static watched = new WeakSet<Scene>();
  private static rendered = new WeakMap<Scene, readonly unknown[]>();
  static rebuildWaterSplines(scene: Scene, splines: readonly WaterSplineNode[]): void {
    for (const system of [...scene.particleSystems]) {
      if (system.name.startsWith('lw-water-spray-')) system.dispose();
    }
    for (const mesh of [...scene.meshes]) {
      if (!mesh.name.startsWith('lw-water-spline-')) continue;
      mesh.material?.dispose(false,false);
      mesh.dispose();
    }
    if (!this.watched.has(scene)) {
      this.watched.add(scene);
      scene.onBeforeRenderObservable.add(() => {
        if (this.rendered.get(scene) !== WaterChannelTerrain.getProfiles(scene)) {
          this.rebuildWaterSplines(scene,WaterChannelTerrain.getBodies(scene));
        }
      });
    }
    const profiles = WaterChannelTerrain.getProfiles(scene);
    this.rendered.set(scene,profiles);
    for (const profile of profiles) {
      if (!profile.samples.length) continue;
      const mesh = createWaterMesh(scene,profile);
      mesh.material = WaterSurfaceMaterial.create(scene,profile.id,profile.settings);
      createWaterfallSpray(scene,profile);
    }
    WaterSurfaceMaterial.configureCapture(scene,splines.length > 0 && profiles.some(p => p.settings.refraction > 0));
  }
}
