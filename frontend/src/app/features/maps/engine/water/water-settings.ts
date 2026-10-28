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
  mode: 'river', width: 3, depth: .9, bankWidth: 1, bankFeathering: 75, flowSpeed: 1.4,
  intensity: .65, waveHeight: .045, waveScale: 2.5, foam: .55,
  opacity: .85, reflectivity: .45, refraction: .12, waterfallSlope: .65,
  spray: .5, shallowColor: '#44aeb0', deepColor: '#0b344b',
};
export const WATER_PRESETS: readonly { name: string; settings: WaterSettings }[] = [
  { name: 'Clear stream', settings: DEFAULT_WATER },
  { name: 'Still pond', settings: { ...DEFAULT_WATER, mode: 'pond', flowSpeed: 0,
    intensity: .15, waveHeight: .012, foam: .12, reflectivity: .65 } },
  { name: 'Mountain rapids', settings: { ...DEFAULT_WATER, flowSpeed: 2.8,
    intensity: 1.6, waveHeight: .09, foam: .9, spray: .85, depth: 1.3 } },
  { name: 'Murky marsh', settings: { ...DEFAULT_WATER, mode: 'pond', flowSpeed: 0,
    intensity: .1, waveHeight: .008, opacity: .96, shallowColor: '#667e4a', deepColor: '#20372a' } },
];

export function normalizeWater(settings: Partial<WaterSettings>): WaterSettings {
  const s = { ...DEFAULT_WATER, ...settings };
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
  return { ...s, mode: s.mode === 'pond' ? 'pond' : 'river', width: clamp(s.width, 1, 14),
    depth: clamp(s.depth, .15, 4), bankWidth: clamp(s.bankWidth, .2, 4),
    bankFeathering: clamp(s.bankFeathering, 0, 100), flowSpeed: clamp(s.flowSpeed, 0, 5), intensity: clamp(s.intensity, 0, 2),
    waveHeight: clamp(s.waveHeight, 0, .18), waveScale: clamp(s.waveScale, .5, 8),
    foam: clamp(s.foam, 0, 1), opacity: clamp(s.opacity, .2, 1),
    reflectivity: clamp(s.reflectivity, 0, 1), refraction: clamp(s.refraction, 0, .3),
    waterfallSlope: clamp(s.waterfallSlope, .2, 2), spray: clamp(s.spray, 0, 1),
    shallowColor: /^#[0-9a-f]{6}$/i.test(s.shallowColor) ? s.shallowColor : DEFAULT_WATER.shallowColor,
    deepColor: /^#[0-9a-f]{6}$/i.test(s.deepColor) ? s.deepColor : DEFAULT_WATER.deepColor,
  };
}
