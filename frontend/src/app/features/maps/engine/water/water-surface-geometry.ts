import { Mesh, Scene, VertexData } from '@babylonjs/core';
import type { WaterProfile } from './water-profile';

export interface WaterGeometry { positions: number[]; normals: number[]; indices: number[]; uvs: number[]; data: number[]; }
export function buildWaterGeometry(profile: WaterProfile): WaterGeometry {
  const g: WaterGeometry = { positions: [], normals: [], indices: [], uvs: [], data: [] };
  const samples = profile.samples, s = profile.settings;
  if (!samples.length) return g;
  const vertex = (x: number, y: number, z: number, u: number, v: number, depth: number, fall: number) => {
    const index = g.positions.length / 3;
    g.positions.push(x, y + .018, z); g.uvs.push(u, v);
    g.data.push(depth, fall, s.mode === 'pond' ? 0 : 1, 0);
    return index;
  };
  const triangle = (a: number, b: number, c: number) => g.indices.push(a, c, b);
  if (samples.length === 1) {
    const centre = samples[0], steps = 64, rings = 10, radius = s.width / 2;
    vertex(centre.x, centre.level, centre.z, .5, .5, 1, 0);
    for (let ring = 1; ring <= rings; ring++) {
      const r = ring / rings;
      for (let i = 0; i <= steps; i++) {
        const a = i / steps * Math.PI * 2;
        vertex(centre.x + Math.cos(a) * radius * r, centre.level, centre.z + Math.sin(a) * radius * r,
          .5 + Math.cos(a) * r * .5, .5 + Math.sin(a) * r * .5, 1 - r ** 4, 0);
      }
    }
    for (let i = 0; i < steps; i++) triangle(0, i + 2, i + 1);
    for (let ring = 1; ring < rings; ring++) for (let i = 0; i < steps; i++) {
      const a = 1 + (ring - 1) * (steps + 1) + i, b = a + steps + 1;
      triangle(a, b + 1, b); triangle(a, a + 1, b + 1);
    }
  } else {
    const across = 8, row = across + 1;
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i], prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - prev.x, dz = next.z - prev.z, length = Math.max(.001, Math.hypot(dx, dz));
      const nx = -dz / length, nz = dx / length;
      for (let j = 0; j <= across; j++) {
        const u = j / across, lateral = (u - .5) * s.width;
        // Both banks share one water level; no twisting a ribbon to terrain vertices.
        vertex(p.x + nx * lateral, p.level, p.z + nz * lateral, u, p.distance,
          1 - Math.abs(u * 2 - 1) ** 4, Math.max(p.fall, prev.fall));
      }
      if (i > 0) for (let j = 0; j < across; j++) {
        const a = (i - 1) * row + j, b = i * row + j;
        triangle(a, a + 1, b); triangle(a + 1, b + 1, b);
      }
    }
    // Rounded end caps close the trench at either end without square paint patches.
    for (const end of [0, samples.length - 1]) {
      const p = samples[end], neighbour = samples[end === 0 ? 1 : end - 1];
      const angle = Math.atan2(p.z - neighbour.z, p.x - neighbour.x), radius = s.width / 2;
      const tangentX = (end === 0 ? neighbour.x-p.x : p.x-neighbour.x);
      const tangentZ = (end === 0 ? neighbour.z-p.z : p.z-neighbour.z);
      const tangentLength = Math.max(.001,Math.hypot(tangentX,tangentZ));
      const tx = tangentX/tangentLength, tz = tangentZ/tangentLength;
      const c = vertex(p.x, p.level, p.z, .5, p.distance, 1, p.fall);
      for (let i = 0; i <= 24; i++) {
        const a = angle - Math.PI / 2 + i / 24 * Math.PI;
        const ox = Math.cos(a)*radius, oz = Math.sin(a)*radius;
        vertex(p.x+ox,p.level,p.z+oz,.5+(-tz*ox+tx*oz)/s.width,
          p.distance+tx*ox+tz*oz,0,p.fall);
        if (i) triangle(c, c + i + 1, c + i);
      }
    }
  }
  VertexData.ComputeNormals(g.positions, g.indices, g.normals);
  return g;
}
export function createWaterMesh(scene: Scene, profile: WaterProfile): Mesh {
  const geometry = buildWaterGeometry(profile), mesh = new Mesh('lw-water-spline-' + profile.id, scene);
  const data = new VertexData();
  data.positions = geometry.positions; data.normals = geometry.normals;
  data.indices = geometry.indices; data.uvs = geometry.uvs;
  data.applyToMesh(mesh, false);
  mesh.setVerticesData('waterData', geometry.data, false, 4);
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  return mesh;
}
