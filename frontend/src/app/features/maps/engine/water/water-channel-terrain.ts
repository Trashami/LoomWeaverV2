import type { Scene } from '@babylonjs/core';
import type { WaterSplineNode } from '../map-scene-contract';
import { groupWaterNetworks, sampleWaterNetwork } from './water-network-field';
import { buildWaterProfile, WaterProfile } from './water-profile';

/** Carving is a reversible scene layer, never added repeatedly to sculpt offsets. */
export class WaterChannelTerrain {
  private static bodies = new WeakMap<Scene, readonly WaterSplineNode[]>();
  private static networks = new WeakMap<Scene, WaterProfile[][]>();
  static getNetworks(scene: Scene): readonly WaterProfile[][] { return this.networks.get(scene) ?? []; }
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
    const networks=groupWaterNetworks(profiles);
    this.networks.set(scene,networks);
    for(const network of networks) {
      const margin=Math.max(...network.map(p=>p.settings.width/2+p.settings.bankWidth))+1;
      const samples=network.flatMap(p=>p.samples);
      const minX=Math.min(...samples.map(p=>p.x))-margin,maxX=Math.max(...samples.map(p=>p.x))+margin;
      const minZ=Math.min(...samples.map(p=>p.z))-margin,maxZ=Math.max(...samples.map(p=>p.z))+margin;
      for(let i=0;i<positions.length;i+=3) {
        const x=positions[i],z=positions[i+2];
        if(x<minX||x>maxX||z<minZ||z>maxZ)continue;
        const f=sampleWaterNetwork(network,x,z),s=f.settings;
        const bank=.08+s.bankWidth*s.bankFeathering/100;
        if(f.coverage < -bank)continue;
        let bed=f.level-.035-s.depth*f.depth;
        if(f.coverage<0) {
          const t=Math.min(1,-f.coverage/bank),feather=t*t*(3-2*t);
          bed=f.level-.035+(base[i+1]-f.level+.035)*feather;
        }
        positions[i+1]=Math.min(positions[i+1],bed);
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
