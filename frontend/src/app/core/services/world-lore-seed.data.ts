import { AtlasLayerFilterOption } from '../models/world-lore.models';

export const ATLAS_LAYER_FILTERS: readonly AtlasLayerFilterOption[] = [
  { id: 'Locations', label: 'Locations', icon: 'map-pin' },
  { id: 'Settlements', label: 'Settlements', icon: 'landmark' },
  { id: 'Regions', label: 'Regions', icon: 'map' },
  { id: 'NPCs', label: 'NPCs', icon: 'users' },
  { id: 'Quests', label: 'Quests', icon: 'compass' },
  { id: 'Factions', label: 'Factions', icon: 'shield' },
  { id: 'Encounters', label: 'Encounters', icon: 'swords' },
  { id: 'Secrets', label: 'Secrets', icon: 'eye', gmOnly: true },
  { id: 'PlayerPath', label: 'Player Path', icon: 'chart' },
  { id: 'Visited', label: 'Visited', icon: 'check' },
  { id: 'PartyPosition', label: 'Party Position', icon: 'target' },
  { id: 'History', label: 'History', icon: 'clock' },
  { id: 'Rumors', label: 'Rumors', icon: 'scroll' },
];

export const DEFAULT_LORE_CATEGORIES: readonly string[] = [
  'Kingdoms & Settlements',
  'Worlds & Regions',
  'Geography',
  'Cultures & Civilizations',
  'Factions & Organizations',
  'Religions & Deities',
  'Historical Events',
  'Languages',
  'Magic & Technology',
  'Myths & Legends',
  'Important Documents',
];
