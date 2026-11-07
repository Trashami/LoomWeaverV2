import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
} from '@babylonjs/core';
import { MapStampNode } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { resolveTextureLodUrl } from './glb-lod';
import { GlbCloneMetadata, GlbModelCache } from './glb-model-cache';
import { MiniaturePlinthBuilder } from './miniature-plinth.builder';

interface BuiltStampEntry {
  readonly signature: string;
  readonly node: TransformNode | AbstractMesh;
}

/** One shared texture per scene and URL, so stamp rebuilds never re-upload the same image. */
const decalTexturesByScene = new WeakMap<Scene, Map<string, Texture>>();
/** Shared StandardMaterial per scene and decal style so multiple stamps of the same 2D asset share 1 material. */
const decalMaterialsByScene = new WeakMap<Scene, Map<string, StandardMaterial>>();
/** Incrementally reconciled stamp nodes per scene so adding a second stamp never recreates existing stamps. */
const builtStampsByScene = new WeakMap<Scene, Map<string, BuiltStampEntry>>();

function decalTexture(scene: Scene, kind: 'albedo' | 'normal', url: string): Texture {
  let cache = decalTexturesByScene.get(scene);
  if (!cache) {
    cache = new Map<string, Texture>();
    decalTexturesByScene.set(scene, cache);
  }
  const resolvedUrl = resolveTextureLodUrl(url, GlbModelCache.getLodTier());
  const key = `${kind}:${resolvedUrl}`;
  let tex = cache.get(key);
  if (!tex) {
    tex = new Texture(resolvedUrl, scene);
    cache.set(key, tex);
  }
  return tex;
}

function getOrCreateDecalMaterial(
  scene: Scene,
  texUrl: string,
  normalUrl: string | undefined,
  colorHex: string | undefined,
  opacity: number | undefined,
): StandardMaterial {
  let matCache = decalMaterialsByScene.get(scene);
  if (!matCache) {
    matCache = new Map<string, StandardMaterial>();
    decalMaterialsByScene.set(scene, matCache);
  }
  const tier = GlbModelCache.getLodTier();
  const resolvedTex = resolveTextureLodUrl(texUrl, tier);
  const resolvedNorm = normalUrl ? resolveTextureLodUrl(normalUrl, tier) : '';
  const hex = (colorHex || '#ffffff').toLowerCase();
  const alpha = opacity ?? 1.0;
  const key = `${resolvedTex}|${resolvedNorm}|${hex}|${alpha.toFixed(2)}`;
  const existing = matCache.get(key);
  if (existing) {
    return existing;
  }

  const dMat = new StandardMaterial(`lw-stamp-decal-mat-${matCache.size}`, scene);
  dMat.diffuseTexture = decalTexture(scene, 'albedo', resolvedTex);
  dMat.diffuseTexture.hasAlpha = true;
  dMat.useAlphaFromDiffuseTexture = true;
  dMat.diffuseColor = hex !== '#ffffff' ? Color3.FromHexString(hex) : Color3.White();
  dMat.alpha = alpha;
  dMat.specularColor = Color3.FromHexString('#18221c');
  if (resolvedNorm) {
    const bumpTex = decalTexture(scene, 'normal', resolvedNorm);
    bumpTex.level = 1.25;
    dMat.bumpTexture = bumpTex;
  }
  matCache.set(key, dMat);
  return dMat;
}

function createTokenReferenceNode(
  scene: Scene,
  st: MapStampNode,
  cellMeters: number,
  stampMeta: GlbCloneMetadata,
): TransformNode {
  const footprintSq = Math.max(0.5, (st.scaleX ?? 1) * st.scale);
  const diameter = cellMeters * footprintSq * 0.9;
  const ringColorHex = st.colorHex && st.colorHex !== '#ffffff' ? st.colorHex : '#49e892';

  // 1. Authentic tabletop miniature beveled plinth with tactical status collar ring
  const plinth = MiniaturePlinthBuilder.buildPlinth(
    scene,
    {
      id: st.id,
      diameter,
      ringColorHex,
      showStoneInlay: true,
    },
    stampMeta,
  );
  const root = plinth.rootNode;

  // 2. Top circular portrait disc with character art + crisp border
  const topDisc = MeshBuilder.CreateGround(
    `lw-stamp-token-top-${st.id}`,
    { width: diameter * 0.9, height: diameter * 0.9 },
    scene,
  );
  topDisc.position.y = plinth.topSurfaceY + 0.002;
  topDisc.parent = root;
  topDisc.metadata = stampMeta;
  topDisc.isPickable = true;

  // 3. Upright 3D reference standee silhouette so the user can judge vertical scale & perspective in 3D
  const standeeHeight = cellMeters * Math.max(0.8, (st.scaleY ?? 1) * st.scale) * 0.88;
  const standee = MeshBuilder.CreatePlane(
    `lw-stamp-token-standee-${st.id}`,
    { width: diameter * 0.78, height: standeeHeight },
    scene,
  );
  standee.position.y = plinth.topSurfaceY + standeeHeight * 0.5;
  standee.billboardMode = AbstractMesh.BILLBOARDMODE_Y;
  standee.parent = root;
  standee.metadata = stampMeta;
  standee.isPickable = true;

  const dynTex = new DynamicTexture(
    `lw-stamp-token-tex-${st.id}`,
    { width: 256, height: 256 },
    scene,
    true,
  );
  dynTex.hasAlpha = true;

  const drawTokenFace = (img: HTMLImageElement | null) => {
    if (scene.isDisposed) return;
    const ctx = dynTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 256);

    ctx.save();
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const bgGrad = ctx.createRadialGradient(128, 108, 16, 128, 128, 120);
    bgGrad.addColorStop(0, '#1e4635');
    bgGrad.addColorStop(1, '#091912');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 256, 256);

    if (img && img.naturalWidth > 0) {
      ctx.drawImage(img, 8, 8, 240, 240);
    } else {
      ctx.fillStyle = '#e9f6ee';
      ctx.font = '700 68px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const initials = (st.label || 'PC')
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      ctx.fillText(initials || 'PC', 128, 116);
    }

    // Bottom name plate inside disc
    ctx.fillStyle = 'rgba(5, 16, 12, 0.82)';
    ctx.fillRect(0, 192, 256, 64);
    ctx.fillStyle = '#f3faf6';
    ctx.font = '700 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((st.label || 'Token').slice(0, 14), 128, 218);
    ctx.restore();

    // Outer faction border ring
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = ringColorHex;
    ctx.stroke();

    dynTex.update();
  };

  drawTokenFace(null);
  const portraitUrl = st.thumbnailUrl || st.albedoUrl;
  if (portraitUrl && typeof Image !== 'undefined') {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => drawTokenFace(img);
    img.src = portraitUrl;
  }

  const faceMat = new StandardMaterial(`lw-stamp-token-face-mat-${st.id}`, scene);
  faceMat.diffuseTexture = dynTex;
  faceMat.emissiveTexture = dynTex;
  faceMat.useAlphaFromDiffuseTexture = true;
  faceMat.emissiveColor = new Color3(0.75, 0.78, 0.76);
  faceMat.specularColor = Color3.Black();
  faceMat.backFaceCulling = false;

  topDisc.material = faceMat;
  standee.material = faceMat;

  return root;
}

export class StampSceneBuilder {
  /** Clears cached stamp instances for `scene` (e.g., when switching visual quality LOD tier). */
  static evictScene(scene: Scene): void {
    const built = builtStampsByScene.get(scene);
    if (built) {
      for (const entry of built.values()) {
        entry.node.dispose(false, false);
      }
      built.clear();
    }
    const mats = decalMaterialsByScene.get(scene);
    if (mats) {
      for (const m of mats.values()) {
        m.dispose(false, false);
      }
      mats.clear();
    }
  }

  /** Moves an existing placed Token or Object stamp in real time during drag without rebuilding the scene. */
  static moveStamp(scene: Scene, st: MapStampNode, x: number, z: number): void {
    const built = builtStampsByScene.get(scene)?.get(st.id);
    if (!built || built.node.isDisposed()) return;
    const groundY = TerrainMeshBuilder.sampleElevationAt(scene, x, z);
    const offsetY = st.placementMode === 'custom' ? (st.offsetY ?? 0) : 0;
    const isFlatDecal = !st.modelUrl && st.category !== 'Token';
    built.node.position.set(x, groundY + (isFlatDecal ? 0.04 : 0) + offsetY, z);
  }

  /**
   * Incrementally reconciles stamp nodes in `scene`.
   * Existing stamps whose asset/scale/material have not changed are updated in place without re-cloning,
   * and multiple stamps of the same asset share a single loaded template and material in memory.
   */
  static rebuild(
    scene: Scene,
    stamps: readonly MapStampNode[],
    hideGmSecrets: boolean,
    onTemplateLoaded: () => void,
  ): void {
    let builtMap = builtStampsByScene.get(scene);
    if (!builtMap) {
      builtMap = new Map<string, BuiltStampEntry>();
      builtStampsByScene.set(scene, builtMap);
    }

    const activeIds = new Set<string>();
    const cellMeters = TerrainMeshBuilder.getCellStepMeters();
    const tier = GlbModelCache.getLodTier();

    for (const st of stamps) {
      if (hideGmSecrets && (st.gmSecretOnly || st.label.toLowerCase().includes('secret'))) {
        continue;
      }
      activeIds.add(st.id);

      const groundY = TerrainMeshBuilder.sampleElevationAt(scene, st.x, st.z);
      const offsetY = st.placementMode === 'custom' ? (st.offsetY ?? 0) : 0;
      const sx = (st.scaleX ?? 1) * st.scale;
      const sy = (st.scaleY ?? 1) * st.scale;
      const sz = (st.scaleZ ?? 1) * st.scale;
      const tiltRad = ((st.tiltX ?? 0) * Math.PI) / 180;

      const tpl =
        st.modelUrl && st.category !== 'Token'
          ? GlbModelCache.getOrLoadTemplate(scene, st.modelUrl, onTemplateLoaded)
          : null;
      const modeKey =
        st.category === 'Token'
          ? `token:${st.label}:${st.thumbnailUrl || st.albedoUrl || ''}`
          : tpl
            ? `3d:${tpl.url}`
            : `2d:${st.albedoUrl || st.thumbnailUrl || ''}:${st.normalUrl || ''}`;
      const sig = `${modeKey}|${tier}|${cellMeters.toFixed(3)}|${sx.toFixed(3)}|${sy.toFixed(3)}|${sz.toFixed(3)}|${st.colorHex || ''}|${st.surfaceFinish || ''}|${(st.opacity ?? 1).toFixed(2)}`;

      const existing = builtMap.get(st.id);
      if (existing && existing.signature === sig && !existing.node.isDisposed()) {
        const isFlatDecal = !tpl && st.category !== 'Token';
        const targetY = isFlatDecal ? groundY + 0.04 + offsetY : groundY + offsetY;
        const isLifted = Boolean((existing.node.metadata as { isLiftedOrWobbling?: boolean } | null)?.isLiftedOrWobbling);
        if (!isLifted) {
          existing.node.position.set(st.x, targetY, st.z);
          existing.node.rotation.y = st.rotationY;
          if (tpl) {
            existing.node.rotation.x = tiltRad;
          } else {
            existing.node.rotation.x = 0;
            existing.node.rotation.z = 0;
          }
        } else {
          existing.node.position.x = st.x;
          existing.node.position.z = st.z;
          existing.node.rotation.y = st.rotationY;
        }
        continue;
      }

      if (existing) {
        existing.node.dispose(false, false);
        builtMap.delete(st.id);
      }

      const stampMeta: GlbCloneMetadata = {
        lwNodeName: `lw-stamp-${st.id}`,
        lwKind: 'object',
        lwEntityId: st.id,
      };

      // 0. Reference Character / Creature Token (3D Base + 2D Portrait Disc + Vertical Standee)
      if (st.category === 'Token') {
        const tokenNode = createTokenReferenceNode(scene, st, cellMeters, stampMeta);
        tokenNode.position.set(st.x, groundY + offsetY, st.z);
        tokenNode.rotation.y = st.rotationY;
        builtMap.set(st.id, { signature: sig, node: tokenNode });
        continue;
      }

      // 1. Real 3D Asset Model (shared template & GPU geometry across all stamps of this asset)
      if (tpl) {
        const isUniform = Math.abs(sx - sy) < 0.01 && Math.abs(sy - sz) < 0.01;
        const catStr = st.category as string;
        const isCreatureOrToken =
          catStr === 'Creature' ||
          catStr === 'Token' ||
          catStr === 'Character' ||
          catStr === 'Monster' ||
          (st.placementMode as string | undefined) === 'character' ||
          Boolean(st.label && /troll|ogre|goblin|orc|hero|fighter|wizard|rogue|cleric|knight|dragon|skeleton|zombie|creature|monster/i.test(st.label));

        if (isCreatureOrToken) {
          const diameter = cellMeters * Math.max(sx, sz) * 0.95;
          const plinthColor = st.colorHex && st.colorHex !== '#ffffff' ? st.colorHex : '#dc2626';
          const plinth = MiniaturePlinthBuilder.buildPlinth(
            scene,
            {
              id: st.id,
              diameter,
              ringColorHex: plinthColor,
              showStoneInlay: true,
            },
            stampMeta,
          );

          const inst = GlbModelCache.instantiateClone(
            scene,
            tpl,
            `lw-stamp-node-${st.id}`,
            cellMeters * sx,
            cellMeters * sy,
            cellMeters * sz,
            isUniform,
            false,
            stampMeta,
            {
              colorHex: st.colorHex,
              surfaceFinish: st.surfaceFinish,
              opacity: st.opacity,
            },
          );
          inst.parent = plinth.rootNode;
          inst.position.set(0, plinth.topSurfaceY, 0);
          inst.rotation.x = tiltRad;

          plinth.rootNode.position.set(st.x, groundY + offsetY, st.z);
          plinth.rootNode.rotation.y = st.rotationY;
          builtMap.set(st.id, { signature: sig, node: plinth.rootNode });
          continue;
        }

        const inst = GlbModelCache.instantiateClone(
          scene,
          tpl,
          `lw-stamp-node-${st.id}`,
          cellMeters * sx,
          cellMeters * sy,
          cellMeters * sz,
          isUniform,
          false,
          stampMeta,
          {
            colorHex: st.colorHex,
            surfaceFinish: st.surfaceFinish,
            opacity: st.opacity,
          },
        );
        inst.position.set(st.x, groundY + offsetY, st.z);
        inst.rotation.y = st.rotationY;
        inst.rotation.x = tiltRad;
        builtMap.set(st.id, { signature: sig, node: inst });
        continue;
      }

      // 2. 2D Cutout Floor Stamp / Decal (shared texture & material across all stamps of this asset)
      // Do not render 3D model catalog preview thumbnails (/previews-png/) as opaque 2D floor decals while the .glb is loading.
      const texUrl = st.albedoUrl || (!st.modelUrl ? st.thumbnailUrl : undefined);
      if (texUrl) {
        const decal = MeshBuilder.CreateGround(
          `lw-stamp-${st.id}`,
          { width: cellMeters * sx, height: cellMeters * sz },
          scene,
        );
        decal.position.set(st.x, groundY + 0.04 + offsetY, st.z);
        decal.rotation.y = st.rotationY;
        decal.receiveShadows = true;
        decal.metadata = stampMeta;
        decal.material = getOrCreateDecalMaterial(
          scene,
          texUrl,
          st.normalUrl,
          st.colorHex,
          st.opacity,
        );
        builtMap.set(st.id, { signature: sig, node: decal });
      }
    }

    for (const [id, entry] of builtMap.entries()) {
      if (!activeIds.has(id)) {
        entry.node.dispose(false, false);
        builtMap.delete(id);
      }
    }
  }

  static getDecalMaterial(
    scene: Scene,
    texUrl: string,
    normalUrl?: string,
    colorHex?: string,
    opacity?: number,
  ): StandardMaterial {
    return getOrCreateDecalMaterial(scene, texUrl, normalUrl, colorHex, opacity);
  }
}
