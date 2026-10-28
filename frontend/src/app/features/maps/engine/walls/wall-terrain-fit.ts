import { Matrix, Mesh, Scene, TransformNode, Vector3, VertexBuffer, VertexData } from '@babylonjs/core';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';

/** Smooth samples are shared across stamp boundaries, so adjoining tops meet at the same height. */
export function wallGroundAt(scene: Scene, x: number, z: number, smoothing: number): number {
  const radius = Math.max(0, Math.min(100, smoothing)) * 0.025;
  const sample = (dx: number, dz: number) => TerrainMeshBuilder.sampleElevationAt(scene, x + dx, z + dz);
  if (radius === 0) return sample(0, 0);
  const filtered = (sample(0, 0) * 4 + sample(radius, 0) + sample(-radius, 0)
    + sample(0, radius) + sample(0, -radius)) / 8;
  // Keep the wall base buried where averaging smooths a steep crest.
  return filtered;
}

export function fitWallStamp(
  scene: Scene, root: TransformNode, origin: readonly [number, number],
  axis: readonly [number, number], spanLength: number, ground: number,
  smoothing: number,
): void {
  const bounds = root.getHierarchyBoundingVectors(true);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  for (const child of root.getChildMeshes()) {
    if (!(child instanceof Mesh) || !child.getTotalVertices()) continue;
    child.makeGeometryUnique();
    const positions = child.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) continue;
    const world = child.computeWorldMatrix(true).clone();
    const inverse = Matrix.Invert(world);
    for (let i = 0; i < positions.length; i += 3) {
      const p = Vector3.TransformCoordinates(Vector3.FromArray(positions, i), world);
      const along = (p.x - origin[0]) * axis[0] + (p.z - origin[1]) * axis[1];
      const clipped = Math.max(0, Math.min(spanLength, along));
      p.x += (clipped - along) * axis[0];
      p.z += (clipped - along) * axis[1];
      if (smoothing > 0) {
        const blend = Math.max(0, Math.min(1, (p.y - bounds.min.y) / height));
        const smooth = wallGroundAt(scene, p.x, p.z, smoothing);
        const base = Math.min(smooth, TerrainMeshBuilder.sampleElevationAt(scene, p.x, p.z));
        p.y += base * (1 - blend) + smooth * blend - ground;
      }
      const local = Vector3.TransformCoordinates(p, inverse);
      positions[i] = local.x; positions[i + 1] = local.y; positions[i + 2] = local.z;
    }
    child.setVerticesData(VertexBuffer.PositionKind, positions, true);
    const indices = child.getIndices();
    if (indices) {
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      child.setVerticesData(VertexBuffer.NormalKind, normals, true);
    }
    child.refreshBoundingInfo();
  }
}
