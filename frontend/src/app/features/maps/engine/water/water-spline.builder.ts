import { createWaterVolume } from './water-volume';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { Scene } from '@babylonjs/core';
import type { WaterSplineNode } from '../map-scene-contract';
import { WaterChannelTerrain } from './water-channel-terrain';
import { createWaterNetworkMesh } from './water-network-mesh';
import { WaterSurfaceMaterial } from './water-surface-material';
import { createWaterfallSpray } from './waterfall-spray';

export class WaterSplineBuilder {
  private static watched = new WeakSet<Scene>();
  private static rendered = new WeakMap<Scene, readonly unknown[]>();
  private static builtSigByScene = new WeakMap<Scene, string>();

  private static computeSig(splines: readonly WaterSplineNode[]): string {
    const elevVer = TerrainMeshBuilder.getElevationVersion();
    if (!splines || splines.length === 0) return `${elevVer}|empty`;
    return `${elevVer}|${JSON.stringify(splines)}`;
  }

  static rebuildWaterSplines(scene: Scene, splines: readonly WaterSplineNode[]): void {
    const sig = this.computeSig(splines);
    const profiles = WaterChannelTerrain.getProfiles(scene);
    const hasWaterMeshes = scene.meshes.some((m) => m.name.startsWith('lw-water-spline-'));
    if (
      this.builtSigByScene.get(scene) === sig &&
      this.rendered.get(scene) === profiles &&
      (splines.length === 0 || hasWaterMeshes)
    ) {
      return;
    }

    this.builtSigByScene.set(scene, sig);
    this.rendered.set(scene, profiles);

    for (const system of [...scene.particleSystems]) {
      if (system.name.startsWith('lw-water-spray-')) system.dispose();
    }
    for (const mesh of [...scene.meshes]) {
      if (!mesh.name.startsWith('lw-water-spline-')) continue;
      mesh.material?.dispose(false, false);
      mesh.dispose();
    }

    if (!this.watched.has(scene)) {
      this.watched.add(scene);
      scene.onBeforeRenderObservable.add(() => {
        if (this.rendered.get(scene) !== WaterChannelTerrain.getProfiles(scene)) {
          this.builtSigByScene.delete(scene);
          this.rebuildWaterSplines(scene, WaterChannelTerrain.getBodies(scene));
        }
      });
    }

    for (const network of WaterChannelTerrain.getNetworks(scene)) {
      // Use the most recently added/updated profile in the network for material defaults
      const profile = network[network.length - 1] ?? network[0];
      const mesh = createWaterNetworkMesh(scene, network, (x, z) =>
        TerrainMeshBuilder.sampleElevationAt(scene, x, z),
      );
      mesh.material = WaterSurfaceMaterial.create(scene, profile.id, profile.settings);
      createWaterVolume(scene, mesh, network, (x, z) =>
        TerrainMeshBuilder.sampleElevationAt(scene, x, z),
      );
    }
    for (const profile of profiles) createWaterfallSpray(scene, profile);
  }
}
