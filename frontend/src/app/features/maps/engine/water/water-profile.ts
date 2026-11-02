import type { WaterSplineNode } from '../map-scene-contract';
import { DEFAULT_WATER, normalizeWater, WaterSettings } from './water-settings';

export interface WaterSample {
  x: number;
  z: number;
  level: number;
  distance: number;
  fall: number;
  dx?: number;
  dz?: number;
}

export interface WaterProfile {
  id: string;
  settings: WaterSettings;
  samples: WaterSample[];
}

export type GroundSampler = (x: number, z: number) => number;

const MAP_HALF_W = 18;
const MAP_HALF_H = 13.5;

function clampToMapBounds(x: number, z: number): [number, number] {
  return [
    Math.max(-MAP_HALF_W, Math.min(MAP_HALF_W, x)),
    Math.max(-MAP_HALF_H, Math.min(MAP_HALF_H, z)),
  ];
}

export function settingsForWater(water: WaterSplineNode): WaterSettings {
  return normalizeWater(
    water.settings ?? {
      ...DEFAULT_WATER,
      width: water.width,
      flowSpeed: water.flowSpeed ?? DEFAULT_WATER.flowSpeed,
      mode: water.points.length === 1 ? 'pond' : 'river',
      shallowColor: water.colorHex || DEFAULT_WATER.shallowColor,
    },
  );
}

/**
 * Resamples a water centreline with smooth Chaikin curves and clamps to map bounds.
 * Switching `settings.mode` to `'pond'` preserves the entire drawn path and only zeroes flow/waterfalls.
 */
export function buildWaterProfile(water: WaterSplineNode, ground: GroundSampler): WaterProfile {
  const settings = settingsForWater(water);
  let points = water.points
    .filter((p) => p.every(Number.isFinite))
    .map((p) => clampToMapBounds(p[0], p[2]));
  points = points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.05,
  );
  if (!points.length) return { id: water.id, settings, samples: [] };

  // Only a single-click point (points.length === 1) is a circular point-basin;
  // multi-point paths always preserve their full drawn shape in both 'river' and 'pond' modes.
  if (points.length === 1) {
    const [x, z] = points[0];
    const r = settings.width / 2;
    const rim = Array.from({ length: 24 }, (_, i) =>
      ground(
        x + Math.cos((i / 24) * Math.PI * 2) * r,
        z + Math.sin((i / 24) * Math.PI * 2) * r,
      ),
    );
    const level = Math.min(ground(x, z), ...rim) - settings.depth * 0.22;
    return {
      id: water.id,
      settings,
      samples: [{ x, z, level, distance: 0, fall: 0, dx: 1, dz: 0 }],
    };
  }

  const isStillPond = settings.mode === 'pond' || settings.flowSpeed <= 0.01;
  const last = points[points.length - 1];
  if (!isStillPond && ground(points[0][0], points[0][1]) < ground(last[0], last[1])) {
    points.reverse();
  }

  // Three Chaikin corner-cutting passes produce natural, organic curves without polygonal kinks.
  let smooth: [number, number][] = points;
  for (let pass = 0; pass < 3; pass++) {
    const next: [number, number][] = [smooth[0]];
    for (let i = 0; i < smooth.length - 1; i++) {
      const a = smooth[i];
      const b = smooth[i + 1];
      next.push(
        clampToMapBounds(a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25),
        clampToMapBounds(a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75),
      );
    }
    next.push(smooth[smooth.length - 1]);
    smooth = next;
  }

  const samples: WaterSample[] = [];
  let distance = 0;
  let previous = Infinity;

  for (let i = 0; i < smooth.length - 1 && samples.length < 1024; i++) {
    const a = smooth[i];
    const b = smooth[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / 0.28));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const [x, z] = clampToMapBounds(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      const raw = ground(x, z) - settings.depth * 0.22;
      const level = Math.min(previous, raw);
      const p = samples[samples.length - 1];
      const delta = p ? Math.hypot(x - p.x, z - p.z) : 0;
      if (p && delta < 0.1) continue;
      distance += delta;
      const slope = p ? (p.level - level) / Math.max(0.01, delta) : 0;
      samples.push({
        x,
        z,
        level,
        distance,
        fall:
          !isStillPond && slope > settings.waterfallSlope * 0.7
            ? Math.min(1, slope / 1.6)
            : 0,
      });
      previous = level;
    }
  }

  const p = samples[samples.length - 1];
  const end = smooth[smooth.length - 1];
  const level = Math.min(previous, ground(end[0], end[1]) - settings.depth * 0.22);
  const delta = p ? Math.hypot(end[0] - p.x, end[1] - p.z) : 0;
  if (!p || delta >= 0.04) {
    samples.push({
      x: end[0],
      z: end[1],
      level,
      distance: distance + delta,
      fall:
        !isStillPond &&
        p &&
        (p.level - level) / Math.max(0.01, delta) > settings.waterfallSlope * 0.7
          ? 1
          : 0,
    });
  }

  // Compute smoothed flow tangents (dx, dz) and continuous waterfall/rapids energy along the profile.
  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    const prevIdx = Math.max(0, i - 2);
    const nextIdx = Math.min(samples.length - 1, i + 2);
    const vx = samples[nextIdx].x - samples[prevIdx].x;
    const vz = samples[nextIdx].z - samples[prevIdx].z;
    const vLen = Math.hypot(vx, vz) || 1;
    samples[i].dx = vx / vLen;
    samples[i].dz = vz / vLen;

    if (isStillPond) {
      samples[i].fall = 0;
      continue;
    }

    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(samples.length - 1, i + 1)];
    const slope = Math.max(0, (a.level - b.level) / Math.max(0.01, b.distance - a.distance));
    const local = Math.max(
      0,
      Math.min(1, (slope - 0.03) / Math.max(0.16, settings.waterfallSlope * 0.85)),
    );
    const step = i ? samples[i].distance - samples[i - 1].distance : 0;
    energy = Math.max(local, energy * Math.exp(-step / Math.max(0.75, settings.width * 0.65)));
    samples[i].fall = energy;
  }

  return { id: water.id, settings, samples };
}

export function nearestWater(
  profile: WaterProfile,
  x: number,
  z: number,
): { distance: number; level: number } {
  const points = profile.samples;
  let distance = Infinity;
  let level = 0;
  if (points.length === 1) {
    return {
      distance: Math.hypot(x - points[0].x, z - points[0].z),
      level: points[0].level,
    };
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / Math.max(0.0001, dx * dx + dz * dz)),
    );
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < distance) {
      distance = d;
      level = a.level + (b.level - a.level) * t;
    }
  }
  return { distance, level };
}

export function channelBed(profile: WaterProfile, x: number, z: number, ground: number): number {
  const hit = nearestWater(profile, x, z);
  const radius = profile.settings.width / 2;
  if (hit.distance >= radius + profile.settings.bankWidth) return ground;
  if (hit.distance <= radius) {
    const t = hit.distance / radius;
    return hit.level - profile.settings.depth * (1 - t * t);
  }
  const t = (hit.distance - radius) / Math.max(0.05, profile.settings.bankWidth);
  const smooth = t * t * (3 - 2 * t);
  return hit.level + (ground - hit.level) * smooth;
}
