import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  AdventureAssignedBattlemapVm,
  AdventureGuideNpcItemVm,
  AdventurePlayEventVm,
  AdventureProgressState,
  AdventureScopeKind,
  AdventureSessionBeatItemVm,
  ContextualAdventureGuideVm,
} from '../models/adventure-guide.models';
import {
  SEED_ADVENTURE_BEATS,
  SEED_ADVENTURE_NPCS,
  SEED_ASSIGNED_BATTLEMAP,
  buildSeedAdventureGuide,
} from './adventure-guide-seed.data';
import { LoomWeaverStoreService } from './loomweaver-store.service';

const ASSIGNED_MAPS_STORAGE_KEY = 'lw.adventureGuide.assignedMapsBySession.v1';

function readSavedAssignedMaps(): Readonly<Record<string, AdventureAssignedBattlemapVm>> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(ASSIGNED_MAPS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AdventureAssignedBattlemapVm>) : {};
  } catch {
    return {};
  }
}

function writeSavedAssignedMaps(map: Readonly<Record<string, AdventureAssignedBattlemapVm>>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ASSIGNED_MAPS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch {}
}

@Injectable({ providedIn: 'root' })
export class AdventureGuideService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);

  readonly activeScopeKind = signal<AdventureScopeKind>('session');
  readonly activeScopeId = signal<string>('session-15');
  readonly activeProgressFilter = signal<AdventureProgressState>('all');
  readonly statusBanner = signal<string>(
    'Connected Session & Location Guide ready. Filter by session, site, or keyed room (C1–C3).',
  );

  private readonly localNpcs = signal<readonly AdventureGuideNpcItemVm[]>(SEED_ADVENTURE_NPCS);
  private readonly localBeats = signal<readonly AdventureSessionBeatItemVm[]>(SEED_ADVENTURE_BEATS);
  private readonly localAssignedMap = signal<AdventureAssignedBattlemapVm>(SEED_ASSIGNED_BATTLEMAP);
  private readonly localAssignedMapsByScope = signal<Readonly<Record<string, AdventureAssignedBattlemapVm>>>(
    readSavedAssignedMaps(),
  );
  private readonly localEvents = signal<readonly AdventurePlayEventVm[]>([]);

  private resolveLocalMapForScope(campaignId: number, scopeId: string): AdventureAssignedBattlemapVm | undefined {
    const mapByScope = this.localAssignedMapsByScope();
    const direct = mapByScope[`${campaignId}:${scopeId}`] ?? mapByScope[scopeId];
    if (direct) return direct;
    const mapAtt = this.store
      .sessionAttachments()
      .find((a) => a.sessionId === scopeId && a.elementKind === 'Map');
    if (mapAtt) {
      return {
        ...SEED_ASSIGNED_BATTLEMAP,
        sceneKey: mapAtt.elementId,
        title: mapAtt.title,
        sessionId: mapAtt.sessionId,
        sessionTitle: mapAtt.summary || mapAtt.sessionId,
        locationNodeId: '',
        locationTitle: mapAtt.subtitle || 'Session Battlemap',
        artworkUrl: mapAtt.artworkUrl || '/combat-caves.jpg',
        routeLink: `/maps?scene=${mapAtt.elementId}`,
        vttRouteLink: `/arcane-screen?scene=${mapAtt.elementId}`,
        clickableRegions: [],
      };
    }
    return undefined;
  }

  readonly guide = signal<ContextualAdventureGuideVm>(
    buildSeedAdventureGuide(1, 'gm', 'session', 'session-15'),
  );

  readonly filteredKeyNpcs = computed(() => {
    const f = this.activeProgressFilter();
    const list = this.guide().keyNpcs;
    return f === 'all' ? list : list.filter((i) => i.progressState === f);
  });

  readonly filteredCluesAndHazards = computed(() => {
    const f = this.activeProgressFilter();
    const list = this.guide().cluesAndHazards;
    return f === 'all' ? list : list.filter((i) => i.progressState === f);
  });

  readonly filteredEncounters = computed(() => {
    const f = this.activeProgressFilter();
    const list = this.guide().encounters;
    return f === 'all' ? list : list.filter((i) => i.progressState === f);
  });

  constructor() {
    effect(() => {
      const globalSesId = this.store.activeSessionId();
      if (globalSesId && this.activeScopeKind() === 'session' && this.activeScopeId() !== globalSesId) {
        this.activeScopeId.set(globalSesId);
      }
    }, { allowSignalWrites: true });

    effect(() => {
      const cid = this.store.activeCampaignId();
      const role = this.store.viewerRole();
      const sKind = this.activeScopeKind();
      const sId = this.activeScopeId();
      const filter = this.activeProgressFilter();
      if (cid > 0) {
        this.refreshGuide(cid, role, sKind, sId, filter);
      }
    });
  }

  selectScope(scopeKind: AdventureScopeKind, scopeId: string): void {
    this.activeScopeKind.set(scopeKind);
    this.activeScopeId.set(scopeId);
    const cid = this.store.activeCampaignId();
    const role = this.store.viewerRole();
    const scopedMap = this.resolveLocalMapForScope(cid, scopeId);
    this.guide.set(
      buildSeedAdventureGuide(
        cid,
        role,
        scopeKind,
        scopeId,
        this.localNpcs(),
        this.localBeats(),
        scopedMap,
        this.localEvents(),
      ),
    );
    this.refreshGuide(cid, role, scopeKind, scopeId, this.activeProgressFilter());
  }

  setProgressFilter(filter: AdventureProgressState): void {
    this.activeProgressFilter.set(filter);
  }

  refreshGuide(
    campaignId = this.store.activeCampaignId(),
    role = this.store.viewerRole(),
    scopeKind = this.activeScopeKind(),
    scopeId = this.activeScopeId(),
    filter = this.activeProgressFilter(),
  ): void {
    const scopedMap = this.resolveLocalMapForScope(campaignId, scopeId);
    this.guide.set(
      buildSeedAdventureGuide(
        campaignId,
        role,
        scopeKind,
        scopeId,
        this.localNpcs(),
        this.localBeats(),
        scopedMap,
        this.localEvents(),
      ),
    );

    this.http
      .get<ContextualAdventureGuideVm>(
        `/api/v2/campaigns/${campaignId}/adventure-guide?role=${role}&scopeKind=${scopeKind}&scopeId=${scopeId}&filter=${filter}`,
      )
      .subscribe({
        next: (res) => {
          if (res && res.campaignId === this.store.activeCampaignId()) {
            const localOverride = this.resolveLocalMapForScope(campaignId, scopeId);
            if (localOverride && (!res.assignedBattlemap?.sceneKey || res.assignedBattlemap.sessionId !== scopeId)) {
              this.guide.set({
                ...res,
                headerTitle: localOverride.title || res.headerTitle,
                artworkUrl: localOverride.artworkUrl || res.artworkUrl,
                assignedBattlemap: localOverride,
              });
            } else {
              this.guide.set(res);
            }
          }
        },
        error: () => {},
      });
  }

  toggleBeat(beatId: string): void {
    const cid = this.store.activeCampaignId();
    const role = this.store.viewerRole();

    this.localBeats.update((beats) =>
      beats.map((b) =>
        b.id === beatId
          ? { ...b, done: !b.done, progressState: !b.done ? 'completed' : 'unresolved' }
          : b,
      ),
    );
    this.store.toggleSessionBeat(beatId);
    this.statusBanner.set(
      'Recorded session beat progress. Location secrets and adjacent rooms remain isolated until discovered.',
    );

    this.http
      .post<ContextualAdventureGuideVm>(
        `/api/v2/campaigns/${cid}/adventure-guide/beats/${beatId}/toggle?role=${role}&scopeKind=${this.activeScopeKind()}&scopeId=${this.activeScopeId()}&filter=${this.activeProgressFilter()}`,
        {},
      )
      .subscribe({
        next: (res) => {
          if (res) this.guide.set(res);
        },
        error: () => {
          this.refreshGuide();
        },
      });
  }

  updateNodeState(nodeId: string, progressState: string, outcomeNotes = ''): void {
    const cid = this.store.activeCampaignId();
    const role = this.store.viewerRole();
    this.statusBanner.set(`Marked '${nodeId}' as ${progressState.toUpperCase()}.`);

    this.http
      .post<ContextualAdventureGuideVm>(
        `/api/v2/campaigns/${cid}/adventure-guide/nodes/${nodeId}/state?scopeKind=${this.activeScopeKind()}&scopeId=${this.activeScopeId()}&filter=${this.activeProgressFilter()}`,
        { progressState, outcomeNotes, role },
      )
      .subscribe({
        next: (res) => {
          if (res) this.guide.set(res);
        },
        error: () => {},
      });
  }

  shareWithPlayers(targetId: string, targetTitle: string, characterKey = 'All Party'): void {
    const cid = this.store.activeCampaignId();
    const role = this.store.viewerRole();
    this.statusBanner.set(`Granted knowledge of '${targetTitle}' to ${characterKey}.`);

    this.guide.update((cur) => ({
      ...cur,
      readAloudBlocks: cur.readAloudBlocks.map((b) =>
        b.blockId === targetId ? { ...b, sharedWithPlayers: true } : b,
      ),
    }));

    this.http
      .post<ContextualAdventureGuideVm>(
        `/api/v2/campaigns/${cid}/adventure-guide/grants?role=${role}&scopeKind=${this.activeScopeKind()}&scopeId=${this.activeScopeId()}&filter=${this.activeProgressFilter()}`,
        { targetId, targetTitle, grantedToScope: 'party', characterKey },
      )
      .subscribe({
        next: (res) => {
          if (res) this.guide.set(res);
        },
        error: () => {},
      });
  }

  awardReward(nodeId: string, idempotencyKey: string, xpAmount: number, currencyOrItemLabel: string): void {
    const cid = this.store.activeCampaignId();
    const role = this.store.viewerRole();

    this.guide.update((cur) => ({
      ...cur,
      treasuresAndRewards: cur.treasuresAndRewards.map((t) =>
        t.nodeId === nodeId ? { ...t, rewardAwarded: true, progressState: 'completed' } : t,
      ),
    }));
    this.statusBanner.set(`Awarded +${xpAmount} XP & ${currencyOrItemLabel} to the party.`);

    this.http
      .post<{ newlyAwarded: boolean; xpAwarded: number; message: string; guide: ContextualAdventureGuideVm }>(
        `/api/v2/campaigns/${cid}/adventure-guide/rewards/award?role=${role}&scopeKind=${this.activeScopeKind()}&scopeId=${this.activeScopeId()}&filter=${this.activeProgressFilter()}`,
        { nodeId, idempotencyKey, xpAmount, currencyOrItemLabel },
      )
      .subscribe({
        next: (res) => {
          if (res?.message) this.statusBanner.set(res.message);
          if (res?.guide) this.guide.set(res.guide);
        },
        error: () => {},
      });
  }

  populateCharacterOrNpc(params: {
    name: string;
    role: string;
    dispositionLabel?: string;
    motive?: string;
    dialogueExcerpt?: string;
    artworkUrl?: string;
    sessionId?: string;
    locationNodeId?: string;
    routeLink?: string;
    compositeKey?: string;
  }): void {
    const cleanName = params.name.trim() || 'Chapel Envoy';
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const cid = this.store.activeCampaignId();
    const role = this.store.viewerRole();
    const disp = params.dispositionLabel || 'Allied';
    const tone: 'gold' | 'emerald' | 'crimson' =
      disp === 'Hostile' ? 'crimson' : disp === 'Allied' || disp === 'Guarded' ? 'emerald' : 'gold';
    const words = cleanName.split(/\s+/);
    const initials =
      words.length >= 2
        ? `${words[0][0]}${words[1][0]}`.toUpperCase()
        : cleanName.slice(0, 2).toUpperCase();
    const locId = params.locationNodeId || this.activeScopeId() || 'node-room-c1-nave';
    const sesId = params.sessionId || 'session-15';
    const cKey = params.compositeKey || `${cid}:NPC:npc-${slug}`;
    const route = params.routeLink || `/campaigns?inspect=npc-${slug}`;

    const newItem: AdventureGuideNpcItemVm = {
      nodeId: `node-npc-${slug}`,
      compositeKey: cKey,
      name: cleanName,
      role: params.role || `${disp} Adventurer`,
      dispositionLabel: disp,
      dispositionTone: tone,
      initials,
      ringColor: tone === 'crimson' ? '#e25c5c' : tone === 'emerald' ? '#49e892' : '#d9b77a',
      artworkUrl: params.artworkUrl || '/icrandor_world_dashboard.jpg',
      motive: params.motive || 'Active in the current session and location.',
      dialogueExcerpt: params.dialogueExcerpt || `"Reporting to ${locId.replace('node-room-', '').toUpperCase()}."`,
      whyIncluded: `Populated in ${locId.replace('node-', '').toUpperCase()} · Linked to ${sesId}`,
      progressState: 'discovered',
      routeLink: route,
      visibility: 'players',
    };

    this.localNpcs.update((prev) => [newItem, ...prev.filter((n) => n.compositeKey !== cKey)]);
    this.localEvents.update((prev) => [
      {
        id: `evt-${Date.now()}`,
        eventKind: 'npc_populated',
        actorLabel: 'Studio',
        summary: `Populated '${cleanName}' (${newItem.role}) into the Session & Location Guide`,
        relativeTime: 'Just now',
      },
      ...prev,
    ]);
    this.statusBanner.set(`Populated '${cleanName}' into the Session & Location Guide with deep link ${route}.`);
    this.refreshGuide(cid, role, this.activeScopeKind(), this.activeScopeId(), this.activeProgressFilter());

    this.http
      .post<ContextualAdventureGuideVm>(
        `/api/v2/campaigns/${cid}/adventure-guide/npcs?role=${role}&scopeKind=${this.activeScopeKind()}&scopeId=${this.activeScopeId()}&filter=${this.activeProgressFilter()}`,
        {
          name: cleanName,
          role: newItem.role,
          dispositionLabel: disp,
          motive: newItem.motive,
          dialogueExcerpt: newItem.dialogueExcerpt,
          artworkUrl: newItem.artworkUrl,
          sessionId: sesId,
          locationNodeId: locId,
          visibility: 'players',
        },
      )
      .subscribe({
        next: (res) => {
          if (res) this.guide.set(res);
        },
        error: () => {},
      });
  }

  assignBattlemapToSessionAndPlace(params: {
    sceneKey: string;
    sceneTitle: string;
    sessionId: string;
    sessionTitle?: string;
    locationNodeId: string;
    locationTitle?: string;
    artworkUrl?: string;
    biome?: string;
  }): void {
    const cid = this.store.activeCampaignId();
    const role = this.store.viewerRole();
    const art = params.artworkUrl || '/combat-caves.jpg';
    const sessionFromStore = this.store
      .sessions()
      .find((s) => s.sessionId === params.sessionId);
    const resolvedSessionTitle =
      params.sessionTitle ||
      sessionFromStore?.label ||
      sessionFromStore?.title ||
      this.store.activeSession()?.label ||
      params.sessionId ||
      'Current Session';
    const locTitle =
      params.locationTitle ||
      (params.locationNodeId === 'node-room-c1-nave'
        ? 'C1: The Shattered Nave'
        : params.locationNodeId === 'node-room-c2-courtyard'
          ? 'C2: Moonlit Cloister Courtyard'
          : params.locationNodeId === 'node-room-c3-crypt'
            ? 'C3: Sealed Altar Crypt'
            : params.locationNodeId === 'node-loc-cinth-gala'
              ? 'Town Square'
              : params.biome || 'Campaign Battlemap');

    const updatedMap: AdventureAssignedBattlemapVm = {
      ...this.localAssignedMap(),
      sceneKey: params.sceneKey,
      title: params.sceneTitle,
      sessionId: params.sessionId,
      sessionTitle: resolvedSessionTitle,
      locationNodeId: params.locationNodeId,
      locationTitle: locTitle,
      artworkUrl: art,
      routeLink: `/maps?scene=${params.sceneKey}`,
      vttRouteLink: `/arcane-screen?scene=${params.sceneKey}`,
    };

    this.localAssignedMap.set(updatedMap);
    if (params.sessionId) {
      this.localAssignedMapsByScope.update((cur) => {
        const next: Record<string, AdventureAssignedBattlemapVm> = {
          ...cur,
          [params.sessionId]: updatedMap,
          [`${cid}:${params.sessionId}`]: updatedMap,
        };
        if (params.locationNodeId) {
          next[params.locationNodeId] = updatedMap;
          next[`${cid}:${params.locationNodeId}`] = updatedMap;
        }
        writeSavedAssignedMaps(next);
        return next;
      });
      this.store.setActiveSession(params.sessionId);
      this.activeScopeKind.set('session');
      this.activeScopeId.set(params.sessionId);
    }
    this.localEvents.update((prev) => [
      {
        id: `evt-${Date.now()}`,
        eventKind: 'map_assigned',
        actorLabel: 'LoomMaps',
        summary: `Assigned Battlemap '${params.sceneTitle}' to ${updatedMap.sessionTitle} · ${locTitle}`,
        relativeTime: 'Just now',
      },
      ...prev,
    ]);
    this.statusBanner.set(
      `Assigned Battlemap '${params.sceneTitle}' to ${updatedMap.sessionTitle} and ${locTitle}.`,
    );

    this.http
      .post<ContextualAdventureGuideVm>(
        `/api/v2/campaigns/${cid}/adventure-guide/assign-map?role=${role}&scopeKind=${this.activeScopeKind()}&scopeId=${this.activeScopeId()}&filter=${this.activeProgressFilter()}`,
        {
          ...params,
          sessionTitle: resolvedSessionTitle,
          locationTitle: locTitle,
        },
      )
      .subscribe({
        next: (res) => {
          if (res) this.guide.set(res);
        },
        error: () => {
          this.refreshGuide(cid, role, this.activeScopeKind(), this.activeScopeId(), this.activeProgressFilter());
        },
      });
  }
}
