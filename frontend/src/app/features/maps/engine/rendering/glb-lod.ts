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

/** Resolves `name.glb` to `name_<tier>.glb`. */
export function resolveGlbLodUrl(url: string, tier: GlbLodTier): string {
  if (!url.toLowerCase().endsWith('.glb')) return url;
  return `${toBaseGlbUrl(url).slice(0, -'.glb'.length)}_${tier}.glb`;
}
