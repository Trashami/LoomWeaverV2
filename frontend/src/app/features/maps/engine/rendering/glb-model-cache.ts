import '@babylonjs/loaders/glTF';
import {
  AbstractMesh,
  Color3,
  MeshoptCompression,
  PBRMaterial,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';

import { GlbLodTier, resolveGlbLodUrl, toBaseGlbUrl } from './glb-lod';

export interface CachedGlbTemplate {
  readonly url: string;
  readonly templatePivot: TransformNode;
  readonly rawWidth: number;
  readonly rawHeight: number;
  readonly rawDepth: number;
  readonly baseOffsetY: number;
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
  private static failedUrls = new Set<string>();
  private static activeScene: Scene | null = null;
  private static sharedGhostMat: StandardMaterial | null = null;
  private static tintedMatCache = new Map<string, StandardMaterial>();
  private static decoderConfigured = false;
  private static lodTier: GlbLodTier = 'mid';

  static ensureScene(scene: Scene): void {
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
    const lodUrl = resolveGlbLodUrl(baseUrl, this.lodTier);
    // Until converted LOD files exist, fall back to the unsuffixed base file.
    const url = this.failedUrls.has(lodUrl) ? baseUrl : lodUrl;
    if (this.failedUrls.has(url)) {
      return null;
    }
    const existing = this.cache.get(url);
    if (existing) {
      return existing;
    }
    if (!this.pending.has(url)) {
      const loadPromise = this.loadGlbTemplateAsync(scene, url).then((tpl) => {
        this.pending.delete(url);
        if (!tpl) {
          this.failedUrls.add(url);
        }
        // A failed LOD variant also triggers a rebuild so the base fallback loads.
        if ((tpl || url !== baseUrl) && onLoaded) {
          onLoaded();
        }
        return tpl;
      });
      this.pending.set(url, loadPromise);
    }
    return null;
  }

  static setLodTier(tier: GlbLodTier): boolean {
    if (this.lodTier === tier) return false;
    this.lodTier = tier;
    return true;
  }

  private static async loadGlbTemplateAsync(
    scene: Scene,
    modelUrl: string,
  ): Promise<CachedGlbTemplate | null> {
    try {
      const lastSlash = modelUrl.lastIndexOf('/');
      const rootUrl = modelUrl.slice(0, lastSlash + 1);
      const fileName = modelUrl.slice(lastSlash + 1);
      const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene);
      if (scene.isDisposed) {
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

      templatePivot.setEnabled(false);

      const entry: CachedGlbTemplate = {
        url: modelUrl,
        templatePivot,
        rawWidth,
        rawHeight,
        rawDepth,
        baseOffsetY,
      };
      this.cache.set(modelUrl, entry);
      return entry;
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
}
