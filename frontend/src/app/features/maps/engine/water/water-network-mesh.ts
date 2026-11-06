import { Mesh, Scene, VertexData } from '@babylonjs/core';
import { sampleWaterShoreline } from './water-shoreline';
import type { GroundSampler, WaterProfile } from './water-profile';
import { WaterField } from './water-network-field';

interface Point {
  x: number;
  z: number;
  field: WaterField;
}

const MAP_HALF_W = 37.2;
const MAP_HALF_H = 37.2;

/** Clip a regular surface grid to the union outline and strictly to map boundaries. */
export function createWaterNetworkMesh(
  scene: Scene,
  profiles: readonly WaterProfile[],
  ground?: GroundSampler,
): Mesh {
  const points = profiles.flatMap((p) => p.samples);
  const radius = Math.max(...profiles.map((p) => p.settings.width / 2 + p.settings.bankWidth)) + 1;
  const minX = Math.max(-MAP_HALF_W, Math.min(...points.map((p) => p.x)) - radius);
  const maxX = Math.min(MAP_HALF_W, Math.max(...points.map((p) => p.x)) + radius);
  const minZ = Math.max(-MAP_HALF_H, Math.min(...points.map((p) => p.z)) - radius);
  const maxZ = Math.min(MAP_HALF_H, Math.max(...points.map((p) => p.z)) + radius);

  const baseCell = Math.max(0.32, Math.min(0.55, Math.min(...profiles.map((p) => p.settings.width)) / 6));
  const cell = Math.max(baseCell, (maxX - minX) / 84, (maxZ - minZ) / 84);
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const stepX = (maxX - minX) / cols;
  const stepZ = (maxZ - minZ) / rows;

  const grid: Point[] = [];
  for (let iz = 0; iz <= rows; iz++) {
    for (let ix = 0; ix <= cols; ix++) {
      const x = minX + ix * stepX;
      const z = minZ + iz * stepZ;
      grid.push({ x, z, field: sampleWaterShoreline(profiles, x, z, ground) });
    }
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const water: number[] = [];
  const flow: number[] = [];
  const shallow: number[] = [];
  const deep: number[] = [];
  const style: number[] = [];
  const cache = new Map<string, number>();

  const vertex = (p: Point): number => {
    const cx = Math.max(-MAP_HALF_W, Math.min(MAP_HALF_W, p.x));
    const cz = Math.max(-MAP_HALF_H, Math.min(MAP_HALF_H, p.z));
    const key = cx.toFixed(5) + ',' + cz.toFixed(5);
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    const f = p.field;
    const s = f.settings;
    const index = positions.length / 3;
    positions.push(cx, f.level + 0.003, cz);
    uvs.push(cx, cz);
    water.push(f.depth, f.fall, f.speed > 0 ? 1 : 0, 0);
    flow.push(f.dx, f.dz, f.speed, s.refraction);
    shallow.push(...f.shallow, s.opacity);
    deep.push(...f.deep, s.reflectivity);
    style.push(s.intensity, s.foam, s.waveScale, Math.min(s.waveHeight, s.depth * 0.08));
    cache.set(key, index);
    return index;
  };

  const clip = (triangle: Point[]) => {
    const polygon: Point[] = [];
    for (let i = 0; i < 3; i++) {
      const a = triangle[i];
      const b = triangle[(i + 1) % 3];
      const inside = a.field.coverage >= 0;
      if (inside) polygon.push(a);
      if (inside !== b.field.coverage >= 0) {
        const t = a.field.coverage / (a.field.coverage - b.field.coverage);
        const x = Math.max(-MAP_HALF_W, Math.min(MAP_HALF_W, a.x + (b.x - a.x) * t));
        const z = Math.max(-MAP_HALF_H, Math.min(MAP_HALF_H, a.z + (b.z - a.z) * t));
        polygon.push({
          x,
          z,
          field: { ...sampleWaterShoreline(profiles, x, z, ground), coverage: 0, depth: 0 },
        });
      }
    }
    if (polygon.length < 3) return;
    const a = vertex(polygon[0]);
    for (let i = 1; i < polygon.length - 1; i++) {
      indices.push(a, vertex(polygon[i]), vertex(polygon[i + 1]));
    }
  };

  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < cols; x++) {
      const a = z * (cols + 1) + x;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      clip([grid[a], grid[b], grid[c]]);
      clip([grid[b], grid[d], grid[c]]);
    }
  }

  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh('lw-water-spline-network-' + profiles[0].id, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.uvs = uvs;
  data.applyToMesh(mesh);
  mesh.setVerticesData('waterData', water, false, 4);
  mesh.setVerticesData('waterFlow', flow, false, 4);
  mesh.setVerticesData('waterShallow', shallow, false, 4);
  mesh.setVerticesData('waterDeep', deep, false, 4);
  mesh.setVerticesData('waterStyle', style, false, 4);
  mesh.isPickable = false;
  return mesh;
}
