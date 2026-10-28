import type { WaterSplineNode } from '../map-scene-contract';
import { DEFAULT_WATER, normalizeWater, WaterSettings } from './water-settings';
export interface WaterSample { x: number; z: number; level: number; distance: number; fall: number; }
export interface WaterProfile { id: string; settings: WaterSettings; samples: WaterSample[]; }
export type GroundSampler = (x: number, z: number) => number;
export function settingsForWater(water: WaterSplineNode): WaterSettings {
  return normalizeWater(water.settings ?? { ...DEFAULT_WATER, width: water.width,
    flowSpeed: water.flowSpeed ?? DEFAULT_WATER.flowSpeed,
    mode: water.points.length === 1 ? 'pond' : 'river', shallowColor: water.colorHex || DEFAULT_WATER.shallowColor });
}

/** Resample a centreline with bounded turns and orient it downhill, independent of drawing direction. */
export function buildWaterProfile(water: WaterSplineNode, ground: GroundSampler): WaterProfile {
  const settings = settingsForWater(water);
  let points = water.points.filter(p => p.every(Number.isFinite)).map(p => [p[0], p[2]]);
  points = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > .05);
  if (!points.length) return { id: water.id, settings, samples: [] };
  if (settings.mode === 'pond' || points.length === 1) {
    const [x, z] = points[0], r = settings.width / 2;
    const rim = Array.from({ length: 24 }, (_, i) => ground(x + Math.cos(i / 24 * Math.PI * 2) * r,
      z + Math.sin(i / 24 * Math.PI * 2) * r));
    // The lowest bank controls the basin level; a pond never climbs across a hillside.
    const level = Math.min(ground(x, z), ...rim) - settings.depth * .22;
    return { id: water.id, settings, samples: [{ x, z, level, distance: 0, fall: 0 }] };
  }
  const last = points[points.length - 1];
  if (ground(points[0][0], points[0][1]) < ground(last[0], last[1])) points.reverse();
  // One corner-cutting pass removes sharp zigzags without overshooting the user's footprint.
  const smooth: number[][] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    smooth.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25],
      [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
  }
  smooth.push(points[points.length - 1]);
  const samples: WaterSample[] = [];
  let distance = 0, previous = Infinity;
  for (let i = 0; i < smooth.length - 1 && samples.length < 1024; i++) {
    const a = smooth[i], b = smooth[i + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / .35));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const raw = ground(x, z) - settings.depth * .22;
      const level = Math.min(previous, raw);
      const p = samples[samples.length - 1];
      const delta = p ? Math.hypot(x - p.x, z - p.z) : 0;
      if (p && delta < .01) continue;
      distance += delta;
      const slope = p ? (p.level - level) / Math.max(.01, delta) : 0;
      samples.push({ x, z, level, distance, fall: slope > settings.waterfallSlope ? Math.min(1, slope / 2) : 0 });
      previous = level;
    }
  }
  const p = samples[samples.length - 1], end = points[points.length - 1];
  const level = Math.min(previous, ground(end[0], end[1]) - settings.depth * .22);
  const delta = p ? Math.hypot(end[0] - p.x, end[1] - p.z) : 0;
  samples.push({ x: end[0], z: end[1], level, distance: distance + delta,
    fall: p && (p.level - level) / Math.max(.01, delta) > settings.waterfallSlope ? 1 : 0 });
  return { id: water.id, settings, samples };
}

export function nearestWater(profile: WaterProfile, x: number, z: number): { distance: number; level: number } {
  const points = profile.samples;
  let distance = Infinity, level = 0;
  if (points.length === 1) return { distance: Math.hypot(x - points[0].x, z - points[0].z), level: points[0].level };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / Math.max(.0001, dx * dx + dz * dz)));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < distance) { distance = d; level = a.level + (b.level - a.level) * t; }
  }
  return { distance, level };
}

export function channelBed(profile: WaterProfile, x: number, z: number, ground: number): number {
  const hit = nearestWater(profile, x, z), radius = profile.settings.width / 2;
  if (hit.distance >= radius + profile.settings.bankWidth) return ground;
  if (hit.distance <= radius) {
    const t = hit.distance / radius;
    return Math.min(ground, hit.level - .035 - profile.settings.depth * (1 - t ** 4));
  }
  const t = (hit.distance - radius) / profile.settings.bankWidth;
  const feather = t * t * (3 - 2 * t);
  return Math.min(ground, hit.level - .035 + (ground - hit.level + .035) * feather);
}
