import {
  AdventureAssignedBattlemapVm,
  AdventurePlayEventVm,
  AdventureScopeKind,
  AdventureSessionBeatItemVm,
  AdventureGuideNpcItemVm,
  ContextualAdventureGuideVm,
} from '../models/adventure-guide.models';
import { ViewerRole } from '../models/loomweaver.models';

export const SEED_ADVENTURE_BEATS: readonly AdventureSessionBeatItemVm[] = [];

export const SEED_ADVENTURE_NPCS: readonly AdventureGuideNpcItemVm[] = [];

export const SEED_ASSIGNED_BATTLEMAP: AdventureAssignedBattlemapVm = {
  sceneKey: '',
  title: '',
  sessionId: '',
  sessionTitle: '',
  locationNodeId: '',
  locationTitle: '',
  areaKey: '',
  artworkUrl: '',
  routeLink: '',
  vttRouteLink: '',
  clickableRegions: [],
};

export function buildSeedAdventureGuide(
  campaignId: number,
  _role: ViewerRole,
  scopeKind: AdventureScopeKind = 'session',
  scopeId = '',
  _customNpcs: readonly AdventureGuideNpcItemVm[] = SEED_ADVENTURE_NPCS,
  _customBeats: readonly AdventureSessionBeatItemVm[] = SEED_ADVENTURE_BEATS,
  assignedMap: AdventureAssignedBattlemapVm = SEED_ASSIGNED_BATTLEMAP,
  events: readonly AdventurePlayEventVm[] = [],
): ContextualAdventureGuideVm {
  return {
    campaignId,
    adventureId: '',
    adventureVersionId: '',
    adventureTitle: '',
    activeScopeKind: scopeKind,
    activeScopeId: scopeId,
    activeSessionId: '',
    activeSessionNumber: 0,
    headerTitle: '',
    headerSubtitle: '',
    artworkUrl: '',
    epigraph: '',
    summary: '',
    immediateSituation: '',
    sensoryDescription: '',
    activeAreaKey: null,
    breadcrumbs: [],
    availableSessions: [],
    availableLocations: [],
    availableRooms: [],
    readAloudBlocks: [],
    exits: [],
    skillChecks: [],
    assignedBattlemap: assignedMap,
    beats: [],
    keyNpcs: [],
    encounters: [],
    cluesAndHazards: [],
    treasuresAndRewards: [],
    secrets: [],
    notesTabItems: [],
    npcsTabItems: [],
    placesTabItems: [],
    loreTabItems: [],
    recentPlayEvents: events,
  };
}
