import {
  Material, MaterialPluginBase, Mesh, MeshBuilder, PBRMaterial, Scene,
  StandardMaterial, Vector3, VertexBuffer,
} from '@babylonjs/core';
import type { MapWallSegmentNode } from '../map-scene-contract';
import type { WallPaintDab } from './wall-surface.models';

/** Brush parameters travel with the vertices, allowing all dabs to share a draw call. */
class BrushFeatherPlugin extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'WallBrushFeather', 220, {}, true, true);
  }
  override getAttributes(attributes: string[]): void {
    attributes.push('lwBrushCentreRadius', 'lwBrushNormalHardness');
  }
  override getCustomCode(shaderType: string): Record<string, string> | null {
    const varyings = 'varying vec4 vLwBrushCentreRadius; varying vec4 vLwBrushNormalHardness;';
    if (shaderType === 'vertex') return {
      CUSTOM_VERTEX_DEFINITIONS: `attribute vec4 lwBrushCentreRadius;
        attribute vec4 lwBrushNormalHardness; ${varyings}`,
      CUSTOM_VERTEX_MAIN_END: `vLwBrushCentreRadius = lwBrushCentreRadius;
        vLwBrushNormalHardness = lwBrushNormalHardness;`,
    };
    if (shaderType !== 'fragment') return null;
    const color = this._material instanceof PBRMaterial ? 'finalColor' : 'color';
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: varyings,
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        vec3 brushDelta = vPositionW - vLwBrushCentreRadius.xyz;
        float brushDistance = length(brushDelta - vLwBrushNormalHardness.xyz
          * dot(brushDelta, vLwBrushNormalHardness.xyz));
        float brushCoverage = 1.0 - smoothstep(vLwBrushCentreRadius.w * vLwBrushNormalHardness.w,
          vLwBrushCentreRadius.w, brushDistance);
        ${color}.a *= brushCoverage;
      `,
    };
  }
}

interface PaintBatch {
  mesh: Mesh;
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  centres: number[];
  brushes: number[];
  indices: number[];
}

export class WallSurfacePaint {
  private static batches = new WeakMap<Scene, Map<string, PaintBatch>>();

  static clear(scene: Scene): void {
    for (const batch of this.batches.get(scene)?.values() ?? []) {
      batch.mesh.material?.dispose(false, false);
      batch.mesh.dispose();
    }
    this.batches.delete(scene);
  }

  static apply(scene: Scene, wallId: string, dab: WallPaintDab): void {
    const position = Vector3.FromArray(dab.position), normal = Vector3.FromArray(dab.normal);
    let batches = this.batches.get(scene);
    if (!batches) { batches = new Map(); this.batches.set(scene, batches); }
    const sources = scene.meshes.filter(mesh => mesh.isEnabled() && mesh.getTotalVertices() > 0
      && mesh.metadata?.lwKind === 'wall' && mesh.metadata?.lwEntityId === wallId);
    for (const source of sources) {
      // A shallow, back-face-culled projection cannot reach the reverse side or another wall.
      const decal = MeshBuilder.CreateDecal('lw-brush-projection', source, {
        position, normal, size: new Vector3(dab.radius * 2, dab.radius * 2, 0.12),
        captureUVS: true, cullBackFaces: true,
      });
      if (!decal.getTotalVertices()) { decal.dispose(); continue; }
      const key = wallId + ':' + source.material?.uniqueId;
      let batch = batches.get(key);
      if (!batch) {
        const material = source.material?.clone('lw-brush-material');
        if (!(material instanceof PBRMaterial) && !(material instanceof StandardMaterial)) {
          material?.dispose(false, false); decal.dispose(); continue;
        }
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.alpha = 1;
        material.zOffset = -2;
        material.disableDepthWrite = true;
        new BrushFeatherPlugin(material);
        const mesh = new Mesh('lw-surface-paint-' + wallId, scene);
        mesh.material = material;
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        mesh.useVertexColors = true;
        mesh.hasVertexAlpha = true;
        batch = { mesh, positions: [], normals: [], uvs: [], colors: [], centres: [], brushes: [], indices: [] };
        batches.set(key, batch);
      }
      const positions = decal.getVerticesData(VertexBuffer.PositionKind)!;
      const normals = decal.getVerticesData(VertexBuffer.NormalKind)!;
      const uvs = decal.getVerticesData(VertexBuffer.UVKind)!;
      const matrix = decal.computeWorldMatrix(true);
      const offset = batch.positions.length / 3;
      const rgb = parseInt(dab.colorHex.slice(1), 16);
      for (let i = 0; i < positions.length; i += 3) {
        const p = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), matrix);
        const n = Vector3.TransformNormal(Vector3.FromArray(normals, i), matrix).normalize();
        batch.positions.push(p.x, p.y, p.z);
        batch.normals.push(n.x, n.y, n.z);
        batch.colors.push(((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255,
          (rgb & 255) / 255, dab.opacity / 100);
        batch.centres.push(...dab.position, dab.radius);
        batch.brushes.push(...dab.normal, Math.min(.99, dab.hardness / 100));
      }
      for (const uv of uvs) batch.uvs.push(uv);
      for (const index of decal.getIndices() ?? []) batch.indices.push(index + offset);
      decal.dispose();
      batch.mesh.setVerticesData(VertexBuffer.PositionKind, batch.positions, true);
      batch.mesh.setVerticesData(VertexBuffer.NormalKind, batch.normals, true);
      batch.mesh.setVerticesData(VertexBuffer.UVKind, batch.uvs, true);
      batch.mesh.setVerticesData(VertexBuffer.ColorKind, batch.colors, true);
      batch.mesh.setVerticesData('lwBrushCentreRadius', batch.centres, true, 4);
      batch.mesh.setVerticesData('lwBrushNormalHardness', batch.brushes, true, 4);
      batch.mesh.setIndices(batch.indices);
    }
  }

  static replay(scene: Scene, walls: readonly MapWallSegmentNode[]): void {
    for (const wall of walls) for (const dab of wall.paintDabs ?? []) this.apply(scene, wall.id, dab);
  }
}
