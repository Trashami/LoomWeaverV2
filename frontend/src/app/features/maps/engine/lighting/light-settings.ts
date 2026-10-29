export type MapLightKind = 'point' | 'spot' | 'aoe';
export type LegacyMapLightKind = 'torch' | 'candle' | 'lantern' | 'spotlight' | 'area' | 'glow';
export type LightFalloff = 'linear' | 'natural';
export type LightShadowMode = 'none' | 'soft' | 'hard';
export type AoeEffectKind = 'glow' | 'fireflies' | 'sparkles' | 'motes' | 'firework';

/** Every editable light property. Persisted fields are optional on the scene node for older maps. */
export interface LightSettings {
  readonly kind: MapLightKind;
  readonly y: number;
  readonly range: number;
  readonly intensity: number;
  readonly colorHex: string;
  readonly coreColorHex: string;
  readonly coreIntensity: number;
  readonly coreRadiusPct: number;
  readonly falloff: LightFalloff;
  readonly featherPct: number;
  readonly shadowMode: LightShadowMode;
  readonly shadowStrengthPct: number;
  readonly omnidirectional: boolean;
  readonly coneAngleDeg: number;
  readonly coneSoftnessPct: number;
  readonly aimYawDeg: number;
  readonly aimPitchDeg: number;
  readonly flicker: boolean;
  readonly flickerPct: number;
  readonly effect: AoeEffectKind;
  readonly effectCount: number;
  readonly effectSizeM: number;
  readonly effectSpeed: number;
  readonly effectSpreadM: number;
  readonly effectColorHex: string;
}

export const DEFAULT_LIGHT_SETTINGS: LightSettings = {
  kind: 'point',
  y: 2.4,
  range: 25,
  intensity: 1.25,
  colorHex: '#ffae52',
  coreColorHex: '#fff1c9',
  coreIntensity: 0.6,
  coreRadiusPct: 20,
  falloff: 'linear',
  featherPct: 40,
  shadowMode: 'none',
  shadowStrengthPct: 70,
  omnidirectional: false,
  coneAngleDeg: 55,
  coneSoftnessPct: 40,
  aimYawDeg: 0,
  aimPitchDeg: -60,
  flicker: false,
  flickerPct: 25,
  effect: 'fireflies',
  effectCount: 24,
  effectSizeM: 0.12,
  effectSpeed: 1,
  effectSpreadM: 3,
  effectColorHex: '#c6ff7a',
};

export interface LightPreset {
  readonly label: string;
  readonly patch: Partial<LightSettings>;
}

export const POINT_LIGHT_PRESETS: readonly LightPreset[] = [
  { label: 'Candle', patch: { y: 0.4, range: 6, intensity: 0.7, coreRadiusPct: 25, featherPct: 55, flicker: true, flickerPct: 30, colorHex: '#ffb45e' } },
  { label: 'Torch', patch: { y: 2.0, range: 20, intensity: 1.25, coreRadiusPct: 20, featherPct: 40, flicker: true, flickerPct: 22, colorHex: '#ffae52' } },
  { label: 'Lantern', patch: { y: 1.2, range: 14, intensity: 1.0, coreRadiusPct: 25, featherPct: 45, flicker: false, colorHex: '#ffd38a' } },
  { label: 'Lamp post', patch: { y: 3.6, range: 35, intensity: 1.4, coreRadiusPct: 15, featherPct: 55, flicker: false, colorHex: '#ffe2a8' } },
  { label: 'Bonfire', patch: { y: 1.0, range: 60, intensity: 1.8, coreRadiusPct: 25, featherPct: 60, flicker: true, flickerPct: 35, colorHex: '#ff8a3d' } },
];

export const SPOT_LIGHT_PRESETS: readonly LightPreset[] = [
  { label: 'Flashlight', patch: { omnidirectional: false, coneAngleDeg: 22, coneSoftnessPct: 35, range: 40, aimPitchDeg: -20 } },
  { label: 'Floodlight', patch: { omnidirectional: false, coneAngleDeg: 110, coneSoftnessPct: 55, range: 45, aimPitchDeg: -45 } },
  { label: 'Half circle (180)', patch: { omnidirectional: false, coneAngleDeg: 180, coneSoftnessPct: 50, aimPitchDeg: -10 } },
  { label: 'All directions (360)', patch: { omnidirectional: true } },
];

export interface AoePreset extends LightPreset {
  readonly effect: AoeEffectKind;
}

export const AOE_PRESETS: readonly AoePreset[] = [
  { label: 'Fireflies', effect: 'fireflies', patch: { effect: 'fireflies', colorHex: '#c6ff7a', effectColorHex: '#d8ff8a', effectCount: 24, effectSizeM: 0.12, effectSpeed: 0.8, effectSpreadM: 3, intensity: 0.5, range: 8 } },
  { label: 'Fey mushroom glow', effect: 'glow', patch: { effect: 'glow', colorHex: '#49e892', effectColorHex: '#49e892', effectCount: 6, effectSizeM: 0.9, effectSpeed: 0.4, effectSpreadM: 1.2, intensity: 0.9, range: 6 } },
  { label: 'Sparkles', effect: 'sparkles', patch: { effect: 'sparkles', colorHex: '#bfe9ff', effectColorHex: '#ffffff', effectCount: 60, effectSizeM: 0.06, effectSpeed: 1.4, effectSpreadM: 2.5, intensity: 0.6, range: 7 } },
  { label: 'Spirit motes', effect: 'motes', patch: { effect: 'motes', colorHex: '#9b8cff', effectColorHex: '#c9b8ff', effectCount: 30, effectSizeM: 0.25, effectSpeed: 0.35, effectSpreadM: 4, intensity: 0.5, range: 9 } },
  { label: 'Firework', effect: 'firework', patch: { effect: 'firework', colorHex: '#ffd269', effectColorHex: '#ff5d8f', effectCount: 90, effectSizeM: 0.1, effectSpeed: 1.2, effectSpreadM: 3, intensity: 1.2, range: 30 } },
];

const LEGACY_KIND_MAP: Readonly<Record<string, MapLightKind>> = {
  torch: 'point',
  candle: 'point',
  lantern: 'point',
  spotlight: 'spot',
  area: 'spot',
  glow: 'aoe',
};

export function normalizeLightKind(kind: string | undefined): MapLightKind {
  if (kind === 'point' || kind === 'spot' || kind === 'aoe') return kind;
  return (kind && LEGACY_KIND_MAP[kind]) || 'point';
}

type LightNodeLike = Partial<Omit<LightSettings, 'kind'>> & { readonly kind?: string };

/** Merges a stored node over the defaults, so maps saved before these settings existed still render. */
export function resolveLightSettings(node: LightNodeLike): LightSettings {
  const kind = normalizeLightKind(node.kind);
  const merged: Record<string, unknown> = { ...DEFAULT_LIGHT_SETTINGS };
  for (const [key, value] of Object.entries(node)) {
    if (value !== undefined && key in DEFAULT_LIGHT_SETTINGS) merged[key] = value;
  }
  return { ...(merged as unknown as LightSettings), kind };
}

/** Elevation step: whole-cell thirds with snapping on, fine-grained with it off. */
export function lightElevationStep(snapToGrid: boolean): number {
  return snapToGrid ? 0.5 : 0.05;
}

export function snapLightElevation(y: number, snapToGrid: boolean): number {
  const step = lightElevationStep(snapToGrid);
  return Math.max(0, Math.round(y / step) * step);
}
