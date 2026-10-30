import { Color3, DynamicTexture, Mesh, Scene, StandardMaterial, VertexData } from '@babylonjs/core';

/** World extents covered by the fog canvas: x in [-12, 12], z in [-8, 8]. */
const FOG_HALF_X = 12;
const FOG_HALF_Z = 8;
const FOG_Y = 1;
const FOG_TEXTURE_WIDTH = 1200;
const FOG_TEXTURE_HEIGHT = 800;

/**
 * Horizontal fog plane textured with the player fog canvas. The canvas alpha
 * drives transparency, so cleared areas show the map beneath.
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
    const ctx = this.texture?.getContext();
    if (!this.texture || !ctx) return;
    ctx.clearRect(0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
    ctx.drawImage(layer, 0, 0, FOG_TEXTURE_WIDTH, FOG_TEXTURE_HEIGHT);
    this.texture.update();
    this.mesh?.setEnabled(true);
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
    const positions = [
      -FOG_HALF_X, FOG_Y, -FOG_HALF_Z,
      FOG_HALF_X, FOG_Y, -FOG_HALF_Z,
      FOG_HALF_X, FOG_Y, FOG_HALF_Z,
      -FOG_HALF_X, FOG_Y, FOG_HALF_Z,
    ];
    const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    // Canvas top (z = -8) maps to v = 1 because the dynamic texture is not inverted.
    const uvs = [0, 1, 1, 1, 1, 0, 0, 0];
    const indices = [0, 2, 1, 0, 3, 2];

    const data = new VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);

    const texture = new DynamicTexture(
      'lw-fog-tex',
      { width: FOG_TEXTURE_WIDTH, height: FOG_TEXTURE_HEIGHT },
      this.scene,
      false,
    );
    texture.hasAlpha = true;

    const material = new StandardMaterial('lw-fog-mat', this.scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.isPickable = false;

    this.mesh = mesh;
    this.texture = texture;
    this.material = material;
  }
}
