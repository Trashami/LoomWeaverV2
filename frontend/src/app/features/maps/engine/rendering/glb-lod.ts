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

const TIER_FALLBACK: Record<GlbLodTier, readonly GlbLodTier[]> = {
  high: ['high', 'mid', 'low'],
  mid: ['mid', 'low', 'high'],
  low: ['low', 'mid', 'high'],
};

/** Ordered URLs to try for a base model: preferred tier, nearest tiers, then the unsuffixed file. */
export function glbLodCandidates(url: string, tier: GlbLodTier): string[] {
  const base = toBaseGlbUrl(url);
  return [...TIER_FALLBACK[tier].map((t) => resolveGlbLodUrl(base, t)), base];
}

/** Resolves `name.glb` to `name_<tier>.glb`. */
export function resolveGlbLodUrl(url: string, tier: GlbLodTier): string {
  if (!url.toLowerCase().endsWith('.glb')) return url;
  return `${toBaseGlbUrl(url).slice(0, -'.glb'.length)}_${tier}.glb`;
}
