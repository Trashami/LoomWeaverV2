import type { Scene } from '@babylonjs/core';
import type { WaterSplineNode } from '../map-scene-contract';
import { buildWaterProfile, channelBed, WaterProfile } from './water-profile';

/** Carving is a reversible scene layer, never added repeatedly to sculpt offsets. */
export class WaterChannelTerrain {
  private static bodies = new WeakMap<Scene, readonly WaterSplineNode[]>();
  private static profiles = new WeakMap<Scene, WaterProfile[]>();
  private static bases = new WeakMap<Scene, { positions: Float32Array; width: number; height: number }>();
  static configure(scene: Scene, bodies: readonly WaterSplineNode[]): void { this.bodies.set(scene, bodies); }
  static getBodies(scene: Scene): readonly WaterSplineNode[] { return this.bodies.get(scene) ?? []; }
  static getProfiles(scene: Scene): readonly WaterProfile[] { return this.profiles.get(scene) ?? []; }
  static sampleBase(scene: Scene, x: number, z: number): number {
    const data = this.bases.get(scene);
    return data ? sampleGrid(data.positions, data.width, data.height, x, z) : 0;
  }
  static apply(scene: Scene, positions: number[] | Float32Array, width: number, height: number): void {
    const base = new Float32Array(positions);
    this.bases.set(scene, { positions: base, width, height });
    const profiles = (this.bodies.get(scene) ?? []).map(w => buildWaterProfile(w,
      (x, z) => sampleGrid(base, width, height, x, z)));
    this.profiles.set(scene, profiles);
    for (const profile of profiles) {
      if (!profile.samples.length) continue;
      const margin = profile.settings.width / 2 + profile.settings.bankWidth;
      const xs = profile.samples.map(p => p.x), zs = profile.samples.map(p => p.z);
      const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin;
      const minZ = Math.min(...zs) - margin, maxZ = Math.max(...zs) + margin;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], z = positions[i + 2];
        if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
        positions[i + 1] = Math.min(positions[i + 1], channelBed(profile, x, z, base[i + 1]));
      }
    }
  }
}

export function sampleGrid(positions: Float32Array, width: number, height: number, x: number, z: number): number {
  const cols = Math.round(Math.sqrt(positions.length / 3)), subdivisions = cols - 1;
  if (subdivisions < 1) return 0;
  const gx = Math.max(0, Math.min(subdivisions, (x + width / 2) / width * subdivisions));
  const gz = Math.max(0, Math.min(subdivisions, (height / 2 - z) / height * subdivisions));
  const ix = Math.min(subdivisions - 1, Math.floor(gx)), iz = Math.min(subdivisions - 1, Math.floor(gz));
  const tx = gx - ix, tz = gz - iz;
  const y = (dx: number, dz: number) => positions[((iz + dz) * cols + ix + dx) * 3 + 1];
  return (y(0, 0) * (1 - tx) + y(1, 0) * tx) * (1 - tz)
    + (y(0, 1) * (1 - tx) + y(1, 1) * tx) * tz;
}
