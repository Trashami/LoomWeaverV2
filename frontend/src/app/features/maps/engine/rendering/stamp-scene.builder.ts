import {
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
} from '@babylonjs/core';
import { MapStampNode } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { GlbCloneMetadata, GlbModelCache } from './glb-model-cache';

/** One shared texture per scene and URL, so stamp rebuilds never re-upload the same image. */
const decalTexturesByScene = new WeakMap<Scene, Map<string, Texture>>();

function decalTexture(scene: Scene, kind: 'albedo' | 'normal', url: string): Texture {
  let cache = decalTexturesByScene.get(scene);
  if (!cache) {
    cache = new Map<string, Texture>();
    decalTexturesByScene.set(scene, cache);
  }
  const key = `${kind}:${url}`;
  let tex = cache.get(key);
  if (!tex) {
    tex = new Texture(url, scene);
    cache.set(key, tex);
  }
  return tex;
}

export class StampSceneBuilder {
  /** Rebuilds every stamp node. Template loads call `onTemplateLoaded` once so the caller can resync. */
  static rebuild(
    scene: Scene,
    stamps: readonly MapStampNode[],
    hideGmSecrets: boolean,
    onTemplateLoaded: () => void,
  ): void {
    scene.transformNodes
      .filter((n) => n.name.startsWith('lw-stamp-node-'))
      .forEach((n) => n.dispose(false, false));
    scene.meshes
      .filter((m) => m.name.startsWith('lw-stamp-'))
      .forEach((m) => m.dispose(false, false));
    // Decal materials are recreated per rebuild; their textures stay in decalTexture's cache.
    scene.materials
      .filter((mat) => mat.name.startsWith('lw-stamp-decal-mat-'))
      .forEach((mat) => mat.dispose(false, false));

    const cellMeters = TerrainMeshBuilder.getCellStepMeters(); // 1.5m = 1x1x1 grid square

    for (const st of stamps) {
      if (hideGmSecrets && (st.gmSecretOnly || st.label.toLowerCase().includes('secret'))) {
        continue;
      }
      const groundY = TerrainMeshBuilder.sampleElevationAt(scene, st.x, st.z);
      const offsetY = st.placementMode === 'custom' ? (st.offsetY ?? 0) : 0;
      const stampMeta: GlbCloneMetadata = {
        lwNodeName: `lw-stamp-${st.id}`,
        lwKind: 'object',
        lwEntityId: st.id,
      };
      const sx = (st.scaleX ?? 1) * st.scale;
      const sy = (st.scaleY ?? 1) * st.scale;
      const sz = (st.scaleZ ?? 1) * st.scale;

      // 1. Real 3D Asset Model (1x1x1 = 1.5m x 1.5m x 1.5m, flush on floor by default)
      if (st.modelUrl) {
        const tpl = GlbModelCache.getOrLoadTemplate(scene, st.modelUrl, onTemplateLoaded);
        if (tpl) {
          const isUniform = Math.abs(sx - sy) < 0.01 && Math.abs(sy - sz) < 0.01;
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
          inst.rotation.x = ((st.tiltX ?? 0) * Math.PI) / 180;
          continue;
        }
      }

      // 2. 2D Cutout Floor Stamp / Decal
      const texUrl = st.albedoUrl || st.thumbnailUrl;
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

        const dMat = new StandardMaterial(`lw-stamp-decal-mat-${st.id}`, scene);
        dMat.diffuseTexture = decalTexture(scene, 'albedo', texUrl);
        dMat.diffuseTexture.hasAlpha = true;
        dMat.useAlphaFromDiffuseTexture = true;
        dMat.diffuseColor =
          st.colorHex && st.colorHex.toLowerCase() !== '#ffffff'
            ? Color3.FromHexString(st.colorHex)
            : Color3.White();
        dMat.alpha = st.opacity ?? 1.0;
        dMat.specularColor = Color3.FromHexString('#18221c');
        if (st.normalUrl) {
          const bumpTex = decalTexture(scene, 'normal', st.normalUrl);
          bumpTex.level = 1.25;
          dMat.bumpTexture = bumpTex;
        }
        decal.material = dMat;
      }
    }
  }
}
