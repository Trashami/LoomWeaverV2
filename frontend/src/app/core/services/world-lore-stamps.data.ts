import {
  MarkerFontFamily,
  OldWorldStampOption,
} from '../models/world-lore.models';

export const OLD_WORLD_STAMP_OPTIONS: readonly OldWorldStampOption[] = [
  {
    id: 'muller-walled-city-1',
    label: 'Walled Metropolis (Muller)',
    collection: 'Muller Old World',
    imageUrl: '/assets/stamps/classic-maps/muller/settlements/128/citieswithwalls-1.png',
  },
  {
    id: 'muller-open-city-1',
    label: 'Trade City (Muller)',
    collection: 'Muller Old World',
    imageUrl: '/assets/stamps/classic-maps/muller/settlements/128/citieswithoutwalls-1.png',
  },
  {
    id: 'muller-elevated-1',
    label: 'Citadel on Hill (Muller)',
    collection: 'Muller Old World',
    imageUrl: '/assets/stamps/classic-maps/muller/settlements/128/elevatedsettlements-1.png',
  },
  {
    id: 'muller-church-1',
    label: 'Cathedral / Shrine (Muller)',
    collection: 'Muller Old World',
    imageUrl: '/assets/stamps/classic-maps/muller/settlements/128/churches-1.png',
  },
  {
    id: 'muller-inn-1',
    label: 'Wayfarer Inn (Muller)',
    collection: 'Muller Old World',
    imageUrl: '/assets/stamps/classic-maps/muller/settlements/128/innsortaverns-1.png',
  },
  {
    id: 'muller-ruins-1',
    label: 'Ancient Ruins (Muller)',
    collection: 'Muller Old World',
    imageUrl: '/assets/stamps/classic-maps/muller/other-symbols/128/archaeologicalsites-1.png',
  },
  {
    id: 'muller-hills-1',
    label: 'Highland Peaks (Muller)',
    collection: 'Muller Old World',
    imageUrl: '/assets/stamps/classic-maps/muller/landforms/128/hillgroups-1.png',
  },
  {
    id: 'harrewyn-castle-1',
    label: 'Grand Keep (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/settlements/128/castle-001.png',
  },
  {
    id: 'harrewyn-walled-castle',
    label: 'Fortified Bastion (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/settlements/128/castle-with-walls-001.png',
  },
  {
    id: 'harrewyn-city-wall',
    label: 'Walled Capital (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/settlements/128/city-w-wall-001.png',
  },
  {
    id: 'harrewyn-chapel-1',
    label: 'Sanctuary Chapel (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/settlements/128/chapel-001.png',
  },
  {
    id: 'harrewyn-abbey-1',
    label: 'Cloistered Abbey (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/settlements/128/abbey-001.png',
  },
  {
    id: 'harrewyn-fort-1',
    label: 'Star Fort / Redoubt (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/settlements/128/fort-001.png',
  },
  {
    id: 'harrewyn-tower-1',
    label: 'Sky-Dock / Spire Tower (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/unique/128/elevated-tower.png',
  },
  {
    id: 'harrewyn-battlefield-1',
    label: 'Crossed Swords Battlefield (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/points-of-interest/128/battlefield-001.png',
  },
  {
    id: 'harrewyn-forest-1',
    label: 'Ancient Woodland (Harrewyn)',
    collection: 'Harrewyn Classic',
    imageUrl: '/assets/stamps/classic-maps/harrewyn/flora/128/forest-001.png',
  },
];

export const DEFAULT_MARKER_ICONS: readonly { id: string; label: string }[] = [
  { id: 'dot', label: 'Map Dot (Default)' },
  { id: 'landmark', label: 'Settlement / Citadel' },
  { id: 'fort', label: 'Fortress / Keep' },
  { id: 'shield', label: 'Faction Stronghold' },
  { id: 'compass', label: 'Quest Objective' },
  { id: 'swords', label: 'Encounter / Ambush' },
  { id: 'eye', label: 'GM Secret Vault' },
  { id: 'map-pin', label: 'Point of Interest' },
  { id: 'map', label: 'Region / Territory' },
];

export const MARKER_COLOR_SWATCHES: readonly { hex: string; label: string }[] = [
  { hex: '#d9b77a', label: 'Loom Gold' },
  { hex: '#49e892', label: 'Emerald Lore' },
  { hex: '#e26d5c', label: 'Crimson War' },
  { hex: '#c4a7e7', label: 'Arcane Amethyst' },
  { hex: '#7dc4e4', label: 'Skyship Azure' },
  { hex: '#f6c177', label: 'Sunstone Amber' },
  { hex: '#eb6f92', label: 'GM Rose Secret' },
  { hex: '#e8f3ec', label: 'Ivory Parchment' },
];

export const MARKER_FONT_OPTIONS: readonly { value: MarkerFontFamily; label: string }[] = [
  { value: 'Cinzel', label: 'Cinzel (Imperial Serif)' },
  { value: 'Cormorant Garamond', label: 'Cormorant (Old World Book)' },
  { value: 'Georgia', label: 'Georgia (Classic Atlas)' },
  { value: 'Inter', label: 'Inter (Modern Tactical)' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono (Coordinates)' },
];

export const CAMPAIGN_SESSION_OPTIONS: readonly { id: string; number: number; label: string }[] = [];
