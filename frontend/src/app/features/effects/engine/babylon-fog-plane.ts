import { Color3, DynamicTexture, Mesh, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';

/** World extents covered by the fog canvas: x in [-18, 18], z in [-13.5, 13.5]. */
const FOG_HALF_X = 18;
const FOG_HALF_Z = 13.5;
const FOG_HEIGHT_OFFSET = 0.16;
const FOG_SUBDIV_X = 48;
const FOG_SUBDIV_Z = 36;
const FOG_TEXTURE_WIDTH = 1080;
const FOG_TEXTURE_HEIGHT = 810;

/**
 * Terrain-conforming fog plane textured with the MythWeaver-style fog canvas.
 * The canvas alpha drives transparency, so cleared areas reveal the 3D/2D map beneath.
 */
export class BabylonFogPlane {
  private mesh: Mesh | null = null;
  private texture: DynamicTexture | null = null;
  private material: StandardMaterial | null = null;

  constructor(private readonly scene: Scene) {}

  setLayer(layer: HTMLCanvasElement | null): void {
    if (!layer) {
      this.mesh?.setEnabled(false);
      return;
    }
    this.ensureMesh();
    this.conformToTerrain();
    const ctx = this.texture?.getContext();
    if (!this.texture || !ctx) return;
    ctx.clearRect(0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
    ctx.drawImage(layer, 0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
    this.texture.update();
    this.mesh?.setEnabled(true);
  }

  conformToTerrain(): void {
    if (!this.mesh) return;
    const positions = this.mesh.getVerticesData('position');
    if (!positions) return;
    for (let i = 0; i < positions.length; i += 3) {
      const vx = positions[i];
      const vz = positions[i + 2];
      const groundY = TerrainMeshBuilder.sampleElevationAt(this.scene, vx, vz);
      positions[i + 1] = groundY + FOG_HEIGHT_OFFSET;
    }
    this.mesh.updateVerticesData('position', positions);
  }

  dispose(): void {
    this.mesh?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.mesh = null;
    this.material = null;
    this.texture = null;
  }

  private ensureMesh(): void {
    if (this.mesh) return;

    const mesh = new Mesh('lw-fog-plane', this.scene);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let iz = 0; iz <= FOG_SUBDIV_Z; iz++) {
      const tz = iz / FOG_SUBDIV_Z;
      const z = -FOG_HALF_Z + tz * (FOG_HALF_Z * 2);
      const v = 1 - tz; // Canvas top (z = -13.5) maps to v = 1
      for (let ix = 0; ix <= FOG_SUBDIV_X; ix++) {
        const tx = ix / FOG_SUBDIV_X;
        const x = -FOG_HALF_X + tx * (FOG_HALF_X * 2);
        const groundY = TerrainMeshBuilder.sampleElevationAt(this.scene, x, z);
        positions.push(x, groundY + FOG_HEIGHT_OFFSET, z);
        normals.push(0, 1, 0);
        uvs.push(tx, v);
      }
    }

    const rowStride = FOG_SUBDIV_X + 1;
    for (let iz = 0; iz < FOG_SUBDIV_Z; iz++) {
      for (let ix = 0; ix < FOG_SUBDIV_X; ix++) {
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

    const material = new StandardMaterial('lw-fog-mat', this.scene);
    material.disableLighting = true;
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.emissiveColor = Color3.FromHexString('#030806');
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.isPickable = false;

    this.mesh = mesh;
    this.texture = texture;
    this.material = material;
  }
}
