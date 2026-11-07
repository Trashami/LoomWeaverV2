import {
  Material,
  Matrix,
  Mesh,
  Quaternion,
  Scene,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { MapScatterClusterNode } from '../map-scene-contract';
import { toBaseGlbUrl } from '../rendering/glb-lod';
import { CachedGlbTemplate, GlbModelCache } from '../rendering/glb-model-cache';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';

interface ScatterInstanceTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY: number;
  /** Target bounding dimension (`cellMeters * scaleFactor * tierScale.uniform`). */
  readonly effHeight: number;
}

interface CachedClusterSamples {
  readonly signature: string;
  readonly baseUrl: string;
  readonly modelUrl: string;
  readonly instances: readonly ScatterInstanceTransform[];
}

interface ScatterPrimitiveCarrier {
  readonly mesh: Mesh;
  /** Base transform of this mesh inside the centered `templatePivot` (before per-instance scale/rotation/translation). */
  readonly localMatrix: Matrix;
}

interface ScatterAssetCarrier {
  readonly baseUrl: string;
  readonly templateUrl: string;
  readonly maxSpan: number;
  readonly baseOffsetY: number;
  readonly primitives: readonly ScatterPrimitiveCarrier[];
}

/**
 * Hardware GPU Thin-Instanced Scatter Engine (`Mesh.thinInstanceSetBuffer('matrix', ...)`).
 *
 * Loads each unique scattered 3D asset into memory ONLY ONCE, creates a single carrier mesh per primitive,
 * and uploads all scattered stamps of that asset as a compact `Float32Array(N * 16)` matrix buffer.
 * Whether a user scatters 10 or 1,500 grass/foliage stamps, there is only 1 mesh in the scene graph
 * and 1 GPU draw call (`gl.drawElementsInstanced`) per unique asset.
 */
export class SeededScatterEngine {
  /** Cached random sample points per cluster ID so dragging the scatter brush only computes samples for the newly added cluster. */
  private static readonly clusterSamplesByScene = new WeakMap<
    Scene,
    Map<string, CachedClusterSamples>
  >();

  /** Single GPU thin-instance carrier per unique `baseUrl` per scene. */
  private static readonly assetCarriersByScene = new WeakMap<
    Scene,
    Map<string, ScatterAssetCarrier>
  >();

  /** Tracks last uploaded matrix buffer signature per asset so unchanged assets skip GPU buffer re-uploads. */
  private static readonly assetUploadSigByScene = new WeakMap<Scene, Map<string, string>>();

  static evictScene(scene: Scene): void {
    this.clusterSamplesByScene.get(scene)?.clear();
    this.assetUploadSigByScene.get(scene)?.clear();
    const carriers = this.assetCarriersByScene.get(scene);
    if (carriers) {
      for (const carrier of carriers.values()) {
        for (const p of carrier.primitives) {
          if (!p.mesh.isDisposed()) {
            p.mesh.dispose(false, false);
          }
        }
      }
      carriers.clear();
    }
  }

  /** Invalidates cached terrain elevation samples without disposing the GPU carrier meshes. */
  static invalidateTerrainSamples(scene: Scene): void {
    this.clusterSamplesByScene.get(scene)?.clear();
    this.assetUploadSigByScene.get(scene)?.clear();
  }

  private static getOrCreateAssetCarrier(
    scene: Scene,
    baseUrl: string,
    tpl: CachedGlbTemplate,
  ): ScatterAssetCarrier {
    let carrierMap = this.assetCarriersByScene.get(scene);
    if (!carrierMap) {
      carrierMap = new Map<string, ScatterAssetCarrier>();
      this.assetCarriersByScene.set(scene, carrierMap);
    }

    const existing = carrierMap.get(baseUrl);
    if (
      existing &&
      existing.templateUrl === tpl.url &&
      existing.primitives.length > 0 &&
      existing.primitives.every((p) => !p.mesh.isDisposed())
    ) {
      return existing;
    }

    if (existing) {
      for (const p of existing.primitives) {
        if (!p.mesh.isDisposed()) {
          p.mesh.dispose(false, false);
        }
      }
      carrierMap.delete(baseUrl);
    }

    const tempPivot = tpl.templatePivot.clone(
      `lw-scatter-carrier-pivot-${baseUrl}`,
      null,
    );
    const primitives: ScatterPrimitiveCarrier[] = [];

    if (tempPivot) {
      tempPivot.setEnabled(true);
      tempPivot.position.set(0, 0, 0);
      tempPivot.rotationQuaternion = null;
      tempPivot.rotation.set(0, 0, 0);
      tempPivot.scaling.setAll(1);
      tempPivot.computeWorldMatrix(true);

      const childMeshes = tempPivot.getChildMeshes(false);
      let idx = 0;
      for (const m of childMeshes) {
        if (m instanceof Mesh && m.getTotalVertices() > 0) {
          const localMatrix = m.computeWorldMatrix(true).clone();
          m.parent = null;
          m.name = `lw-scatter-carrier-mesh-${idx++}-${baseUrl}`;
          m.position.set(0, 0, 0);
          m.rotationQuaternion = null;
          m.rotation.set(0, 0, 0);
          m.scaling.setAll(1);
          m.computeWorldMatrix(true);
          if (localMatrix.determinant() < 0) {
            m.overrideMaterialSideOrientation = Material.CounterClockWiseSideOrientation;
          }
          m.isPickable = false;
          m.receiveShadows = false;
          m.doNotSyncBoundingInfo = true;
          m.alwaysSelectAsActiveMesh = true;
          m.setEnabled(false);
          primitives.push({
            mesh: m,
            localMatrix,
          });
        }
      }
      tempPivot.dispose(false, false);
    }

    const carrier: ScatterAssetCarrier = {
      baseUrl,
      templateUrl: tpl.url,
      maxSpan: Math.max(0.05, tpl.rawWidth, tpl.rawHeight, tpl.rawDepth),
      baseOffsetY: tpl.baseOffsetY,
      primitives,
    };
    carrierMap.set(baseUrl, carrier);
    return carrier;
  }

  static rebuildScatterInstances(
    scene: Scene,
    _seed: number,
    _densityPercent: number,
    clusters?: readonly MapScatterClusterNode[],
    onGlbLoaded?: () => void,
  ): number {
    if (!clusters || clusters.length === 0) {
      this.evictScene(scene);
      return 0;
    }

    let sampleMap = this.clusterSamplesByScene.get(scene);
    if (!sampleMap) {
      sampleMap = new Map<string, CachedClusterSamples>();
      this.clusterSamplesByScene.set(scene, sampleMap);
    }

    let uploadSigMap = this.assetUploadSigByScene.get(scene);
    if (!uploadSigMap) {
      uploadSigMap = new Map<string, string>();
      this.assetUploadSigByScene.set(scene, uploadSigMap);
    }

    const tier = GlbModelCache.getLodTier();
    const cellMeters = TerrainMeshBuilder.getCellStepMeters();
    const activeClusterIds = new Set<string>();

    const makePrng = (initialSeed: number) => {
      let state = initialSeed || 1042;
      return (): number => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    // Group active cluster samples by asset baseUrl
    const instancesByAsset = new Map<
      string,
      {
        modelUrl: string;
        sigParts: string[];
        instances: ScatterInstanceTransform[];
      }
    >();

    let totalInstances = 0;
    const MAX_TOTAL_SCATTER_INSTANCES = 1800;

    for (const cluster of clusters) {
      if (!cluster.modelUrl) continue;
      activeClusterIds.add(cluster.id);

      const baseUrl = toBaseGlbUrl(cluster.modelUrl);
      const tierScale = GlbModelCache.getTierScaleFactors(cluster.modelUrl, tier);
      const clusterSig = `${tier}|${tierScale.uniform.toFixed(3)}|${cellMeters.toFixed(3)}|${baseUrl}|${cluster.seed}|${cluster.x.toFixed(2)}|${cluster.z.toFixed(2)}|${cluster.radius.toFixed(2)}|${cluster.density}|${cluster.scale ?? 2.8}|${cluster.scaleJitterPct ?? 20}|${cluster.rotationDeg ?? 0}|${cluster.rotationJitterDeg ?? 360}`;

      let cached = sampleMap.get(cluster.id);
      if (!cached || cached.signature !== clusterSig) {
        const nextRand = makePrng(cluster.seed);
        const itemCount = Math.min(
          40,
          Math.max(1, Math.round(Math.PI * cluster.radius ** 2 * (cluster.density / 100) * 0.32)),
        );
        const baseScale = cluster.scale ?? 2.8;
        const scaleJitterFrac = Math.max(0, Math.min(0.85, (cluster.scaleJitterPct ?? 20) / 100));
        const baseRotRad = ((cluster.rotationDeg ?? 0) * Math.PI) / 180;
        const rotJitterRad = ((cluster.rotationJitterDeg ?? 360) * Math.PI) / 180;

        const instances: ScatterInstanceTransform[] = [];
        for (let j = 0; j < itemCount; j++) {
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
          const effHeight = cellMeters * scaleFactor * tierScale.uniform;
          const rotY = baseRotRad + (nextRand() - 0.5) * rotJitterRad;
          instances.push({ x: ix, y: gy, z: iz, rotY, effHeight });
        }

        cached = {
          signature: clusterSig,
          baseUrl,
          modelUrl: cluster.modelUrl,
          instances,
        };
        sampleMap.set(cluster.id, cached);
      }

      let group = instancesByAsset.get(baseUrl);
      if (!group) {
        group = {
          modelUrl: cluster.modelUrl,
          sigParts: [],
          instances: [],
        };
        instancesByAsset.set(baseUrl, group);
      }

      group.sigParts.push(`${cluster.id}:${cached.signature}`);
      for (const inst of cached.instances) {
        if (totalInstances >= MAX_TOTAL_SCATTER_INSTANCES) break;
        group.instances.push(inst);
        totalInstances++;
      }
    }

    // Prune deleted cluster sample caches
    for (const id of sampleMap.keys()) {
      if (!activeClusterIds.has(id)) {
        sampleMap.delete(id);
      }
    }

    const scaleVec = new Vector3();
    const transVec = new Vector3();
    const rotQuat = new Quaternion();
    const pivotWorldMatrix = new Matrix();
    const finalMatrix = new Matrix();

    // Reconcile thin instance buffers per unique asset
    for (const [baseUrl, group] of instancesByAsset.entries()) {
      // Always request lightweight 'low' tier GLB for scatter clusters
      const glbTpl = GlbModelCache.getOrLoadTemplate(
        scene,
        group.modelUrl,
        onGlbLoaded,
        'low',
      );
      if (!glbTpl) {
        continue;
      }

      const carrier = this.getOrCreateAssetCarrier(scene, baseUrl, glbTpl);
      const count = group.instances.length;
      if (count === 0 || carrier.primitives.length === 0) {
        for (const p of carrier.primitives) {
          p.mesh.setEnabled(false);
          p.mesh.thinInstanceCount = 0;
        }
        uploadSigMap.delete(baseUrl);
        continue;
      }

      const assetSig = `${carrier.templateUrl}|${count}|${group.sigParts.join(';')}`;
      if (uploadSigMap.get(baseUrl) === assetSig) {
        continue;
      }
      uploadSigMap.set(baseUrl, assetSig);

      for (const prim of carrier.primitives) {
        const buffer = new Float32Array(count * 16);
        for (let i = 0; i < count; i++) {
          const inst = group.instances[i];
          const s = inst.effHeight / carrier.maxSpan;
          scaleVec.set(s, s, s);
          Quaternion.RotationYawPitchRollToRef(inst.rotY, 0, 0, rotQuat);
          transVec.set(inst.x, inst.y + carrier.baseOffsetY * s, inst.z);
          Matrix.ComposeToRef(scaleVec, rotQuat, transVec, pivotWorldMatrix);
          prim.localMatrix.multiplyToRef(pivotWorldMatrix, finalMatrix);
          finalMatrix.copyToArray(buffer, i * 16);
        }
        prim.mesh.setEnabled(true);
        prim.mesh.thinInstanceSetBuffer('matrix', buffer, 16, false);
      }
    }

    // Disable and dispose carriers for assets no longer present in any cluster
    const carrierMap = this.assetCarriersByScene.get(scene);
    if (carrierMap) {
      for (const [baseUrl, carrier] of carrierMap.entries()) {
        if (!instancesByAsset.has(baseUrl)) {
          for (const p of carrier.primitives) {
            if (!p.mesh.isDisposed()) {
              p.mesh.dispose(false, false);
            }
          }
          carrierMap.delete(baseUrl);
          uploadSigMap.delete(baseUrl);
        }
      }
    }

    return totalInstances;
  }
}
