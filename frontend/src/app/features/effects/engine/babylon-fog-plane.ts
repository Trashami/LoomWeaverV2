import {
  Color3,
  DynamicTexture,
  Mesh,
  ParticleSystem,
  PointLight,
  Scene,
  StandardMaterial,
  Texture,
  VertexData,
} from '@babylonjs/core';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';
import { syncSceneVolumetricFogMaterials } from './babylon-volumetric-fog.plugin';

/** World extents covered by the fog canvas: x in [-37.5, 37.5], z in [-37.5, 37.5] (75m x 75m). */
const FOG_HALF_X = 37.5;
const FOG_HALF_Z = 37.5;
const FOG_HEIGHT_OFFSET = 0.055;
const FOG_SUBDIV = 48;
const FOG_TEXTURE_WIDTH = 512;
const FOG_TEXTURE_HEIGHT = 512;
const FOG_ALPHA_GRID_W = 150;
const FOG_ALPHA_GRID_H = 150;

/**
 * Volumetric, view-angle-independent 3D Fog of War system.
 * - Injects `VolumetricFogMaterialPlugin` into all scene materials (`StandardMaterial`,
 *   `PBRMaterial`, and `WaterSurfaceMaterial`) so terrain, water, grid lines, castle walls,
 *   glowing mushrooms, trees, portals, and tokens are fogged per-pixel in world `(x, z)` space.
 * - Eliminates camera-angle parallax, prevents unrevealed foreground hills from blocking
 *   tilted 3D camera views, and ensures no 3D asset or token ever sticks out above the fog.
 * - Pauses particle systems and disables point lights located inside unrevealed fog.
 */
export class BabylonFogPlane {
  private mesh: Mesh | null = null;
  private texture: DynamicTexture | null = null;
  private material: StandardMaterial | null = null;
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;
  private alphaGrid: Uint8Array | null = null;
  private hasActiveFog = false;
  private lastLayerRevision = -1;
  private lastElevationVersion = -1;

  constructor(private readonly scene: Scene) {}

  setLayer(layer: HTMLCanvasElement | null): void {
    if (!layer) {
      this.hasActiveFog = false;
      this.alphaGrid = null;
      this.lastLayerRevision = -1;
      this.mesh?.setEnabled(false);
      syncSceneVolumetricFogMaterials(this.scene, this.texture, false);
      this.restoreAllSceneObjectsVisible();
      return;
    }

    this.hasActiveFog = true;
    this.ensureMesh();

    const layerRev = (layer as HTMLCanvasElement & { _lwFogRev?: number })._lwFogRev ?? -1;
    const revisionChanged = layerRev < 0 || layerRev !== this.lastLayerRevision;
    if (revisionChanged) {
      this.lastLayerRevision = layerRev;
      const ctx = this.texture?.getContext();
      if (this.texture && ctx) {
        ctx.clearRect(0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
        ctx.drawImage(layer, 0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
        this.texture.update();
      }
      this.updateAlphaSampleGrid(layer);
    }

    const has3dTerrain = Boolean(this.scene.getMeshByName('lw-terrain-ground'));
    this.mesh?.setEnabled(!has3dTerrain);
    if (!has3dTerrain) {
      this.conformToTerrainIfNeeded();
    }

    syncSceneVolumetricFogMaterials(this.scene, this.texture, true);
    if (revisionChanged) {
      this.applyVolumetricSceneMasking();
    }
  }

  /** Re-applies volumetric 3D material plugins and particle/light masking when async GLB models finish loading. */
  refreshVolumetricMasking(): void {
    syncSceneVolumetricFogMaterials(this.scene, this.texture, this.hasActiveFog);
    if (!this.hasActiveFog || !this.alphaGrid) return;
    const has3dTerrain = Boolean(this.scene.getMeshByName('lw-terrain-ground'));
    this.mesh?.setEnabled(!has3dTerrain);
    this.applyVolumetricSceneMasking();
  }

  sampleFogAlphaAtWorld(worldX: number, worldZ: number): number {
    if (!this.hasActiveFog || !this.alphaGrid) return 0;
    if (
      worldX < -FOG_HALF_X ||
      worldX > FOG_HALF_X ||
      worldZ < -FOG_HALF_Z ||
      worldZ > FOG_HALF_Z
    ) {
      return 1;
    }
    const u = Math.max(0, Math.min(0.9999, (worldX + FOG_HALF_X) / (FOG_HALF_X * 2)));
    const v = Math.max(0, Math.min(0.9999, (worldZ + FOG_HALF_Z) / (FOG_HALF_Z * 2)));
    const gx = Math.floor(u * FOG_ALPHA_GRID_W);
    const gz = Math.floor(v * FOG_ALPHA_GRID_H);
    return (this.alphaGrid[gz * FOG_ALPHA_GRID_W + gx] ?? 255) / 255;
  }

  conformToTerrain(): void {
    this.lastElevationVersion = -1;
    this.conformToTerrainIfNeeded();
  }

  private conformToTerrainIfNeeded(): void {
    if (!this.mesh) return;
    const currentElevVer = TerrainMeshBuilder.getElevationVersion();
    if (currentElevVer === this.lastElevationVersion) return;
    this.lastElevationVersion = currentElevVer;

    const positions = this.mesh.getVerticesData('position');
    if (!positions) return;
    for (let i = 0; i < positions.length; i += 3) {
      const vx = Math.max(-FOG_HALF_X, Math.min(FOG_HALF_X, positions[i]));
      const vz = Math.max(-FOG_HALF_Z, Math.min(FOG_HALF_Z, positions[i + 2]));
      const groundY = TerrainMeshBuilder.sampleElevationAt(this.scene, vx, vz);
      positions[i + 1] = groundY + FOG_HEIGHT_OFFSET;
    }
    this.mesh.updateVerticesData('position', positions);
    this.mesh.refreshBoundingInfo();
  }

  dispose(): void {
    syncSceneVolumetricFogMaterials(this.scene, null, false);
    this.restoreAllSceneObjectsVisible();
    this.mesh?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.mesh = null;
    this.material = null;
    this.texture = null;
    this.alphaGrid = null;
    this.hasActiveFog = false;
  }

  private updateAlphaSampleGrid(layer: HTMLCanvasElement): void {
    if (typeof document === 'undefined') return;
    if (!this.sampleCanvas) {
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCanvas.width = FOG_ALPHA_GRID_W;
      this.sampleCanvas.height = FOG_ALPHA_GRID_H;
      this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.sampleCtx) return;
    this.sampleCtx.clearRect(0, 0, FOG_ALPHA_GRID_W, FOG_ALPHA_GRID_H);
    this.sampleCtx.drawImage(layer, 0, 0, FOG_ALPHA_GRID_W, FOG_ALPHA_GRID_H);
    const imgData = this.sampleCtx.getImageData(0, 0, FOG_ALPHA_GRID_W, FOG_ALPHA_GRID_H).data;
    if (!this.alphaGrid || this.alphaGrid.length !== FOG_ALPHA_GRID_W * FOG_ALPHA_GRID_H) {
      this.alphaGrid = new Uint8Array(FOG_ALPHA_GRID_W * FOG_ALPHA_GRID_H);
    }
    for (let i = 0, p = 3; i < this.alphaGrid.length; i++, p += 4) {
      this.alphaGrid[i] = imgData[p];
    }
  }

  private applyVolumetricSceneMasking(): void {
    if (!this.alphaGrid) return;

    for (const ps of this.scene.particleSystems) {
      if (ps.name.startsWith('eb-')) continue;
      const emitter = ps.emitter;
      if (!emitter) continue;
      let ex = 0;
      let ez = 0;
      if ('getAbsolutePosition' in emitter && typeof emitter.getAbsolutePosition === 'function') {
        const p = emitter.getAbsolutePosition();
        ex = p.x;
        ez = p.z;
      } else if ('x' in emitter && 'z' in emitter) {
        ex = emitter.x;
        ez = emitter.z;
      }
      const hidden = this.sampleNodeBestVisibilityFogAlpha(ex, ez, 0.75) >= 0.72;
      const sys = ps as ParticleSystem & { _lwFogPaused?: boolean };
      if (hidden && ps.isStarted()) {
        ps.stop();
        ps.reset();
        sys._lwFogPaused = true;
      } else if (!hidden && sys._lwFogPaused) {
        ps.start();
        sys._lwFogPaused = false;
      }
    }

    for (const light of this.scene.lights) {
      if (!(light instanceof PointLight)) continue;
      if (light.name === 'lw-vtt-pt') continue;
      const pos = light.getAbsolutePosition();
      const hidden = this.sampleNodeBestVisibilityFogAlpha(pos.x, pos.z, 0.75) >= 0.72;
      const anyLight = light as PointLight & { _lwFogDisabled?: boolean };
      if (hidden && light.isEnabled()) {
        light.setEnabled(false);
        anyLight._lwFogDisabled = true;
      } else if (!hidden && anyLight._lwFogDisabled) {
        light.setEnabled(true);
        anyLight._lwFogDisabled = false;
      }
    }
  }

  private sampleNodeBestVisibilityFogAlpha(x: number, z: number, radius: number): number {
    const c = this.sampleFogAlphaAtWorld(x, z);
    if (c < 0.5) return c;
    const r = Math.max(0.4, radius);
    return Math.min(
      c,
      this.sampleFogAlphaAtWorld(x - r, z),
      this.sampleFogAlphaAtWorld(x + r, z),
      this.sampleFogAlphaAtWorld(x, z - r),
      this.sampleFogAlphaAtWorld(x, z + r),
    );
  }

  private restoreAllSceneObjectsVisible(): void {
    for (const ps of this.scene.particleSystems) {
      const sys = ps as ParticleSystem & { _lwFogPaused?: boolean };
      if (sys._lwFogPaused) {
        ps.start();
        sys._lwFogPaused = false;
      }
    }
    for (const light of this.scene.lights) {
      const anyLight = light as PointLight & { _lwFogDisabled?: boolean };
      if (anyLight._lwFogDisabled) {
        light.setEnabled(true);
        anyLight._lwFogDisabled = false;
      }
    }
  }

  private ensureMesh(): void {
    if (this.mesh) return;

    const mesh = new Mesh('lw-fog-plane', this.scene);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iz = 0; iz <= FOG_SUBDIV; iz++) {
      const tz = iz / FOG_SUBDIV;
      const z = -FOG_HALF_Z + tz * (FOG_HALF_Z * 2);
      const v = 1 - tz;
      for (let ix = 0; ix <= FOG_SUBDIV; ix++) {
        const tx = ix / FOG_SUBDIV;
        const x = -FOG_HALF_X + tx * (FOG_HALF_X * 2);
        const u = tx;
        const groundY = TerrainMeshBuilder.sampleElevationAt(this.scene, x, z);
        positions.push(x, groundY + FOG_HEIGHT_OFFSET, z);
        normals.push(0, 1, 0);
        uvs.push(u, v);
      }
    }

    const rowStride = FOG_SUBDIV + 1;
    for (let iz = 0; iz < FOG_SUBDIV; iz++) {
      for (let ix = 0; ix < FOG_SUBDIV; ix++) {
        const i0 = iz * rowStride + ix;
        const i1 = i0 + 1;
        const i2 = (iz + 1) * rowStride + ix;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh, true);

    const texture = new DynamicTexture(
      'lw-fog-tex',
      { width: FOG_TEXTURE_WIDTH, height: FOG_TEXTURE_HEIGHT },
      this.scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    const initCtx = texture.getContext() as unknown as CanvasRenderingContext2D;
    initCtx.clearRect(0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
    texture.update(false);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;

    const mat = new StandardMaterial('lw-fog-mat', this.scene);
    mat.disableLighting = true;
    const fogColor = Color3.Black();
    mat.diffuseColor = fogColor;
    mat.emissiveColor = fogColor;
    mat.specularColor = Color3.Black();
    mat.opacityTexture = texture;
    mat.backFaceCulling = false;
    mat.zOffset = -2;

    mesh.material = mat;
    mesh.renderingGroupId = 0;
    mesh.alphaIndex = 10000;
    mesh.isPickable = false;

    this.mesh = mesh;
    this.texture = texture;
    this.material = mat;
  }
}
