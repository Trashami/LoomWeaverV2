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

export type GlbLodManifest = Map<string, Partial<Record<GlbLodTier, string>>>;

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
      const normalizedUrl = v.url.replace(/^\/map-assets\//, '/assets/');
      const key = toBaseGlbUrl(normalizedUrl);
      map.set(key, { ...map.get(key), [v.quality]: normalizedUrl });
      const rawKey = toBaseGlbUrl(v.url);
      if (rawKey !== key) {
        map.set(rawKey, { ...map.get(rawKey), [v.quality]: normalizedUrl });
      }
    }
  }
  return map;
}

/** Ordered URLs to try for a base model: preferred tier in models-3d, nearest tiers, then the unsuffixed file. */
export function glbLodCandidates(url: string, tier: GlbLodTier, manifest?: ReadonlyMap<string, Partial<Record<GlbLodTier, string>>>): string[] {
  const base = toBaseGlbUrl(url);
  const directTierUrls = TIER_FALLBACK[tier].map((t) => resolveGlbLodUrl(base, t));
  const known = manifest?.get(base);
  if (known) {
    const listed = TIER_FALLBACK[tier].map((t) => known[t]).filter((u): u is string => !!u);
    return Array.from(new Set([...listed, ...directTierUrls, base]));
  }
  return Array.from(new Set([...directTierUrls, base]));
}

/** Resolves `name.glb` to `name_<tier>.glb`. */
export function resolveGlbLodUrl(url: string, tier: GlbLodTier): string {
  if (!url.toLowerCase().endsWith('.glb')) return url;
  return `${toBaseGlbUrl(url).slice(0, -'.glb'.length)}_${tier}.glb`;
}

/** Resolves 2D stamp/texture URLs that use `/128/`, `/256/`, `/512/` resolution folders to match the active LOD tier. */
export function resolveTextureLodUrl(url: string, tier: GlbLodTier): string {
  if (!url || !url.includes('/room-bundles-v1/')) return url;
  const folder = tier === 'low' ? '128' : tier === 'mid' ? '256' : '512';
  return url.replace(/\/room-bundles-v1\/(128|256|512)\//, `/room-bundles-v1/${folder}/`);
}
