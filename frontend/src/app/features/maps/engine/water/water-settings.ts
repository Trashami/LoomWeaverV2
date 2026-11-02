export type WaterMode = 'river' | 'pond';

export interface WaterSettings {
  readonly mode: WaterMode;
  readonly width: number;
  readonly depth: number;
  readonly bankWidth: number;
  readonly bankFeathering: number;
  readonly flowSpeed: number;
  readonly intensity: number;
  readonly waveHeight: number;
  readonly waveScale: number;
  readonly foam: number;
  readonly opacity: number;
  readonly reflectivity: number;
  readonly refraction: number;
  readonly waterfallSlope: number;
  readonly spray: number;
  readonly shallowColor: string;
  readonly deepColor: string;
}

export const DEFAULT_WATER: WaterSettings = {
  mode: 'river',
  width: 3,
  depth: 0.9,
  bankWidth: 1,
  bankFeathering: 75,
  flowSpeed: 1.4,
  intensity: 0.65,
  waveHeight: 0.045,
  waveScale: 2.5,
  foam: 0.55,
  opacity: 0.85,
  reflectivity: 0.45,
  refraction: 0.12,
  waterfallSlope: 0.65,
  spray: 0.5,
  shallowColor: '#44aeb0',
  deepColor: '#0b344b',
};

export interface WaterPresetItem {
  readonly name: string;
  readonly settings: WaterSettings;
}

export const WATER_PRESETS: readonly WaterPresetItem[] = [
  {
    name: 'Clear stream',
    settings: DEFAULT_WATER,
  },
  {
    name: 'Still pond',
    settings: {
      ...DEFAULT_WATER,
      mode: 'pond',
      flowSpeed: 0,
      intensity: 0.15,
      waveHeight: 0.012,
      waveScale: 1.8,
      foam: 0.12,
      reflectivity: 0.72,
      shallowColor: '#3a98a8',
      deepColor: '#08293b',
    },
  },
  {
    name: 'Mountain rapids',
    settings: {
      ...DEFAULT_WATER,
      mode: 'river',
      flowSpeed: 3.4,
      intensity: 1.85,
      waveHeight: 0.11,
      waveScale: 3.8,
      foam: 0.95,
      spray: 0.9,
      depth: 1.3,
      shallowColor: '#5fd4e8',
      deepColor: '#12486b',
    },
  },
  {
    name: 'Murky marsh',
    settings: {
      ...DEFAULT_WATER,
      mode: 'pond',
      flowSpeed: 0,
      intensity: 0.12,
      waveHeight: 0.008,
      waveScale: 1.5,
      foam: 0.22,
      opacity: 0.96,
      reflectivity: 0.28,
      shallowColor: '#667e4a',
      deepColor: '#1e3322',
    },
  },
  {
    name: 'Crystal lagoon',
    settings: {
      ...DEFAULT_WATER,
      mode: 'river',
      flowSpeed: 0.6,
      intensity: 0.35,
      waveHeight: 0.025,
      waveScale: 2.2,
      foam: 0.38,
      opacity: 0.74,
      reflectivity: 0.64,
      refraction: 0.24,
      shallowColor: '#56f0d8',
      deepColor: '#0e5a7a',
    },
  },
  {
    name: 'Arcane mire',
    settings: {
      ...DEFAULT_WATER,
      mode: 'pond',
      flowSpeed: 0,
      intensity: 0.3,
      waveHeight: 0.02,
      waveScale: 2.0,
      foam: 0.32,
      opacity: 0.94,
      reflectivity: 0.58,
      shallowColor: '#b83248',
      deepColor: '#2b0912',
    },
  },
];

export function normalizeWater(settings: Partial<WaterSettings>): WaterSettings {
  const s = { ...DEFAULT_WATER, ...settings };
  const clamp = (v: number, a: number, b: number) =>
    Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  return {
    ...s,
    mode: s.mode === 'pond' ? 'pond' : 'river',
    width: clamp(s.width, 1, 14),
    depth: clamp(s.depth, 0.15, 4),
    bankWidth: clamp(s.bankWidth, 0.2, 4),
    bankFeathering: clamp(s.bankFeathering, 0, 100),
    flowSpeed: clamp(s.flowSpeed, 0, 5),
    intensity: clamp(s.intensity, 0, 2),
    waveHeight: clamp(s.waveHeight, 0, 0.18),
    waveScale: clamp(s.waveScale, 0.5, 8),
    foam: clamp(s.foam, 0, 1),
    opacity: clamp(s.opacity, 0.2, 1),
    reflectivity: clamp(s.reflectivity, 0, 1),
    refraction: clamp(s.refraction, 0, 0.3),
    waterfallSlope: clamp(s.waterfallSlope, 0.2, 2),
    spray: clamp(s.spray, 0, 1),
    shallowColor: /^#[0-9a-f]{6}$/i.test(s.shallowColor)
      ? s.shallowColor
      : DEFAULT_WATER.shallowColor,
    deepColor: /^#[0-9a-f]{6}$/i.test(s.deepColor) ? s.deepColor : DEFAULT_WATER.deepColor,
  };
}
