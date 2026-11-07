import {
  Scene,
} from '@babylonjs/core';
import { MapScatterClusterNode } from '../map-scene-contract';
import { GlbModelCache } from '../rendering/glb-model-cache';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';

export class SeededScatterEngine {
  /** Signature of the last fully built scatter set per scene; lets unchanged rebuilds be skipped. */
  private static readonly builtSignature = new WeakMap<Scene, { key: string; count: number }>();

  static rebuildScatterInstances(
    scene: Scene,
    _seed: number,
    _densityPercent: number,
    clusters?: readonly MapScatterClusterNode[],
    onGlbLoaded?: () => void,
  ): number {
    const signature = clusters && clusters.length > 0 ? JSON.stringify(clusters) : '';
    const built = this.builtSignature.get(scene);
    if (
      built &&
      built.key === signature &&
      (built.count === 0 || scene.transformNodes.some((n) => n.name.startsWith('lw-scatter-node-')))
    ) {
      return built.count;
    }
    this.builtSignature.delete(scene);

    [...scene.transformNodes]
      .filter((n) => n.name.startsWith('lw-scatter-node-'))
      .forEach((n) => n.dispose());
    [...scene.meshes]
      .filter((m) => m.name.startsWith('lw-scatter-'))
      .forEach((m) => m.dispose());

    const hasClusters = Boolean(clusters && clusters.length > 0);
    if (!hasClusters) {
      this.builtSignature.set(scene, { key: signature, count: 0 });
      return 0;
    }

    let totalInstances = 0;
    const cellMeters = TerrainMeshBuilder.getCellStepMeters();

    const makePrng = (initialSeed: number) => {
      let state = initialSeed || 1042;
      return (): number => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    let unresolved = false;
    if (clusters) {
      for (const cluster of clusters) {
        const nextRand = makePrng(cluster.seed);
        const itemCount = Math.min(
          96,
          Math.max(1, Math.round(Math.PI * cluster.radius ** 2 * (cluster.density / 100) * 0.4)),
        );
        const glbTpl = cluster.modelUrl
          ? GlbModelCache.getOrLoadTemplate(scene, cluster.modelUrl, onGlbLoaded)
          : null;

        if (!glbTpl) {
          if (cluster.modelUrl && !GlbModelCache.hasFailed(cluster.modelUrl)) {
            // Leave the signature unset only while the model is genuinely still loading.
            unresolved = true;
          }
          continue;
        }

        const baseScale = cluster.scale ?? 2.8;
        const scaleJitterFrac = Math.max(0, Math.min(0.85, (cluster.scaleJitterPct ?? 20) / 100));
        const baseRotRad = ((cluster.rotationDeg ?? 0) * Math.PI) / 180;
        const rotJitterRad = ((cluster.rotationJitterDeg ?? 360) * Math.PI) / 180;

        for (let j = 0; j < itemCount; j++) {
          if (totalInstances >= 1500) return totalInstances;
          const r =
            itemCount === 1 && j === 0
              ? 0
              : Math.sqrt(nextRand()) * Math.max(0.1, cluster.radius);
          const a = nextRand() * Math.PI * 2;
          const ix = cluster.x + Math.cos(a) * r;
          const iz = cluster.z + Math.sin(a) * r;
          const gy = TerrainMeshBuilder.sampleElevationAt(scene, ix, iz);
          const scaleFactor = Math.max(
            0.25,
            baseScale * (1 + (nextRand() * 2 - 1) * scaleJitterFrac),
          );
          const targetDim = cellMeters * scaleFactor;
          const rotY = baseRotRad + (nextRand() - 0.5) * rotJitterRad;

          const node = GlbModelCache.instantiateClone(
            scene,
            glbTpl,
            `lw-scatter-node-${cluster.id}-${j}`,
            targetDim,
            targetDim,
            targetDim,
            true,
            false,
          );
          node.position.set(ix, gy, iz);
          node.rotation.set(0, rotY, 0);
          node.getChildMeshes().forEach((m) => (m.isPickable = false));
          totalInstances++;
        }
      }
    }

    if (!unresolved) {
      this.builtSignature.set(scene, { key: signature, count: totalInstances });
    }
    return totalInstances;
  }
}
