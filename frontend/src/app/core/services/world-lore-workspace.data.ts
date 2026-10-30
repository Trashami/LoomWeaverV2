import { ViewerRole } from '../models/loomweaver.models';
import { WorldLoreWorkspaceVm } from '../models/world-lore.models';
import { DEFAULT_LORE_CATEGORIES } from './world-lore-seed.data';

export function buildEmptyWorldLoreWorkspace(
  campaignId: number,
  role: ViewerRole,
  weaveEnabled: boolean,
): WorldLoreWorkspaceVm {
  return {
    campaignId,
    campaignName: '',
    worldName: '',
    worldOverviewSummary: '',
    viewerRole: role,
    weaveEnabled,
    activeMapId: null,
    maps: [],
    regionOverlays: [],
    markers: [],
    journeyWaypoints: [],
    loreEntries: [],
    loreCategories: DEFAULT_LORE_CATEGORIES,
    historyEvents: [],
    recentDiscoveries: [],
    statistics: { regionCount: 0, locationCount: 0, npcCount: 0, factionCount: 0, activeQuestCount: 0, unresolvedMysteryCount: 0 },
  };
}
