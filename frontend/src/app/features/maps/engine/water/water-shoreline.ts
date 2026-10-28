import type { GroundSampler, WaterProfile } from './water-profile';
import { sampleWaterNetwork, WaterField } from './water-network-field';

/** Extend into the carved bank and clip against its actual rendered height, not an assumed radius. */
export function sampleWaterShoreline(profiles: readonly WaterProfile[], x: number, z: number,
  ground?: GroundSampler): WaterField {
  const f = sampleWaterNetwork(profiles, x, z);
  if (!ground) return f;
  const bank = Math.max(.12, f.settings.bankWidth * f.settings.bankFeathering / 100);
  const support = f.coverage + bank;
  const bed = ground(x, z), depth = f.level - bed;
  // Feather an open, low bank down to the ground instead of exposing a vertical blue skirt.
  const t = Math.max(0, Math.min(1, support / bank));
  const feather = t * t * (3 - 2 * t);
  const level = bed + Math.max(0, depth) * feather;
  return { ...f, coverage: Math.min(support, depth), level,
    depth: Math.max(0, Math.min(1, (level - bed) / Math.max(.15, f.settings.depth))) };
}
