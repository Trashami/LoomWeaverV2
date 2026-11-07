export type GlbLodTier = 'low' | 'mid' | 'high';

const LOD_SUFFIX = /_(low|mid|high)\.glb$/i;

/** Maps a viewport quality preset or VTT quality setting to the 3D model detail tier. */
export function lodTierForQualityPreset(preset: string): GlbLodTier {
  const p = (preset || '').trim().toLowerCase();
  if (p === 'cinematic 3d' || p === 'visual' || p === 'high' || p.includes('cinematic')) {
    return 'high';
  }
  if (
    p === 'performance 3d' ||
    p === 'classic 2d' ||
    p === 'performance' ||
    p === 'low' ||
    p.includes('performance') ||
    p.includes('classic')
  ) {
    return 'low';
  }
  return 'mid';
}

export function studioPresetToVttQuality(
  preset: string,
): 'performance' | 'balanced' | 'visual' {
  const tier = lodTierForQualityPreset(preset);
  if (tier === 'high') return 'visual';
  if (tier === 'low') return 'performance';
  return 'balanced';
}

export function vttQualityToStudioPreset(
  quality: string,
): 'Performance 3D' | 'Balanced 3D' | 'Cinematic 3D' {
  const q = (quality || '').trim().toLowerCase();
  if (q === 'visual' || q === 'high') return 'Cinematic 3D';
  if (q === 'performance' || q === 'low') return 'Performance 3D';
  return 'Balanced 3D';
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
    if (listed.length > 0) {
      return Array.from(new Set([...listed, ...directTierUrls]));
    }
    return Array.from(new Set([...directTierUrls, base]));
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
