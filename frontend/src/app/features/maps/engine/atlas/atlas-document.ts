export type AtlasTool = 'navigate' | 'raise' | 'lower' | 'smooth' | 'flatten' | 'mountains' | 'biome' | 'location';
export type AtlasMarkerKind = 'city' | 'town' | 'village' | 'castle' | 'ruin' | 'landmark';
export interface AtlasMarker {
  id: string; locationKey: string; name: string; kind: AtlasMarkerKind;
  x: number; z: number; color: string; visibility: 'gm' | 'players';
}
export interface AtlasDocument {
  previewDataUrl?: string;
  schemaVersion: 1; id: string; revision: number; name: string; seed: number;
  resolution: number; widthKm: number; heightKm: number; seaLevel: number;
  heights: number[]; biomes: number[]; markers: AtlasMarker[];
}
export interface AtlasBrush { radius: number; strength: number; feather: number; biome: number; flattenHeight: number; }
export interface AtlasLocation { locationKey: string; name: string; locationType: string; visibility: 'gm' | 'players'; }
export const ATLAS_BIOMES = [
  { name: 'Natural', color: '#72834b' }, { name: 'Grassland', color: '#78934c' },
  { name: 'Forest', color: '#294f38' }, { name: 'Desert', color: '#c8ac70' },
  { name: 'Tundra', color: '#a7b5ab' }, { name: 'Volcanic', color: '#57433e' },
  { name: 'Wetland', color: '#4d7060' },
] as const;
export const DEFAULT_ATLAS_BRUSH: AtlasBrush = { radius: 9, strength: .35, feather: .75, biome: 1, flattenHeight: .2 };
export const ATLAS_SIZE = 240;
export const ATLAS_RELIEF = 42;
export function cloneAtlas(doc: AtlasDocument): AtlasDocument { return structuredClone(doc); }
export function validateAtlas(value: unknown): AtlasDocument {
  const d = value as AtlasDocument;
  if (!d || d.schemaVersion !== 1 || !Number.isInteger(d.resolution) || d.resolution < 32 || d.resolution > 256
    || !Number.isInteger(d.revision) || d.revision<0 || !Number.isInteger(d.seed) || Math.abs(d.seed)>2147483647
    || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 160 || !/^[\w-]{1,58}$/.test(d.id)
    || !Number.isFinite(d.widthKm) || d.widthKm < 10 || d.widthKm > 20000
    || !Number.isFinite(d.heightKm) || d.heightKm < 10 || d.heightKm > 20000
    || d.widthKm/d.heightKm < .125 || d.widthKm/d.heightKm > 8
    || !Number.isFinite(d.seaLevel) || d.seaLevel < -.8 || d.seaLevel > 1
    || !Array.isArray(d.heights) || d.heights.length !== (d.resolution + 1) ** 2
    || !d.heights.every(h => Number.isFinite(h) && h >= -1 && h <= 3)
    || !Array.isArray(d.biomes) || d.biomes.length !== d.heights.length
    || !d.biomes.every(b => Number.isInteger(b) && b >= 0 && b < ATLAS_BIOMES.length)
    || !Array.isArray(d.markers) || d.markers.length > 500) throw new Error('This is not a supported World Atlas file.');
  const keys = new Set<string>(), ids=new Set<string>();
  for (const m of d.markers) {
    if (!m || !/^[\w-]{1,64}$/.test(m.id) || !/^[\w-]{1,64}$/.test(m.locationKey) || keys.has(m.locationKey)
      || ids.has(m.id) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 160
      || !['city','town','village','castle','ruin','landmark'].includes(m.kind)
      || !/^#[\da-f]{6}$/i.test(m.color) || !['gm','players'].includes(m.visibility)
      || !Number.isFinite(m.x) || !Number.isFinite(m.z) || Math.abs(m.x) > 120 || Math.abs(m.z) > 120)
      throw new Error('The atlas contains invalid or duplicate locations.');
    keys.add(m.locationKey);ids.add(m.id);
  }
  return d;
}
