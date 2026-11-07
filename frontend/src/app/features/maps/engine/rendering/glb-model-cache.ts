import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  Color3,
  DracoCompression,
  Mesh,
  MeshoptCompression,
  PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
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
import { WallSurfacePaint } from '../walls/wall-surface-paint';

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
  private static tierScaleManifest = new Map<
    string,
    Partial<
      Record<
        GlbLodTier,
        {
          readonly stampScale: number;
          readonly scaleGrid?: readonly [number, number, number];
          readonly baseScaleGrid?: readonly [number, number, number];
        }
      >
    >
  >();
  private static catalogManifestPromise: Promise<void> | null = null;
  private static catalogIdSet = new Set<string>();
  private static activeLoadCount = 0;
  private static readonly MAX_CONCURRENT_LOADS = 6;
  private static loadQueue: Array<() => void> = [];
  /** Bumped on every eviction so loads started under an old tier are discarded on completion. */
  private static generation = 0;

  private static readonly LEGACY_RENAMED_BASE_MAP: Readonly<Record<string, string>> = {
    'fungal_golem_-_forest_mushroom_beast': 'fungal_golem',
    'Meshy_AI__1026224419_texture': 'dungeon_tile',
    'Meshy_AI__High_Detailed_PBR_3_1023200617_texture': 'hero_ranger_token',
    'Meshy_AI__Halloween2025_ult_1023200746_texture': 'halloween_reaper_monster',
    'Meshy_AI__Halloween2025_a_ul_1023201426_texture': 'tree_golum_monster',
    'Meshy_AI__1026223915_texture': 'fey_dark_pixie',
    'Meshy_AI__Halloween2025_a_st_1023201312_texture': 'skeleton_creepy_monster',
    'Meshy_AI__Halloween2025_ult_1023201912_texture': 'skeleton_alien_monster',
    'Meshy_AI__1028184746_texture': 'colonial_home',
    'Meshy_AI_01cleanstone_25ptc_lo_1028134541_texture': 'curved_stone_wall',
    'Meshy_AI_01cleanstone_25ptc_lo_1028185647_texture': 'curved_stone_wall_2',
    'Meshy_AI_02mossystone_25ptc_lo_1028185649_texture': 'curved_grime_stone_wall',
    'Meshy_AI_10_Floor_Tile_Wizar_1028124340_texture': 'floor_tile_clean_design',
    'Meshy_AI__Halloween2025_full_1023202215_texture': 'forest_flooring_fern_1',
    'Meshy_AI_A_majestic_forest_fer_1022200323_texture': 'forest_floor_fern_2',
    'Meshy_AI_A_majestic_forest_fer_1023133940_texture': 'forest_floor_fern_3',
    'Meshy_AI_A_hosta_plant_feature_1023091736_texture': 'forest_floor_plant_1',
  };

  private static acquireLoadSlot(): Promise<void> {
    if (this.activeLoadCount < this.MAX_CONCURRENT_LOADS) {
      this.activeLoadCount++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.loadQueue.push(() => {
        this.activeLoadCount++;
        resolve();
      });
    });
  }

  private static releaseLoadSlot(): void {
    this.activeLoadCount = Math.max(0, this.activeLoadCount - 1);
    const next = this.loadQueue.shift();
    if (next) {
      next();
    }
  }

  static hasFailed(modelUrl: string): boolean {
    if (!modelUrl || !modelUrl.toLowerCase().endsWith('.glb')) return true;
    const baseUrl = toBaseGlbUrl(modelUrl);
    if (this.failedUrls.has(baseUrl)) return true;
    const candidates = glbLodCandidates(baseUrl, this.lodTier, this.lodManifest);
    return candidates.length > 0 && candidates.every((c) => this.failedUrls.has(c));
  }

  /**
   * Ensures `/asset-properties-catalog.json` is loaded even when `/arcane-screen` is opened
   * directly without visiting `/maps` first. Uses the compact gzipped properties catalog (~55 KB)
   * rather than the multi-megabyte full manifest so GLB loading is never bottlenecked.
   */
  private static ensureCatalogManifestsLoaded(): Promise<void> {
    if (this.catalogManifestPromise) return this.catalogManifestPromise;
    if (typeof window === 'undefined' || typeof fetch === 'undefined') {
      this.catalogManifestPromise = Promise.resolve();
      return this.catalogManifestPromise;
    }
    this.catalogManifestPromise = fetch('/asset-properties-catalog.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          doc: {
            assets?: Array<{
              id?: string;
              sourceFile?: string;
              defaultScaleGrid?: readonly [number, number, number];
              lodVariants?: Partial<
                Record<
                  GlbLodTier,
                  {
                    stampScale?: number;
                    defaultScaleGrid?: readonly [number, number, number];
                  }
                >
              >;
            }>;
          } | null,
        ) => {
          for (const a of doc?.assets ?? []) {
            if (a.id) {
              this.catalogIdSet.add(a.id);
            }
            if (a.id && a.sourceFile) {
              this.registerSourceFileLodMapping(a.id, a.sourceFile);
              if (a.lodVariants) {
                this.registerAssetLodVariants(a.id, a.sourceFile, a.defaultScaleGrid, a.lodVariants);
              }
            }
          }
          this.failedUrls.clear();
        },
      )
      .catch(() => undefined);
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
    const rawBaseName = toBaseGlbUrl(sourceFile).replace(/\.glb$/i, '');
    const canonicalBaseName = this.LEGACY_RENAMED_BASE_MAP[rawBaseName] ?? rawBaseName;
    const objBase = `/assets/object-library/models/${id}.glb`;
    const srcBase = `/assets/models-3d/${canonicalBaseName}.glb`;
    const variants = {
      low: resolveGlbLodUrl(srcBase, 'low'),
      mid: resolveGlbLodUrl(srcBase, 'mid'),
      high: resolveGlbLodUrl(srcBase, 'high'),
    };
    this.lodManifest.set(objBase, variants);
    this.lodManifest.set(srcBase, variants);
    if (rawBaseName !== canonicalBaseName) {
      this.lodManifest.set(`/assets/models-3d/${rawBaseName}.glb`, variants);
    }
  }

  static registerAssetLodVariants(
    id: string,
    sourceFile: string | undefined,
    baseScaleGrid: readonly [number, number, number] | undefined,
    lodVariants?: Readonly<
      Partial<
        Record<
          GlbLodTier,
          {
            readonly stampScale?: number;
            readonly defaultScaleGrid?: readonly [number, number, number];
          }
        >
      >
    >,
  ): void {
    if (!lodVariants) return;
    for (const tier of ['low', 'mid', 'high'] as const) {
      const v = lodVariants[tier];
      if (!v) continue;
      this.registerSingleTierScale(
        id,
        sourceFile,
        tier,
        v.stampScale ?? 1.0,
        v.defaultScaleGrid,
        baseScaleGrid,
      );
    }
  }

  static registerSingleTierScale(
    id: string | undefined,
    sourceFile: string | undefined,
    tier: GlbLodTier,
    stampScale: number,
    scaleGrid?: readonly [number, number, number],
    baseScaleGrid?: readonly [number, number, number],
  ): void {
    const keys: string[] = [];
    if (id) {
      keys.push(`/assets/object-library/models/${id}.glb`);
    }
    if (sourceFile) {
      const clean = toBaseGlbUrl(sourceFile.split('/').pop() || sourceFile);
      keys.push(`/assets/models-3d/${clean}`);
    }
    for (const k of keys) {
      const prev = this.tierScaleManifest.get(k) ?? {};
      const prevTier = prev[tier];
      this.tierScaleManifest.set(k, {
        ...prev,
        [tier]: {
          stampScale: Number.isFinite(stampScale) && stampScale > 0 ? stampScale : (prevTier?.stampScale ?? 1.0),
          scaleGrid: scaleGrid ?? prevTier?.scaleGrid,
          baseScaleGrid: baseScaleGrid ?? prevTier?.baseScaleGrid,
        },
      });
    }
  }

  /**
   * Returns the per-tier (`low` = Performance, `mid` = Balanced, `high` = Visual) scale multipliers
   * configured in `mat-vis-assets.json` / `asset-properties-catalog.json` for `modelUrl`.
   */
  static getTierScaleFactors(
    modelUrl: string | undefined,
    tier: GlbLodTier = this.lodTier,
  ): { readonly sx: number; readonly sy: number; readonly sz: number; readonly uniform: number } {
    if (!modelUrl) {
      return { sx: 1, sy: 1, sz: 1, uniform: 1 };
    }
    const baseUrl = toBaseGlbUrl(modelUrl);
    const entry = this.tierScaleManifest.get(baseUrl)?.[tier];
    if (!entry) {
      return { sx: 1, sy: 1, sz: 1, uniform: 1 };
    }
    const u = Number.isFinite(entry.stampScale) && entry.stampScale > 0 ? entry.stampScale : 1.0;
    const sg = entry.scaleGrid;
    const bg = entry.baseScaleGrid;
    if (sg && sg.length === 3 && bg && bg.length === 3) {
      const rx = bg[0] > 0 ? sg[0] / bg[0] : 1;
      const ry = bg[1] > 0 ? sg[1] / bg[1] : 1;
      const rz = bg[2] > 0 ? sg[2] / bg[2] : 1;
      return {
        sx: u * rx,
        sy: u * ry,
        sz: u * rz,
        uniform: u * Math.cbrt(rx * ry * rz),
      };
    }
    return { sx: u, sy: u, sz: u, uniform: u };
  }

  static ensureScene(scene: Scene): void {
    void this.ensureCatalogManifestsLoaded();
    if (!this.decoderConfigured) {
      try {
        DracoCompression.DefaultNumWorkers = 4;
      } catch {
        // Ignore if DracoCompression worker pool is already initialized
      }
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
    mat.maxSimultaneousLights = 6;
    WallSurfacePaint.registerMaterial(scene, mat);
    this.tintedMatCache.set(key, mat);
    return mat;
  }

  /**
   * Returns the single cached template for `modelUrl` at the requested (or current) quality LOD tier,
   * or initiates a single deduplicated async load shared across all stamps of this asset.
   * Passing `tierOverride = 'low'` (used by Scatter) loads the lightweight `_low.glb` variant
   * (~10x smaller than `_high.glb`) so scattered clusters stream in near-instantly.
   */
  static getOrLoadTemplate(
    scene: Scene,
    modelUrl: string,
    onLoaded?: () => void,
    tierOverride?: GlbLodTier,
  ): CachedGlbTemplate | null {
    this.ensureScene(scene);
    if (!modelUrl || !modelUrl.toLowerCase().endsWith('.glb')) {
      return null;
    }
    const effectiveTier = tierOverride ?? this.lodTier;
    const baseUrl = toBaseGlbUrl(modelUrl);
    const cacheKey = tierOverride ? `${effectiveTier}:${baseUrl}` : baseUrl;
    const cached =
      this.cache.get(cacheKey) ??
      (!tierOverride ? this.cache.get(modelUrl) : undefined);
    if (cached) {
      return cached;
    }

    const candidates = glbLodCandidates(baseUrl, effectiveTier, this.lodManifest).filter(
      (c) => !this.failedUrls.has(c),
    );
    if (candidates.length === 0 && this.catalogManifestPromise !== null) {
      return null;
    }

    for (const c of candidates) {
      const hit = this.cache.get(c);
      if (hit) {
        this.cache.set(cacheKey, hit);
        return hit;
      }
    }

    if (onLoaded) {
      let cbs = this.pendingCallbacks.get(cacheKey);
      if (!cbs) {
        cbs = new Set<() => void>();
        this.pendingCallbacks.set(cacheKey, cbs);
      }
      cbs.add(onLoaded);
    }

    if (!this.pending.has(cacheKey)) {
      const gen = this.generation;
      const loadPromise = this.loadCandidateChainAsync(
        scene,
        baseUrl,
        cacheKey,
        effectiveTier,
        gen,
      ).then((tpl) => {
        if (gen !== this.generation) {
          return null;
        }
        this.pending.delete(cacheKey);
        const cbs = this.pendingCallbacks.get(cacheKey);
        this.pendingCallbacks.delete(cacheKey);
        if (tpl && cbs) {
          for (const cb of cbs) {
            cb();
          }
        }
        return tpl;
      });
      this.pending.set(cacheKey, loadPromise);
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
    cacheKey: string,
    effectiveTier: GlbLodTier,
    gen: number,
  ): Promise<CachedGlbTemplate | null> {
    const objMatch = baseUrl.match(/\/object-library\/models\/(obj-[a-f0-9]+)\.glb$/i);
    // Only wait for catalog manifest if this is an unresolved legacy `obj-<hash>.glb` URL
    if (objMatch && !this.lodManifest.has(baseUrl)) {
      await this.ensureCatalogManifestsLoaded();
      if (scene.isDisposed || gen !== this.generation) return null;
    }

    // Fast-fail legacy/deleted object-library hashes that are not in the catalog or manifest
    if (
      objMatch &&
      this.catalogIdSet.size > 0 &&
      !this.catalogIdSet.has(objMatch[1]) &&
      !this.lodManifest.has(baseUrl)
    ) {
      this.failedUrls.add(baseUrl);
      for (const c of glbLodCandidates(baseUrl, effectiveTier, this.lodManifest)) {
        this.failedUrls.add(c);
      }
      return null;
    }

    const candidates = glbLodCandidates(baseUrl, effectiveTier, this.lodManifest);
    for (const candidateUrl of candidates) {
      if (scene.isDisposed || gen !== this.generation) return null;
      if (this.failedUrls.has(candidateUrl)) continue;
      const alreadyCached = this.cache.get(candidateUrl);
      if (alreadyCached) {
        this.cache.set(cacheKey, alreadyCached);
        return alreadyCached;
      }
      await this.acquireLoadSlot();
      let tpl: CachedGlbTemplate | null = null;
      try {
        if (!scene.isDisposed && gen === this.generation) {
          tpl = await this.loadGlbTemplateAsync(scene, baseUrl, candidateUrl, gen);
        }
      } finally {
        this.releaseLoadSlot();
      }
      if (gen !== this.generation) return null;
      if (tpl) {
        this.cache.set(cacheKey, tpl);
        this.cache.set(candidateUrl, tpl);
        if (effectiveTier === this.lodTier) {
          this.cache.set(baseUrl, tpl);
        }
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
          m.material.maxSimultaneousLights = 6;
          m.material.directIntensity = 1.5;
          m.material.environmentIntensity = 0.72;
        } else if (m.material instanceof StandardMaterial) {
          m.material.maxSimultaneousLights = 6;
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

      // Lightweight default profile without reading/allocating CPU vertex arrays on 200k+ vertex GLBs
      const halfSpanProfile: readonly number[] = [0.46, 0.46, 0.45, 0.45, 0.45, 0.45, 0.45, 0.44];
      const waistWidthRatio = 0.9;

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
      const tierScale = this.getTierScaleFactors(template.baseUrl, this.lodTier);
      const effWidth = targetWidth * tierScale.sx;
      const effHeight = targetHeight * (uniformScale ? tierScale.uniform : tierScale.sy);
      const effDepth = targetDepth * tierScale.sz;
      if (uniformScale) {
        const maxSpan = Math.max(template.rawWidth, template.rawHeight, template.rawDepth);
        const s = effHeight / maxSpan;
        cloned.scaling.setAll(s);
        cloned.position.y = template.baseOffsetY * s;
      } else {
        const useZAsLength = template.rawDepth > template.rawWidth * 1.35;
        const sy = effHeight / template.rawHeight;
        if (useZAsLength) {
          cloned.rotation.y = Math.PI / 2;
          cloned.scaling.set(
            effDepth / template.rawWidth,
            sy,
            effWidth / template.rawDepth,
          );
        } else {
          cloned.scaling.set(
            effWidth / template.rawWidth,
            sy,
            effDepth / template.rawDepth,
          );
        }
        cloned.position.y = template.baseOffsetY * sy;
      }

      const resolvedMeta: GlbCloneMetadata = meta ?? { lwNodeName: instanceName };
      wrapper.metadata = resolvedMeta;

      const paintMat = paint ? this.getOrCreatePaintMaterial(scene, paint) : null;

      const childMeshes: AbstractMesh[] = cloned.getChildMeshes(false);
      for (const m of childMeshes) {
        m.setEnabled(true);
        m.isPickable = !isGhost && m.getTotalVertices() > 0;
        m.receiveShadows = !isGhost;
        m.metadata = resolvedMeta;
        if (paintMat) {
          m.material = paintMat;
        }
        if (isGhost) {
          m.visibility = 0.68;
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
        WallSurfacePaint.registerMaterial(m.getScene(), m.material);
      } else if (m.material instanceof StandardMaterial) {
        m.material.backFaceCulling = false;
        WallSurfacePaint.registerMaterial(m.getScene(), m.material);
      }
      if (!(m instanceof Mesh) || m.getTotalVertices() === 0) continue;
      if (m.isVerticesDataPresent(VertexBuffer.ColorKind)) {
        m.removeVerticesData(VertexBuffer.ColorKind);
      }
      // Skip CPU normal buffer clone on high-poly photogrammetry wall scans (>25k vertices) to avoid OOM
      if (m.getTotalVertices() > 25000) continue;
      const norms = m.getVerticesData(VertexBuffer.NormalKind);
      if (!norms || norms.length < 3) continue;
      const updated = new Float32Array(norms.length);
      for (let i = 0; i < norms.length; i += 3) {
        let nx = norms[i];
        let ny = norms[i + 1];
        let nz = norms[i + 2];
        // Only flatten end-cap longitudinal curvature on vertical side faces (|ny| < 0.65).
        // Preserve upward/downward normals on the top coping and base so wall tops never turn dark.
        if (Math.abs(ny) < 0.65) {
          if (useZAsLength) {
            nz *= 0.04;
            if (Math.abs(nx) < 0.15) {
              nx = nx >= 0 ? 0.92 : -0.92;
            }
          } else {
            nx *= 0.04;
            if (Math.abs(nz) < 0.15) {
              nz = nz >= 0 ? 0.92 : -0.92;
            }
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
