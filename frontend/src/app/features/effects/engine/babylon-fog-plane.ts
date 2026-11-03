import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  Mesh,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  VertexData,
} from '@babylonjs/core';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';

/** World extents covered by the fog canvas: x in [-18, 18], z in [-13.5, 13.5]. */
const FOG_HALF_X = 18;
const FOG_HALF_Z = 13.5;
/** Outer pure-black horizon skirt so tilted 3D camera angles never see past map borders. */
const FOG_SKIRT_HALF_X = 64;
const FOG_SKIRT_HALF_Z = 56;
const FOG_HEIGHT_OFFSET = 0.018;
/** Match TerrainMeshBuilder.SUBDIV (64) on the inner map [-18, 18] x [-13.5, 13.5] plus 1 outer ring each side (66 total). */
const FOG_INNER_SUBDIV = 64;
const FOG_TOTAL_SUBDIV = FOG_INNER_SUBDIV + 2;
const FOG_TEXTURE_WIDTH = 1080;
const FOG_TEXTURE_HEIGHT = 810;
const FOG_ALPHA_GRID_W = 180;
const FOG_ALPHA_GRID_H = 135;

/**
 * Volumetric, view-angle-independent 3D Fog of War system.
 * - Inner 64x64 vertex grid matches `lw-terrain-ground` vertex-for-vertex with `renderingGroupId = 0`
 *   and `zOffset = -2` so tilting/rotating the 3D camera never causes parallax drift or reveals hidden slopes.
 * - Samples the fog alpha grid to volumetrically hide 3D objects (stamps, castle walls, portals,
 *   scatter trees, particle systems, and animated point lights) located inside unrevealed fog.
 */
export class BabylonFogPlane {
  private mesh: Mesh | null = null;
  private texture: DynamicTexture | null = null;
  private material: StandardMaterial | null = null;
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;
  private alphaGrid: Uint8Array | null = null;
  private hasActiveFog = false;

  constructor(private readonly scene: Scene) {}

  setLayer(layer: HTMLCanvasElement | null): void {
    if (!layer) {
      this.hasActiveFog = false;
      this.alphaGrid = null;
      this.mesh?.setEnabled(false);
      this.restoreAllSceneObjectsVisible();
      return;
    }
    this.hasActiveFog = true;
    this.ensureMesh();
    this.conformToTerrain();
    const ctx = this.texture?.getContext();
    if (!this.texture || !ctx) return;
    ctx.clearRect(0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
    ctx.drawImage(layer, 0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
    this.texture.update();
    this.mesh?.setEnabled(true);
    this.updateAlphaSampleGrid(layer);
    this.applyVolumetricSceneMasking();
  }

  /** Re-applies volumetric 3D object masking when async 3D GLB stamps/walls/trees finish loading. */
  refreshVolumetricMasking(): void {
    if (!this.hasActiveFog || !this.alphaGrid) return;
    this.conformToTerrain();
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
    if (!this.mesh) return;
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
    const maskedViaNode = new Set<AbstractMesh>();

    for (const node of this.scene.transformNodes) {
      if (!this.isMaskableTransformNode(node.name)) continue;
      const pos = node.getAbsolutePosition();
      const alpha = this.sampleNodeBestVisibilityFogAlpha(pos.x, pos.z, 0.9);
      const visible = alpha < 0.78;
      for (const child of node.getChildMeshes(false)) {
        maskedViaNode.add(child);
        child.isVisible = visible;
      }
    }

    for (const mesh of this.scene.meshes) {
      if (maskedViaNode.has(mesh) || !this.isMaskableStandaloneMesh(mesh.name)) continue;
      const center = mesh.getBoundingInfo().boundingSphere.centerWorld;
      const px = Number.isFinite(center.x) ? center.x : mesh.position.x;
      const pz = Number.isFinite(center.z) ? center.z : mesh.position.z;
      const alpha = this.sampleNodeBestVisibilityFogAlpha(px, pz, 1.1);
      mesh.isVisible = alpha < 0.78;
    }

    for (const ps of this.scene.particleSystems) {
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
      const hidden = this.sampleNodeBestVisibilityFogAlpha(ex, ez, 0.9) >= 0.78;
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
    for (const node of this.scene.transformNodes) {
      if (!this.isMaskableTransformNode(node.name)) continue;
      for (const child of node.getChildMeshes(false)) {
        child.isVisible = true;
      }
    }
    for (const mesh of this.scene.meshes) {
      if (!this.isMaskableStandaloneMesh(mesh.name)) continue;
      mesh.isVisible = true;
    }
    for (const ps of this.scene.particleSystems) {
      const sys = ps as ParticleSystem & { _lwFogPaused?: boolean };
      if (sys._lwFogPaused) {
        ps.start();
        sys._lwFogPaused = false;
      }
    }
  }

  private isMaskableTransformNode(name: string): boolean {
    return /^lw-(stamp-node|wall-node|door-node|scatter-node|portal-node)-/.test(name);
  }

  private isMaskableStandaloneMesh(name: string): boolean {
    return /^lw-(stamp-|wall-|portal-|door-|scatter-|map-wall-|map-door-|map-flame-)/.test(name);
  }

  private coordinateForIndex(idx: number, innerHalf: number, skirtHalf: number): number {
    if (idx <= 0) return -skirtHalf;
    if (idx >= FOG_TOTAL_SUBDIV) return skirtHalf;
    const t = (idx - 1) / FOG_INNER_SUBDIV;
    return -innerHalf + t * (innerHalf * 2);
  }

  private ensureMesh(): void {
    if (this.mesh) return;

    const mesh = new Mesh('lw-fog-plane', this.scene);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iz = 0; iz <= FOG_TOTAL_SUBDIV; iz++) {
      const z = this.coordinateForIndex(iz, FOG_HALF_Z, FOG_SKIRT_HALF_Z);
      const tzUv = (z + FOG_HALF_Z) / (FOG_HALF_Z * 2);
      const v = 1 - tzUv;
      for (let ix = 0; ix <= FOG_TOTAL_SUBDIV; ix++) {
        const x = this.coordinateForIndex(ix, FOG_HALF_X, FOG_SKIRT_HALF_X);
        const u = (x + FOG_HALF_X) / (FOG_HALF_X * 2);
        const clampedX = Math.max(-FOG_HALF_X, Math.min(FOG_HALF_X, x));
        const clampedZ = Math.max(-FOG_HALF_Z, Math.min(FOG_HALF_Z, z));
        const groundY = TerrainMeshBuilder.sampleElevationAt(this.scene, clampedX, clampedZ);
        positions.push(x, groundY + FOG_HEIGHT_OFFSET, z);
        normals.push(0, 1, 0);
        uvs.push(u, v);
      }
    }

    const rowStride = FOG_TOTAL_SUBDIV + 1;
    for (let iz = 0; iz < FOG_TOTAL_SUBDIV; iz++) {
      for (let ix = 0; ix < FOG_TOTAL_SUBDIV; ix++) {
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
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;

    const material = new StandardMaterial('lw-fog-mat', this.scene);
    material.disableLighting = true;
    material.disableDepthWrite = false;
    material.zOffset = -2;
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.diffuseColor = Color3.Black();
    material.emissiveColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;

    mesh.material = material;
    mesh.renderingGroupId = 0;
    mesh.alphaIndex = 10;
    mesh.isPickable = false;

    this.mesh = mesh;
    this.texture = texture;
    this.material = material;
  }
}
