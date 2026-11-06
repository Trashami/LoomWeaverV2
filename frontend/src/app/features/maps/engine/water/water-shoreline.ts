import type { GroundSampler, WaterProfile } from './water-profile';
import { sampleWaterNetwork, WaterField } from './water-network-field';

const MAP_HALF_W = 37.2;
const MAP_HALF_H = 37.2;

/** Extend into the carved bank and clip cleanly against terrain height and map edges. */
export function sampleWaterShoreline(
  profiles: readonly WaterProfile[],
  x: number,
  z: number,
  ground?: GroundSampler,
): WaterField {
  const f = sampleWaterNetwork(profiles, x, z);
  const edgeDist = Math.min(MAP_HALF_W - Math.abs(x), MAP_HALF_H - Math.abs(z));
  if (edgeDist < 0) {
    return { ...f, coverage: edgeDist, depth: 0 };
  }
  if (!ground) {
    return { ...f, coverage: Math.min(f.coverage, edgeDist) };
  }
  const bank = Math.max(0.12, (f.settings.bankWidth * f.settings.bankFeathering) / 100);
  const support = f.coverage + bank;
  const bed = ground(x, z);
  const depth = f.level - bed;
  const t = Math.max(0, Math.min(1, support / bank));
  const feather = t * t * (3 - 2 * t);
  const level = bed + Math.max(0, depth) * feather;
  return {
    ...f,
    coverage: Math.min(support, depth, edgeDist),
    level,
    depth: Math.max(0, Math.min(1, (level - bed) / Math.max(0.15, f.settings.depth))),
  };
}
