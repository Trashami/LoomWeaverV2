import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshoptCompression,
  PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
} from '@babylonjs/core';

import {
  GlbLodTier,
  ModelManifestResponse,
  buildGlbLodManifest,
  glbLodCandidates,
  resolveGlbLodUrl,
  toBaseGlbUrl,
} from './glb-lod';

export interface CachedGlbTemplate {
  readonly url: string;
  readonly baseUrl: string;
  readonly templatePivot: TransformNode;
  readonly rawWidth: number;
  readonly rawHeight: number;
  readonly rawDepth: number;
  readonly baseOffsetY: number;
  /** Ratio (0.55..1.0) of mid-height horizontal width to full bounding-box width (detects flared bases). */
  readonly waistWidthRatio: number;
  /** 8-band vertical profile (bottom y=0 to top y=1) of normalized half-span (0.15..0.50) along the length axis. */
  readonly halfSpanProfile: readonly number[];
  wallLightingNormalized?: boolean;
}

export interface GlbCloneMetadata {
  readonly lwNodeName: string;
  readonly lwKind?: 'wall' | 'door' | 'object' | 'light';
  readonly lwEntityId?: string;
  readonly lwWallId?: string;
}

export interface GlbPaintOptions {
  readonly colorHex?: string;
  readonly surfaceFinish?: 'standard' | 'matte' | 'metallic' | 'runic-glow';
  readonly opacity?: number;
}

export class GlbModelCache {
  private static cache = new Map<string, CachedGlbTemplate>();
  private static pending = new Map<string, Promise<CachedGlbTemplate | null>>();
  private static pendingCallbacks = new Map<string, Set<() => void>>();
  private static failedUrls = new Set<string>();
  private static activeScene: Scene | null = null;
  private static sharedGhostMat: StandardMaterial | null = null;
  private static tintedMatCache = new Map<string, StandardMaterial>();
  private static decoderConfigured = false;
  private static lodTier: GlbLodTier = 'mid';
  private static lodManifest = new Map<string, Partial<Record<GlbLodTier, string>>>();
  private static catalogManifestPromise: Promise<void> | null = null;
  /** Bumped on every eviction so loads started under an old tier are discarded on completion. */
  private static generation = 0;

  /**
   * Ensures `/assets/object-library/index.json` (`obj-<hash>` -> `sourceFile`) and
   * `/api/v2/maps/assets/model-manifest` are loaded even when `/arcane-screen` is opened
   * directly without visiting `/maps` first.
   */
  private static ensureCatalogManifestsLoaded(): Promise<void> {
    if (this.catalogManifestPromise) return this.catalogManifestPromise;
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      this.catalogManifestPromise = Promise.resolve();
      return this.catalogManifestPromise;
    }
    const p1 = fetch('/assets/object-library/index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: { assets?: Array<{ id?: string; sourceFile?: string }> } | null) => {
        for (const a of doc?.assets ?? []) {
          if (a.id && a.sourceFile) {
            this.registerSourceFileLodMapping(a.id, a.sourceFile);
          }
        }
      })
      .catch(() => undefined);

    const p2 = fetch('/api/v2/maps/assets/model-manifest')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: ModelManifestResponse | null) => {
        if (m) {
          this.setLodManifest(buildGlbLodManifest(m));
        }
      })
      .catch(() => undefined);

    this.catalogManifestPromise = Promise.all([p1, p2]).then(() => {
      this.failedUrls.clear();
    });
    return this.catalogManifestPromise;
  }

  /** Supplies the server's list of existing LOD files so missing variants are never requested. */
  static setLodManifest(manifest: ReadonlyMap<string, Partial<Record<GlbLodTier, string>>>): void {
    for (const [k, v] of manifest.entries()) {
      this.lodManifest.set(k, { ...this.lodManifest.get(k), ...v });
    }
  }

  /**
   * Registers an `obj-<hash>` asset's `sourceFile` base name so both
   * `/assets/object-library/models/obj-<hash>_{low,mid,high}.glb` and
   * `/assets/models-3d/<sourceBase>_{low,mid,high}.glb` are known LOD candidates.
   */
  static registerSourceFileLodMapping(id: string, sourceFile?: string): void {
    if (!id || !sourceFile || !sourceFile.toLowerCase().endsWith('.glb')) return;
    const objBase = `/assets/object-library/models/${id}.glb`;
    const srcBase = `/assets/models-3d/${toBaseGlbUrl(sourceFile)}`;
    const variants = {
      low: resolveGlbLodUrl(srcBase, 'low'),
      mid: resolveGlbLodUrl(srcBase, 'mid'),
      high: resolveGlbLodUrl(srcBase, 'high'),
    };
    this.lodManifest.set(objBase, variants);
    this.lodManifest.set(srcBase, variants);
  }

  static ensureScene(scene: Scene): void {
    void this.ensureCatalogManifestsLoaded();
    if (!this.decoderConfigured) {
      try {
        MeshoptCompression.Configuration.decoder = {
          url: '/assets/object-library/meshopt_decoder.js',
        };
      } catch {
        // Use default meshopt configuration fallback
      }
      this.decoderConfigured = true;
    }
    if (this.activeScene !== scene) {
      this.cache.clear();
      this.pending.clear();
      this.pendingCallbacks.clear();
      this.tintedMatCache.clear();
      this.sharedGhostMat = null;
      this.activeScene = scene;
    }
  }

  static getSharedGhostMaterial(scene: Scene): StandardMaterial {
    this.ensureScene(scene);
    if (!this.sharedGhostMat || this.sharedGhostMat.getScene() !== scene) {
      const mat = new StandardMaterial('lw-shared-ghost-mat', scene);
      mat.diffuseColor = Color3.FromHexString('#49e892');
      mat.emissiveColor = Color3.FromHexString('#2ee66b').scale(0.5);
      mat.alpha = 0.48;
      this.sharedGhostMat = mat;
    }
    return this.sharedGhostMat;
  }

  private static getOrCreatePaintMaterial(
    scene: Scene,
    paint: GlbPaintOptions,
  ): StandardMaterial | null {
    const hex = (paint.colorHex || '#ffffff').toLowerCase();
    const finish = paint.surfaceFinish || 'standard';
    const alpha = paint.opacity ?? 1.0;
    if (hex === '#ffffff' && finish === 'standard' && alpha >= 0.99) {
      return null;
    }
    const key = `${hex}|${finish}|${alpha.toFixed(2)}`;
    const existing = this.tintedMatCache.get(key);
    if (existing && existing.getScene() === scene) {
      return existing;
    }
    const mat = new StandardMaterial(`lw-paint-mat-${key}`, scene);
    const col = Color3.FromHexString(hex);
    mat.diffuseColor = col;
    mat.alpha = alpha;
    if (finish === 'matte') {
      mat.specularColor = Color3.FromHexString('#0d120f');
      mat.roughness = 0.95;
    } else if (finish === 'metallic') {
      mat.specularColor = Color3.FromHexString('#e5f4ec');
      mat.specularPower = 64;
      mat.emissiveColor = col.scale(0.14);
    } else if (finish === 'runic-glow') {
      mat.specularColor = col;
      mat.emissiveColor = col.scale(0.55);
    } else {
      mat.specularColor = Color3.FromHexString('#25332b');
    }
    this.tintedMatCache.set(key, mat);
    return mat;
  }

  /**
   * Returns the single cached template for `modelUrl` at the current quality LOD tier,
   * or initiates a single deduplicated async load shared across all stamps of this asset.
   */
  static getOrLoadTemplate(
    scene: Scene,
    modelUrl: string,
    onLoaded?: () => void,
  ): CachedGlbTemplate | null {
    this.ensureScene(scene);
    if (!modelUrl || !modelUrl.toLowerCase().endsWith('.glb')) {
      return null;
    }
    const baseUrl = toBaseGlbUrl(modelUrl);
    const cached = this.cache.get(baseUrl) ?? this.cache.get(modelUrl);
    if (cached) {
      return cached;
    }

    const candidates = glbLodCandidates(baseUrl, this.lodTier, this.lodManifest).filter(
      (c) => !this.failedUrls.has(c),
    );
    if (candidates.length === 0 && this.catalogManifestPromise !== null) {
      return null;
    }

    for (const c of candidates) {
      const hit = this.cache.get(c);
      if (hit) {
        this.cache.set(baseUrl, hit);
        return hit;
      }
    }

    if (onLoaded) {
      let cbs = this.pendingCallbacks.get(baseUrl);
      if (!cbs) {
        cbs = new Set<() => void>();
        this.pendingCallbacks.set(baseUrl, cbs);
      }
      cbs.add(onLoaded);
    }

    if (!this.pending.has(baseUrl)) {
      const gen = this.generation;
      const loadPromise = this.loadCandidateChainAsync(scene, baseUrl, candidates, gen).then(
        (tpl) => {
          if (gen !== this.generation) {
            return null;
          }
          this.pending.delete(baseUrl);
          const cbs = this.pendingCallbacks.get(baseUrl);
          this.pendingCallbacks.delete(baseUrl);
          if (tpl && cbs) {
            for (const cb of cbs) {
              cb();
            }
          }
          return tpl;
        },
      );
      this.pending.set(baseUrl, loadPromise);
    }
    return null;
  }

  static getLodTier(): GlbLodTier {
    return this.lodTier;
  }

  /**
   * Switches the detail tier and frees every template from the previous tier.
   * Callers must dispose all instances first; clones share geometry with their template.
   */
  static setLodTier(tier: GlbLodTier): boolean {
    if (this.lodTier === tier) return false;
    this.lodTier = tier;
    this.evictTemplates();
    return true;
  }

  static evictTemplates(): void {
    this.generation++;
    for (const tpl of new Set(this.cache.values())) {
      tpl.templatePivot.dispose(false, true);
    }
    this.cache.clear();
    this.pending.clear();
    this.pendingCallbacks.clear();
    this.failedUrls.clear();
  }

  private static async loadCandidateChainAsync(
    scene: Scene,
    baseUrl: string,
    _initialCandidates: readonly string[],
    gen: number,
  ): Promise<CachedGlbTemplate | null> {
    await this.ensureCatalogManifestsLoaded();
    if (scene.isDisposed || gen !== this.generation) return null;
    const candidates = glbLodCandidates(baseUrl, this.lodTier, this.lodManifest);
    for (const candidateUrl of candidates) {
      if (scene.isDisposed || gen !== this.generation) return null;
      if (this.failedUrls.has(candidateUrl)) continue;
      const tpl = await this.loadGlbTemplateAsync(scene, baseUrl, candidateUrl, gen);
      if (gen !== this.generation) return null;
      if (tpl) {
        this.cache.set(baseUrl, tpl);
        this.cache.set(candidateUrl, tpl);
        return tpl;
      }
      this.failedUrls.add(candidateUrl);
    }
    return null;
  }

  private static async loadGlbTemplateAsync(
    scene: Scene,
    baseUrl: string,
    modelUrl: string,
    gen: number,
  ): Promise<CachedGlbTemplate | null> {
    try {
      const lastSlash = modelUrl.lastIndexOf('/');
      const rootUrl = modelUrl.slice(0, lastSlash + 1);
      const fileName = modelUrl.slice(lastSlash + 1);
      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene);
      if (scene.isDisposed || gen !== this.generation) {
        result.meshes.forEach((m) => m.dispose());
        return null;
      }

      const templatePivot = new TransformNode(`lw-glb-tpl-${fileName}`, scene);
      const rootMesh = result.meshes[0];
      if (rootMesh) {
        rootMesh.parent = templatePivot;
      }

      for (const m of result.meshes) {
        m.computeWorldMatrix(true);
        if (m.material instanceof PBRMaterial) {
          m.material.maxSimultaneousLights = 8;
          m.material.directIntensity = 1.5;
          m.material.environmentIntensity = 0.72;
        } else if (m.material instanceof StandardMaterial) {
          m.material.maxSimultaneousLights = 8;
        }
      }

      const bounds = templatePivot.getHierarchyBoundingVectors(true);
      const size = bounds.max.subtract(bounds.min);
      const rawWidth = Math.max(0.1, size.x);
      const rawHeight = Math.max(0.1, size.y);
      const rawDepth = Math.max(0.1, size.z);
      const center = bounds.min.add(bounds.max).scale(0.5);

      if (rootMesh) {
        rootMesh.position.set(-center.x, -bounds.min.y, -center.z);
        rootMesh.computeWorldMatrix(true);
      }

      const postBounds = templatePivot.getHierarchyBoundingVectors(true);
      const baseOffsetY = Number.isFinite(postBounds.min.y) ? -postBounds.min.y : 0;

      // Measure vertical silhouette profile across 8 height bands so walls attach flush into doors
      // with flared rocky plinths, recessed jambs, or arched upper frames.
      const bandCount = 8;
      const bandMaxHalfSpan = new Float32Array(bandCount);
      const useZAsLength = rawDepth > rawWidth * 1.35;
      const primaryRawSpan = Math.max(0.1, useZAsLength ? rawDepth : rawWidth);
      const minY = Number.isFinite(postBounds.min.y) ? postBounds.min.y : 0;
      const tmpVec = new Vector3();

      for (const m of result.meshes) {
        if (!(m instanceof Mesh) || m.getTotalVertices() === 0) continue;
        const pos = m.getVerticesData(VertexBuffer.PositionKind);
        if (!pos) continue;
        const wm = m.computeWorldMatrix(true);
        for (let vi = 0; vi < pos.length; vi += 3) {
          Vector3.TransformCoordinatesFromFloatsToRef(pos[vi], pos[vi + 1], pos[vi + 2], wm, tmpVec);
          const ny = Math.max(0, Math.min(0.999, (tmpVec.y - minY) / rawHeight));
          const bIdx = Math.floor(ny * bandCount);
          const halfCoord = Math.abs(useZAsLength ? tmpVec.z : tmpVec.x) / primaryRawSpan;
          if (halfCoord > bandMaxHalfSpan[bIdx]) {
            bandMaxHalfSpan[bIdx] = halfCoord;
          }
        }
      }

      const halfSpanProfile: number[] = [];
      for (let b = 0; b < bandCount; b++) {
        let val = bandMaxHalfSpan[b];
        if (val < 0.05) {
          for (let d = 1; d < bandCount; d++) {
            if (b - d >= 0 && bandMaxHalfSpan[b - d] >= 0.05) {
              val = bandMaxHalfSpan[b - d];
              break;
            }
            if (b + d < bandCount && bandMaxHalfSpan[b + d] >= 0.05) {
              val = bandMaxHalfSpan[b + d];
              break;
            }
          }
        }
        halfSpanProfile.push(Math.max(0.18, Math.min(0.5, val || 0.5)));
      }

      const midHalfSpan = Math.min(
        halfSpanProfile[2],
        halfSpanProfile[3],
        halfSpanProfile[4],
        halfSpanProfile[5],
      );
      const waistWidthRatio = Math.max(0.58, Math.min(1.0, midHalfSpan * 2.0));

      templatePivot.setEnabled(false);

      return {
        url: modelUrl,
        baseUrl,
        templatePivot,
        rawWidth,
        rawHeight,
        rawDepth,
        baseOffsetY,
        waistWidthRatio,
        halfSpanProfile,
      };
    } catch {
      return null;
    }
  }

  static instantiateClone(
    scene: Scene,
    template: CachedGlbTemplate,
    instanceName: string,
    targetWidth: number,
    targetHeight: number,
    targetDepth: number,
    uniformScale: boolean,
    isGhost = false,
    meta?: GlbCloneMetadata,
    paint?: GlbPaintOptions,
  ): TransformNode {
    const wrapper = new TransformNode(instanceName, scene);
    const cloned = template.templatePivot.clone(`${instanceName}-pivot`, wrapper);
    if (cloned) {
      cloned.setEnabled(true);
      if (uniformScale) {
        const maxSpan = Math.max(template.rawWidth, template.rawHeight, template.rawDepth);
        const s = targetHeight / maxSpan;
        cloned.scaling.setAll(s);
        cloned.position.y = template.baseOffsetY * s;
      } else {
        const useZAsLength = template.rawDepth > template.rawWidth * 1.35;
        const sy = targetHeight / template.rawHeight;
        if (useZAsLength) {
          cloned.rotation.y = Math.PI / 2;
          cloned.scaling.set(
            targetDepth / template.rawWidth,
            sy,
            targetWidth / template.rawDepth,
          );
        } else {
          cloned.scaling.set(
            targetWidth / template.rawWidth,
            sy,
            targetDepth / template.rawDepth,
          );
        }
        cloned.position.y = template.baseOffsetY * sy;
      }

      const resolvedMeta: GlbCloneMetadata = meta ?? { lwNodeName: instanceName };
      wrapper.metadata = resolvedMeta;

      const ghostMat = isGhost ? this.getSharedGhostMaterial(scene) : null;
      const paintMat = !isGhost && paint ? this.getOrCreatePaintMaterial(scene, paint) : null;

      const childMeshes: AbstractMesh[] = cloned.getChildMeshes(false);
      for (const m of childMeshes) {
        m.setEnabled(true);
        m.isPickable = !isGhost && m.getTotalVertices() > 0;
        m.receiveShadows = !isGhost;
        m.metadata = resolvedMeta;
        if (ghostMat) {
          m.material = ghostMat;
        } else if (paintMat) {
          m.material = paintMat;
        }
      }
    }
    return wrapper;
  }

  /**
   * Eliminates lighting jumps between tiled 3D wall GLB stamps by flattening the smoothed
   * longitudinal end-cap normal curvature along the wall axis and neutralizing baked vertex AO.
   */
  static normalizeWallTemplateLighting(template: CachedGlbTemplate): void {
    if (template.wallLightingNormalized) return;
    template.wallLightingNormalized = true;

    const useZAsLength = template.rawDepth > template.rawWidth * 1.35;
    const meshes = template.templatePivot.getChildMeshes(false);
    for (const m of meshes) {
      if (m.material instanceof PBRMaterial) {
        m.material.backFaceCulling = false;
        m.material.twoSidedLighting = true;
        m.material.directIntensity = 1.15;
        m.material.environmentIntensity = 0.85;
      } else if (m.material instanceof StandardMaterial) {
        m.material.backFaceCulling = false;
      }
      if (!(m instanceof Mesh) || m.getTotalVertices() === 0) continue;
      if (m.isVerticesDataPresent(VertexBuffer.ColorKind)) {
        m.removeVerticesData(VertexBuffer.ColorKind);
      }
      const norms = m.getVerticesData(VertexBuffer.NormalKind);
      if (!norms || norms.length < 3) continue;
      const updated = new Float32Array(norms.length);
      for (let i = 0; i < norms.length; i += 3) {
        let nx = norms[i];
        let ny = norms[i + 1];
        let nz = norms[i + 2];
        if (useZAsLength) {
          nz *= 0.04;
          if (Math.abs(nx) < 0.15 && Math.abs(ny) < 0.5) {
            nx = nx >= 0 ? 0.92 : -0.92;
          }
        } else {
          nx *= 0.04;
          if (Math.abs(nz) < 0.15 && Math.abs(ny) < 0.5) {
            nz = nz >= 0 ? 0.92 : -0.92;
          }
        }
        const len = Math.hypot(nx, ny, nz) || 1;
        updated[i] = nx / len;
        updated[i + 1] = ny / len;
        updated[i + 2] = nz / len;
      }
      m.setVerticesData(VertexBuffer.NormalKind, updated, false);
    }
  }
}
