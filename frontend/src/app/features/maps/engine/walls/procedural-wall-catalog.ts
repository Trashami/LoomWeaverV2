import { LwMapPngAssetItem } from '../../../../shared/ui/map-png-asset-browser/map-png-asset-browser.component';

export type ProceduralWallPattern =
  | 'dungeon_stone'
  | 'castle_ashlar'
  | 'red_brick'
  | 'cavern_rock'
  | 'elvish_marble'
  | 'arcane_obsidian'
  | 'industrial_iron'
  | 'nobility_manor'
  | 'wood_home'
  | 'shack_wood';

export interface ProceduralWallStyleSpec {
  readonly id: string;
  readonly name: string;
  readonly pattern: ProceduralWallPattern;
  readonly baseColorHex: string;
  readonly secondaryColorHex: string;
  readonly mortarColorHex: string;
  readonly accentColorHex: string;
  readonly plinthColorHex: string;
  readonly reliefMeters: number;
  readonly tileWidthMeters: number;
  readonly tileHeightMeters: number;
  readonly roughness: number;
  readonly metallic: number;
  readonly emissiveHex?: string;
  readonly BackingAlbedoUrl?: string;
  readonly BackingNormalUrl?: string;
}

export type ProceduralDoorArchitecturalStyle =
  | 'dungeon'
  | 'arcane'
  | 'elvish'
  | 'industrial'
  | 'nobility'
  | 'wood-home'
  | 'shack'
  | 'bars'
  | 'archway';

export interface ProceduralDoorStyleSpec {
  readonly id: string;
  readonly style: ProceduralDoorArchitecturalStyle;
  readonly name: string;
  readonly subtitle: string;
  readonly frameColorHex: string;
  readonly leafColorHex: string;
  readonly hardwareColorHex: string;
  readonly roughness: number;
  readonly metallic: number;
  readonly emissiveHex?: string;
  readonly hasArchTop: boolean;
}

export const PROCEDURAL_WALL_STYLES: readonly ProceduralWallStyleSpec[] = [
  {
    id: 'proc-wall-dungeon-stone',
    name: 'Aged Dungeon Stone',
    pattern: 'dungeon_stone',
    baseColorHex: '#686154',
    secondaryColorHex: '#4f493e',
    mortarColorHex: '#24211c',
    accentColorHex: '#5b5346',
    plinthColorHex: '#3d3931',
    reliefMeters: 0.055,
    tileWidthMeters: 2.4,
    tileHeightMeters: 2.0,
    roughness: 0.82,
    metallic: 0.05,
    BackingAlbedoUrl: '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone.png',
    BackingNormalUrl: '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone_normal.png',
  },
  {
    id: 'proc-wall-castle-ashlar',
    name: 'Castle Ashlar Masonry',
    pattern: 'castle_ashlar',
    baseColorHex: '#736c5f',
    secondaryColorHex: '#5a5449',
    mortarColorHex: '#2b2823',
    accentColorHex: '#827a6c',
    plinthColorHex: '#454038',
    reliefMeters: 0.045,
    tileWidthMeters: 2.6,
    tileHeightMeters: 2.0,
    roughness: 0.78,
    metallic: 0.06,
  },
  {
    id: 'proc-wall-red-brick',
    name: 'Sewer & Cellar Red Brick',
    pattern: 'red_brick',
    baseColorHex: '#7c382c',
    secondaryColorHex: '#5e281f',
    mortarColorHex: '#36322e',
    accentColorHex: '#47211b',
    plinthColorHex: '#2e2927',
    reliefMeters: 0.038,
    tileWidthMeters: 2.0,
    tileHeightMeters: 1.8,
    roughness: 0.84,
    metallic: 0.04,
  },
  {
    id: 'proc-wall-cavern-rock',
    name: 'Rough Cavern & Hewn Rock',
    pattern: 'cavern_rock',
    baseColorHex: '#46413b',
    secondaryColorHex: '#302c27',
    mortarColorHex: '#181512',
    accentColorHex: '#595249',
    plinthColorHex: '#24201c',
    reliefMeters: 0.085,
    tileWidthMeters: 2.8,
    tileHeightMeters: 2.4,
    roughness: 0.90,
    metallic: 0.03,
  },
  {
    id: 'proc-wall-elvish-marble',
    name: 'Elvish Silverleaf Marble',
    pattern: 'elvish_marble',
    baseColorHex: '#d5ddd8',
    secondaryColorHex: '#bcc8c1',
    mortarColorHex: '#7a8a80',
    accentColorHex: '#d4b26f',
    plinthColorHex: '#9aa8a0',
    reliefMeters: 0.032,
    tileWidthMeters: 2.4,
    tileHeightMeters: 2.4,
    roughness: 0.42,
    metallic: 0.22,
  },
  {
    id: 'proc-wall-arcane-obsidian',
    name: 'Arcane Obsidian & Runes',
    pattern: 'arcane_obsidian',
    baseColorHex: '#1e1b29',
    secondaryColorHex: '#14111d',
    mortarColorHex: '#38bdf8',
    accentColorHex: '#a855f7',
    plinthColorHex: '#161321',
    reliefMeters: 0.048,
    tileWidthMeters: 2.4,
    tileHeightMeters: 2.2,
    roughness: 0.36,
    metallic: 0.35,
    emissiveHex: '#38bdf8',
  },
  {
    id: 'proc-wall-industrial-iron',
    name: 'Industrial Artificer Iron & Brass',
    pattern: 'industrial_iron',
    baseColorHex: '#383e42',
    secondaryColorHex: '#282d30',
    mortarColorHex: '#16191b',
    accentColorHex: '#b88644',
    plinthColorHex: '#222629',
    reliefMeters: 0.040,
    tileWidthMeters: 2.4,
    tileHeightMeters: 2.2,
    roughness: 0.46,
    metallic: 0.68,
  },
  {
    id: 'proc-wall-nobility-manor',
    name: 'Nobility Manor Wainscoting',
    pattern: 'nobility_manor',
    baseColorHex: '#cfc4b0',
    secondaryColorHex: '#523624',
    mortarColorHex: '#332014',
    accentColorHex: '#c8a25a',
    plinthColorHex: '#382316',
    reliefMeters: 0.030,
    tileWidthMeters: 2.2,
    tileHeightMeters: 2.4,
    roughness: 0.62,
    metallic: 0.12,
  },
  {
    id: 'proc-wall-wood-home',
    name: 'Tavern Half-Timber & Plaster',
    pattern: 'wood_home',
    baseColorHex: '#c8bca6',
    secondaryColorHex: '#4a3221',
    mortarColorHex: '#2b1c11',
    accentColorHex: '#63442d',
    plinthColorHex: '#362417',
    reliefMeters: 0.042,
    tileWidthMeters: 2.4,
    tileHeightMeters: 2.4,
    roughness: 0.78,
    metallic: 0.04,
  },
  {
    id: 'proc-wall-shack-wood',
    name: 'Weathered Shack Plank Wood',
    pattern: 'shack_wood',
    baseColorHex: '#5c4633',
    secondaryColorHex: '#473526',
    mortarColorHex: '#241a12',
    accentColorHex: '#6e553f',
    plinthColorHex: '#2e2218',
    reliefMeters: 0.048,
    tileWidthMeters: 2.2,
    tileHeightMeters: 2.0,
    roughness: 0.88,
    metallic: 0.02,
  },
];

export const PROCEDURAL_DOOR_STYLES: readonly ProceduralDoorStyleSpec[] = [
  {
    id: 'door-style-dungeon',
    style: 'dungeon',
    name: 'Dungeon Iron-Bound Oak Door',
    subtitle: 'Heavy arched oak planks with forged iron straps & stone casing',
    frameColorHex: '#484e4b',
    leafColorHex: '#4d3320',
    hardwareColorHex: '#232729',
    roughness: 0.78,
    metallic: 0.12,
    hasArchTop: true,
  },
  {
    id: 'door-style-arcane',
    style: 'arcane',
    name: 'Arcane Sanctum Runic Portal',
    subtitle: 'Obsidian & brass frame with glowing arcane ward sigils',
    frameColorHex: '#221d30',
    leafColorHex: '#181424',
    hardwareColorHex: '#c49a45',
    roughness: 0.42,
    metallic: 0.45,
    emissiveHex: '#38bdf8',
    hasArchTop: true,
  },
  {
    id: 'door-style-elvish',
    style: 'elvish',
    name: 'Elvish Silverleaf Arch Door',
    subtitle: 'Graceful pointed arch with carved silver-gold leaf tracery',
    frameColorHex: '#c8d2cc',
    leafColorHex: '#8c6d46',
    hardwareColorHex: '#d4b26f',
    roughness: 0.48,
    metallic: 0.28,
    emissiveHex: '#49e892',
    hasArchTop: true,
  },
  {
    id: 'door-style-industrial',
    style: 'industrial',
    name: 'Industrial Artificer Bulkhead',
    subtitle: 'Riveted steel & phosphor-bronze gear-locked vault door',
    frameColorHex: '#32383c',
    leafColorHex: '#454c52',
    hardwareColorHex: '#b88644',
    roughness: 0.44,
    metallic: 0.72,
    hasArchTop: false,
  },
  {
    id: 'door-style-nobility',
    style: 'nobility',
    name: 'Nobility Estate Mahogany Door',
    subtitle: 'Carved mahogany estate door with brass hardware & pediment',
    frameColorHex: '#d8cebe',
    leafColorHex: '#59291c',
    hardwareColorHex: '#d4af37',
    roughness: 0.52,
    metallic: 0.18,
    hasArchTop: false,
  },
  {
    id: 'door-style-wood-home',
    style: 'wood-home',
    name: 'Wood Home / Tavern Panel Door',
    subtitle: 'Warm timber casing with cross-buck wood leaf & iron latch',
    frameColorHex: '#4a3221',
    leafColorHex: '#6e4b30',
    hardwareColorHex: '#26292b',
    roughness: 0.76,
    metallic: 0.08,
    hasArchTop: false,
  },
  {
    id: 'door-style-shack',
    style: 'shack',
    name: 'Weathered Shack Plank Door',
    subtitle: 'Rough Z-brace barn planks with weathered iron hinges',
    frameColorHex: '#3d2d20',
    leafColorHex: '#594330',
    hardwareColorHex: '#2b241f',
    roughness: 0.88,
    metallic: 0.05,
    hasArchTop: false,
  },
  {
    id: 'door-style-bars',
    style: 'bars',
    name: 'Prison Iron Portcullis Gate',
    subtitle: 'Forged vertical iron bars set into heavy dungeon stone jambs',
    frameColorHex: '#484e4b',
    leafColorHex: '#25292c',
    hardwareColorHex: '#171a1c',
    roughness: 0.45,
    metallic: 0.78,
    hasArchTop: true,
  },
  {
    id: 'door-style-archway',
    style: 'archway',
    name: 'Open Stone Passage Archway',
    subtitle: 'Cased stone archway with keystone and clear walkthrough',
    frameColorHex: '#555b58',
    leafColorHex: '#3d423f',
    hardwareColorHex: '#6b726e',
    roughness: 0.75,
    metallic: 0.08,
    hasArchTop: true,
  },
];

export const PROCEDURAL_WALL_ASSET_ITEMS: readonly LwMapPngAssetItem[] = PROCEDURAL_WALL_STYLES.map((s) => ({
  id: s.id,
  name: s.name,
  category: 'Procedural 3D Walls',
  isFloor: false,
  isWall: true,
  toolRole: 'wall-texture' as const,
  modelUrl: '',
  thumbnailUrl: s.BackingAlbedoUrl || '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone.png',
  albedoUrl: `proc://${s.id}`,
  normalUrl: s.BackingNormalUrl || '',
  tags: ['wall', 'procedural', 'architecture', s.pattern.replace('_', ' ')],
}));

export const PROCEDURAL_DOOR_ASSET_ITEMS: readonly LwMapPngAssetItem[] = PROCEDURAL_DOOR_STYLES.map((d) => ({
  id: d.id,
  name: d.name,
  category: 'Doors & Portals',
  isFloor: false,
  isWall: false,
  modelUrl: `proc-door://${d.style}`,
  thumbnailUrl: '/assets/previews-png/obj-89c62a2b01238531.png',
  tags: ['architecture', 'door', 'portal', d.style],
}));

export function resolveProceduralWallStyle(
  wallOrId?:
    | string
    | {
        readonly id?: string;
        readonly material?: string;
        readonly albedoUrl?: string;
        readonly name?: string;
      },
  albedoUrl?: string,
  name?: string,
): ProceduralWallStyleSpec {
  const key =
    typeof wallOrId === 'object' && wallOrId !== null
      ? `${wallOrId.material ?? ''}|${wallOrId.albedoUrl ?? ''}|${wallOrId.name ?? ''}|${wallOrId.id ?? ''}`.toLowerCase()
      : `${wallOrId ?? ''}|${albedoUrl ?? ''}|${name ?? ''}`.toLowerCase();

  for (const s of PROCEDURAL_WALL_STYLES) {
    if (key.includes(s.id) || key.includes(s.name.toLowerCase()) || key.includes(s.pattern)) {
      return s;
    }
  }
  if (key.includes('brick')) return PROCEDURAL_WALL_STYLES[2];
  if (key.includes('cavern') || key.includes('basalt') || key.includes('rock')) return PROCEDURAL_WALL_STYLES[3];
  if (key.includes('elvish') || key.includes('marble')) return PROCEDURAL_WALL_STYLES[4];
  if (key.includes('arcane') || key.includes('obsidian')) return PROCEDURAL_WALL_STYLES[5];
  if (key.includes('industrial') || key.includes('iron')) return PROCEDURAL_WALL_STYLES[6];
  if (key.includes('nobility') || key.includes('manor')) return PROCEDURAL_WALL_STYLES[7];
  if (key.includes('timber') || key.includes('tavern') || key.includes('home')) return PROCEDURAL_WALL_STYLES[8];
  if (key.includes('shack') || key.includes('plank')) return PROCEDURAL_WALL_STYLES[9];
  if (key.includes('castle') || key.includes('ashlar')) return PROCEDURAL_WALL_STYLES[1];
  return PROCEDURAL_WALL_STYLES[0];
}

export function resolveProceduralDoorStyle(
  doorOrModelUrl?:
    | string
    | {
        readonly doorStyle?: string;
        readonly modelUrl?: string;
        readonly name?: string;
        readonly type?: string;
        readonly kind?: string;
      },
  name?: string,
  openingType?: string,
): ProceduralDoorStyleSpec {
  const key =
    typeof doorOrModelUrl === 'object' && doorOrModelUrl !== null
      ? `${doorOrModelUrl.doorStyle ?? ''}|${doorOrModelUrl.modelUrl ?? ''}|${doorOrModelUrl.name ?? ''}|${doorOrModelUrl.type ?? ''}|${doorOrModelUrl.kind ?? ''}`.toLowerCase()
      : `${doorOrModelUrl ?? ''}|${name ?? ''}|${openingType ?? ''}`.toLowerCase();

  if (key.includes('bars') || key.includes('portcullis')) {
    return PROCEDURAL_DOOR_STYLES[7];
  }
  if (key.includes('archway') || key.includes('open stone passage')) {
    return PROCEDURAL_DOOR_STYLES[8];
  }
  for (const d of PROCEDURAL_DOOR_STYLES) {
    if (
      key.includes(d.id) ||
      key.includes(`proc-door://${d.style}`) ||
      key.includes(d.style) ||
      key.includes(d.name.toLowerCase())
    ) {
      return d;
    }
  }
  return PROCEDURAL_DOOR_STYLES[0];
}
