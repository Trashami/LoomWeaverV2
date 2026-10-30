export type GlbLodTier = 'low' | 'mid' | 'high';

const LOD_SUFFIX = /_(low|mid|high)\.glb$/i;

/** Maps a viewport quality preset to the model detail tier. */
export function lodTierForQualityPreset(preset: string): GlbLodTier {
  switch (preset) {
    case 'Cinematic 3D':
      return 'high';
    case 'Performance 3D':
    case 'Classic 2D':
      return 'low';
    default:
      return 'mid';
  }
}

/** Strips any LOD suffix so map files only ever persist `name.glb`. */
export function toBaseGlbUrl(url: string): string {
  return url.replace(LOD_SUFFIX, '.glb');
}

/** Heavier tiers never stand in for a lighter request, so Performance never loads HQ files. */
const TIER_FALLBACK: Record<GlbLodTier, readonly GlbLodTier[]> = {
  high: ['high', 'mid', 'low'],
  mid: ['mid', 'low'],
  low: ['low', 'mid'],
};

export type GlbLodManifest = ReadonlyMap<string, Partial<Record<GlbLodTier, string>>>;

export interface ModelManifestResponse {
  readonly models?: ReadonlyArray<{
    readonly variants?: ReadonlyArray<{ readonly quality: string; readonly url: string }>;
  }>;
}

/** Indexes manifest variants by their extensionless-tier base URL (`/x/name.glb`). */
export function buildGlbLodManifest(res: ModelManifestResponse | null | undefined): GlbLodManifest {
  const map = new Map<string, Partial<Record<GlbLodTier, string>>>();
  for (const model of res?.models ?? []) {
    for (const v of model.variants ?? []) {
      if (v.quality !== 'low' && v.quality !== 'mid' && v.quality !== 'high') continue;
      const key = toBaseGlbUrl(v.url);
      map.set(key, { ...map.get(key), [v.quality]: v.url });
    }
  }
  return map;
}

/** Ordered URLs to try for a base model: preferred tier, nearest tiers, then the unsuffixed file. */
export function glbLodCandidates(url: string, tier: GlbLodTier, manifest?: GlbLodManifest): string[] {
  const base = toBaseGlbUrl(url);
  const known = manifest?.get(base);
  if (known) {
    const listed = TIER_FALLBACK[tier].map((t) => known[t]).filter((u): u is string => !!u);
    return [...listed, base];
  }
  return [...TIER_FALLBACK[tier].map((t) => resolveGlbLodUrl(base, t)), base];
}

/** Resolves `name.glb` to `name_<tier>.glb`. */
export function resolveGlbLodUrl(url: string, tier: GlbLodTier): string {
  if (!url.toLowerCase().endsWith('.glb')) return url;
  return `${toBaseGlbUrl(url).slice(0, -'.glb'.length)}_${tier}.glb`;
}
