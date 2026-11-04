import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
} from '@babylonjs/core';
import { GlbCloneMetadata } from './glb-model-cache';

export interface MiniaturePlinthConfig {
  readonly id: string;
  readonly diameter: number;
  readonly ringColorHex?: string;
  readonly isBossOrLarge?: boolean;
  readonly showStoneInlay?: boolean;
}

export interface MiniaturePlinthResult {
  readonly rootNode: TransformNode;
  readonly plinthMesh: Mesh;
  readonly collarMesh: Mesh;
  readonly topSurfaceY: number;
}

export class MiniaturePlinthBuilder {
  private static sharedMatCache = new WeakMap<Scene, Map<string, StandardMaterial>>();

  private static getPlinthMaterial(
    scene: Scene,
    colorHex: string,
    isCollar = false,
  ): StandardMaterial {
    let cache = this.sharedMatCache.get(scene);
    if (!cache) {
      cache = new Map<string, StandardMaterial>();
      this.sharedMatCache.set(scene, cache);
    }

    const key = `${colorHex.toLowerCase()}:${isCollar ? 1 : 0}`;
    const existing = cache.get(key);
    if (existing) return existing;

    const mat = new StandardMaterial(`lw-mini-plinth-mat-${key}`, scene);
    if (isCollar) {
      // Vivid status / combat rim (like the red troll collar in TaleSpire)
      mat.diffuseColor = Color3.FromHexString(colorHex);
      mat.emissiveColor = Color3.FromHexString(colorHex).scale(0.35);
      mat.specularColor = Color3.FromHexString('#ffffff').scale(0.3);
      mat.roughness = 0.35;
    } else {
      // Dark matte composite miniature base (tabletop mini plastic/resin)
      mat.diffuseColor = Color3.FromHexString('#16181b');
      mat.emissiveColor = Color3.FromHexString('#0a0d0e');
      mat.specularColor = Color3.FromHexString('#33383f').scale(0.4);
      mat.roughness = 0.65;
    }

    cache.set(key, mat);
    return mat;
  }

  private static createStoneInlayTexture(scene: Scene, diameter: number): DynamicTexture {
    const res = 256;
    const tex = new DynamicTexture(`lw-plinth-stone-tex-${Math.round(diameter * 100)}`, res, scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;

    ctx.fillStyle = '#22262a';
    ctx.fillRect(0, 0, res, res);

    // Draw circular flagstone cracks and pavers
    ctx.save();
    ctx.beginPath();
    ctx.arc(res / 2, res / 2, res / 2 - 4, 0, Math.PI * 2);
    ctx.clip();

    // Subtle stone shading
    const grad = ctx.createRadialGradient(res / 2, res / 2, res * 0.1, res / 2, res / 2, res * 0.48);
    grad.addColorStop(0, '#363d44');
    grad.addColorStop(0.7, '#242a30');
    grad.addColorStop(1, '#181c20');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, res, res);

    // Carved flagstone radial grooves
    ctx.strokeStyle = '#101316';
    ctx.lineWidth = 3;
    const slices = 6;
    for (let i = 0; i < slices; i++) {
      const angle = (i * Math.PI * 2) / slices + 0.3;
      ctx.beginPath();
      ctx.moveTo(res / 2, res / 2);
      ctx.lineTo(res / 2 + Math.cos(angle) * (res * 0.48), res / 2 + Math.sin(angle) * (res * 0.48));
      ctx.stroke();
    }

    // Concentric pavers
    ctx.beginPath();
    ctx.arc(res / 2, res / 2, res * 0.28, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    tex.update();
    return tex;
  }

  /**
   * Builds an authentic physical tabletop miniature base plinth with:
   * 1. Beveled cylinder pedestal (tabletop mini bevel)
   * 2. Outer tactical status collar ring (red for enemies, emerald for party, gold for neutrals)
   * 3. Flagstone / cobblestone carved top inlay
   */
  static buildPlinth(
    scene: Scene,
    config: MiniaturePlinthConfig,
    metadata?: GlbCloneMetadata,
  ): MiniaturePlinthResult {
    const { id, diameter, ringColorHex = '#dc2626', showStoneInlay = true } = config;
    const plinthHeight = Math.max(0.08, Math.min(0.16, 0.09 * (diameter / 1.5)));
    const rootNode = new TransformNode(`lw-plinth-root-${id}`, scene);
    if (metadata) rootNode.metadata = metadata;

    // 1. Chamfered Base Pedestal Cylinder
    const baseMesh = MeshBuilder.CreateCylinder(
      `lw-plinth-body-${id}`,
      {
        diameterBottom: diameter,
        diameterTop: diameter * 0.95,
        height: plinthHeight,
        tessellation: 48,
      },
      scene,
    );
    baseMesh.position.y = plinthHeight * 0.5;
    baseMesh.parent = rootNode;
    baseMesh.material = this.getPlinthMaterial(scene, '#181b1e', false);
    baseMesh.receiveShadows = true;
    if (metadata) baseMesh.metadata = metadata;

    // 2. Tactical Combat / Faction Status Collar Ring (The TaleSpire combat ring)
    const collarThickness = Math.max(0.035, diameter * 0.038);
    const collarHeight = plinthHeight * 0.5;
    const collarMesh = MeshBuilder.CreateTorus(
      `lw-plinth-collar-${id}`,
      {
        diameter: diameter * 0.95,
        thickness: collarThickness,
        tessellation: 48,
      },
      scene,
    );
    collarMesh.position.y = plinthHeight;
    collarMesh.scaling.y = 0.5;
    collarMesh.parent = rootNode;
    collarMesh.material = this.getPlinthMaterial(scene, ringColorHex, true);
    if (metadata) collarMesh.metadata = metadata;

    // 3. Flagstone Inlay Disc
    if (showStoneInlay) {
      const topDisc = MeshBuilder.CreateGround(
        `lw-plinth-inlay-${id}`,
        {
          width: diameter * 0.9,
          height: diameter * 0.9,
        },
        scene,
      );
      topDisc.position.y = plinthHeight + 0.005;
      topDisc.parent = rootNode;

      const inlayMat = new StandardMaterial(`lw-plinth-inlay-mat-${id}`, scene);
      inlayMat.diffuseTexture = this.createStoneInlayTexture(scene, diameter);
      inlayMat.specularColor = Color3.FromHexString('#202428');
      inlayMat.roughness = 0.55;
      topDisc.material = inlayMat;
      topDisc.receiveShadows = true;
      if (metadata) topDisc.metadata = metadata;
    }

    return {
      rootNode,
      plinthMesh: baseMesh,
      collarMesh,
      topSurfaceY: plinthHeight + 0.006,
    };
  }
}
