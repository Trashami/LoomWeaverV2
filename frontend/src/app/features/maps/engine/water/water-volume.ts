import { Color3, Mesh, Scene, StandardMaterial, VertexData } from '@babylonjs/core';
import type { GroundSampler, WaterProfile } from './water-profile';
import { sampleWaterNetwork } from './water-network-field';

/** Close the underside and exterior shoreline down to the bed, without internal junction walls. */
export function createWaterVolume(scene: Scene, surface: Mesh, profiles: readonly WaterProfile[], ground: GroundSampler): Mesh {
  const top = surface.getVerticesData('position')!, triangles = surface.getIndices()!;
  const count = top.length / 3, positions = Array.from(top), indices: number[] = [], normals: number[] = [];
  for (let i = 0; i < top.length; i += 3) {
    const f = sampleWaterNetwork(profiles, top[i], top[i + 2]);
    const bed = Math.min(top[i + 1] - .04, ground(top[i], top[i + 2]), f.level - .035 - f.settings.depth * f.depth);
    positions.push(top[i], bed, top[i + 2]);
  }
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
    indices.push(c + count, b + count, a + count);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = Math.min(u, v) + ':' + Math.max(u, v), edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { a: u, b: v, count: 1 });
    }
  }
  for (const { a, b, count: uses } of edges.values()) {
    if (uses === 1) indices.push(a, b, b + count, a, b + count, a + count);
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh('lw-water-spline-volume-' + profiles[0].id, scene), data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals; data.applyToMesh(mesh);
  const mat = new StandardMaterial('lw-water-volume-' + profiles[0].id, scene);
  mat.diffuseColor = Color3.FromHexString(profiles[0].settings.deepColor);
  mat.emissiveColor = mat.diffuseColor.scale(.3); mat.specularColor = Color3.Black();
  mat.alpha = Math.max(.85, profiles[0].settings.opacity); mat.backFaceCulling = false;
  mesh.material = mat; mesh.isPickable = false;
  return mesh;
}
