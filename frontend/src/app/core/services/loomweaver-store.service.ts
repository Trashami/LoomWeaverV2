import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CampaignDashboardVm } from '../models/dashboard.models';
import { FullscreenDiceOverlayService } from '../../features/dice/engine/fullscreen-dice-overlay.service';
import {
  AssetCardVm, CampaignAbilityScoreRule, CampaignInviteStatus, CampaignPlayerMemberVm, CampaignSessionVm, CampaignVm,
  CombatTelemetryVm, EntityCardVm, GraphEdgeVm, LoomCitationVm, NavDestination, QualityProfile,
  SceneVm, SessionAttachmentVm, SubscriptionTierVm, ViewerRole,
} from '../models/loomweaver.models';
import { buildEmptyDashboard } from './dashboard-empty.data';
import { LW_ASSETS, LW_GRAPH_EDGES, LW_SCENES, LW_SUBSCRIPTION_TIERS, LW_TELEMETRY } from './loomweaver-catalog.data';
import {
  DEFAULT_PARTY_PLAYERS, LW_ENTITIES, LW_NAVIGATION, NO_CAMPAIGN, ServerMemberDto, SYSTEM_LABELS,
  buildFallbackSessionsHelper, formatSessionLocationLabelHelper, mergeServerCampaignMembersHelper,
} from './loomweaver-seed.data';
import { LwNotificationService } from './lw-notification.service';
import { WebAudioAmbienceService } from '../../features/assets/engine/web-audio-ambience.service';

interface ServerCampaign {
  readonly id: number; readonly slug: string; readonly name: string; readonly subtitle: string;
  readonly systemCode: CampaignVm['systemCode']; readonly worldName: string; readonly currentAct: string;
  readonly currentSessionNumber: number; readonly currentLocationName: string; readonly weaveEnabled: boolean;
  readonly my_role: 'dm' | 'player'; readonly my_character_key?: string | null; readonly my_invite_status?: CampaignInviteStatus;
}
interface ServerSessionRow {
  readonly id?: string; readonly sessionId?: string; readonly sessionNumber: number; readonly title: string;
  readonly locationName?: string; readonly dateLabel?: string; readonly xpAwarded?: number;
  readonly summary?: string; readonly highlights?: readonly string[];
}

const ACTIVE_CAMPAIGN_STORAGE_KEY = 'lw_active_campaign_id_v2';
const ACTIVE_SESSION_STORAGE_PREFIX = 'lw_active_session_id_v2_';
const GENERATIVE_AI_OPT_IN_STORAGE_KEY = 'lw_generative_ai_opt_in_v2';
const HIDE_AI_CONTENT_STORAGE_KEY = 'lw_hide_ai_content_v2';
const EXPERIENCE_MODE_STORAGE_KEY = 'lw_experience_mode_v2';
const CAMPAIGN_ABILITY_RULES_STORAGE_KEY = 'lw_campaign_ability_rules_v2';
const CAMPAIGN_PLAYERS_STORAGE_KEY = 'lw_campaign_players_roster_v2';
const CAMPAIGN_INVITE_CODES_STORAGE_KEY = 'lw_campaign_invite_codes_v2';

const readJsonStorage = <T>(key: string, fallback: T): T => {
  try { const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};
const writeJsonStorage = (key: string, val: unknown): void => {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

export type LwExperienceMode = 'guided' | 'advanced';
export type AdventureGuideModalScope = 'session' | 'adventure';

@Injectable({ providedIn: 'root' })
export class LoomWeaverStoreService {
  private readonly http = inject(HttpClient);
  private readonly fullscreenDice = inject(FullscreenDiceOverlayService);
  private readonly notifications = inject(LwNotificationService);
  private readonly audio = inject(WebAudioAmbienceService);

  readonly navigationItems = signal<readonly NavDestination[]>(LW_NAVIGATION);
  readonly campaigns = signal<readonly CampaignVm[]>([NO_CAMPAIGN]);
  readonly activeCampaignId = signal<number>(0);
  readonly sessions = signal<readonly CampaignSessionVm[]>([]);
  readonly activeSessionId = signal<string>('');
  readonly sessionAttachments = signal<readonly SessionAttachmentVm[]>([]);
  readonly adventureGuideModalOpen = signal<boolean>(false);
  readonly adventureGuideModalScope = signal<AdventureGuideModalScope>('session');
  readonly activeUserAccountId = signal<string>('acc-gm-geojason');
  readonly activeUsername = signal<string>('GeoJason');
  readonly viewerRole = signal<ViewerRole>('gm');
  readonly weaveEnabled = signal<boolean>(false);
  readonly generativeAiEnabled = computed<boolean>(() => this.weaveEnabled());
  readonly hideAiContent = signal<boolean>(true);
  readonly experienceMode = signal<LwExperienceMode>('advanced');
  readonly loomDrawerOpen = signal<boolean>(false);
  readonly loomQuery = signal<string>('');
  readonly qualityProfile = signal<QualityProfile>('Balanced');
  readonly inspectedEntityKey = signal<string | null>(null);
  readonly backendOnline = signal<boolean>(true);
  readonly quickRollBanner = signal<string>('1d20 Ready');
  readonly campaignDashboard = signal<CampaignDashboardVm>(buildEmptyDashboard(0));
  readonly campaignAbilityRules = signal<Readonly<Record<number, CampaignAbilityScoreRule>>>({});
  readonly campaignPlayersByCampaign = signal<Readonly<Record<number, readonly CampaignPlayerMemberVm[]>>>({});
  readonly campaignInviteCodes = signal<Readonly<Record<number, string>>>({});

  private readonly rawEntities = signal<readonly EntityCardVm[]>(LW_ENTITIES);
  private readonly rawAssets = signal<readonly AssetCardVm[]>(LW_ASSETS);
  private readonly rawScenes = signal<readonly SceneVm[]>(LW_SCENES);
  private readonly rawEdges = signal<readonly GraphEdgeVm[]>(LW_GRAPH_EDGES);
  readonly telemetry = signal<readonly CombatTelemetryVm[]>(LW_TELEMETRY);
  private readonly rawSubscriptionTiers = signal<readonly SubscriptionTierVm[]>(LW_SUBSCRIPTION_TIERS);

  readonly subscriptionTiers = computed<readonly SubscriptionTierVm[]>(() => {
    const weaveOn = this.weaveEnabled();
    return this.rawSubscriptionTiers().map((tier) => weaveOn ? tier : {
      ...tier, includesWeave: false,
      summary: tier.summary.replace(', The Weave AI draft companion, and Neo4j World Graph', ', and Connected World & Lore Atlas').replace('The Weave AI draft companion', 'Connected World & Lore Studio'),
    });
  });

  constructor() {
    this.restoreGenerativeAiPreference();
    this.campaignAbilityRules.set(readJsonStorage(CAMPAIGN_ABILITY_RULES_STORAGE_KEY, {}));
    this.campaignPlayersByCampaign.set(readJsonStorage(CAMPAIGN_PLAYERS_STORAGE_KEY, {}));
    this.campaignInviteCodes.set(readJsonStorage(CAMPAIGN_INVITE_CODES_STORAGE_KEY, {}));
    this.verifyPolyglotHealth();
    this.sessions.set(buildFallbackSessionsHelper(undefined));
    this.activeSessionId.set('session-15');
    this.loadMyCampaigns();
    this.refreshCampaignDashboard();
  }

  readonly activeCampaign = computed<CampaignVm>(() => this.campaigns().find((c) => c.id === this.activeCampaignId()) ?? this.campaigns()[0]);
  readonly activeCampaignAbilityRule = computed<CampaignAbilityScoreRule>(() => this.campaignAbilityRules()[this.activeCampaignId() || 1] ?? 'point_buy');
  readonly activeCampaignPlayers = computed<readonly CampaignPlayerMemberVm[]>(() => this.campaignPlayersByCampaign()[this.activeCampaignId() || 1] ?? DEFAULT_PARTY_PLAYERS);
  readonly activeCampaignInviteCode = computed<string>(() => {
    const cid = this.activeCampaignId() || 1;
    return this.campaignInviteCodes()[cid] ?? `lw-${cid}-${(this.activeCampaign().slug || 'sotm').slice(0, 18)}-party`;
  });
  readonly activeCampaignInviteUrl = computed<string>(() => {
    const cid = this.activeCampaignId() || 1;
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://loom-weaver.com';
    return `${origin}/home?joinCampaign=${cid}&invite=${encodeURIComponent(this.activeCampaignInviteCode())}`;
  });
  readonly activeSession = computed<CampaignSessionVm | null>(() => {
    const list = this.sessions();
    return list.find((s) => s.sessionId === this.activeSessionId()) ?? list[0] ?? null;
  });
  readonly activeSessionAttachments = computed<readonly SessionAttachmentVm[]>(() => {
    const sid = this.activeSessionId();
    const isGm = this.viewerRole() === 'gm';
    return this.sessionAttachments().filter((a) => (isGm || a.visibility !== 'gm') && (!sid || a.sessionId === sid));
  });
  isUserGmForCampaign(campaign: CampaignVm): boolean { return campaign.id > 0 && campaign.myRole === 'dm'; }
  readonly isGmForActiveCampaign = computed<boolean>(() => this.isUserGmForCampaign(this.activeCampaign()));
  readonly visibleNavigation = computed<readonly NavDestination[]>(() => this.navigationItems().filter((item) => !item.requiresWeave || this.weaveEnabled()));
  readonly authorizedEntities = computed<readonly EntityCardVm[]>(() => {
    const isGm = this.viewerRole() === 'gm';
    const weaveOn = this.weaveEnabled();
    return this.rawEntities()
      .filter((e) => (isGm || e.visibility === 'public' || e.visibility === 'players') && (weaveOn || e.canonStatus !== 'draft'))
      .map((e) => (!weaveOn && e.routeLink.startsWith('/weave') ? { ...e, routeLink: e.routeLink.replace(/^\/weave/, '/world-lore') } : e));
  });
  readonly authorizedScenes = computed<readonly SceneVm[]>(() => this.rawScenes().filter((s) => this.viewerRole() === 'gm' || s.visibility === 'public' || s.visibility === 'players'));
  readonly authorizedGraphEdges = computed<readonly GraphEdgeVm[]>(() => this.rawEdges().filter((edge) => this.viewerRole() === 'gm' || edge.visibility === 'public' || edge.visibility === 'players'));
  readonly assets = computed<readonly AssetCardVm[]>(() => this.rawAssets());
  readonly inspectedEntity = computed<EntityCardVm | null>(() => {
    const key = this.inspectedEntityKey();
    return key ? (this.authorizedEntities().find((e) => e.compositeKey === key || e.entityKey === key) ?? null) : null;
  });
  readonly inspectedEntityEdges = computed(() => {
    const entity = this.inspectedEntity();
    if (!entity) return [];
    const entities = this.authorizedEntities();
    const defaultRoute = this.weaveEnabled() ? '/weave' : '/world-lore';
    return this.authorizedGraphEdges().filter((edge) => edge.sourceKey === entity.compositeKey || edge.targetKey === entity.compositeKey).map((edge) => {
      const isOutgoing = edge.sourceKey === entity.compositeKey;
      const peerKey = isOutgoing ? edge.targetKey : edge.sourceKey;
      const peer = entities.find((e) => e.compositeKey === peerKey);
      return { relationshipType: edge.relationshipType, direction: isOutgoing ? ('outgoing' as const) : ('incoming' as const), peerKey, peerName: peer?.name ?? peerKey, peerType: peer?.entityType ?? 'Entity', peerRoute: peer?.routeLink ?? defaultRoute };
    });
  });
  readonly loomCitations = computed<readonly LoomCitationVm[]>(() => {
    const q = this.loomQuery().trim().toLowerCase();
    const pool = this.authorizedEntities();
    const matched = pool.filter((e) => !q || e.name.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q));
    return (matched.length > 0 ? matched.slice(0, 5) : pool.slice(0, 4)).map((e) => ({ compositeKey: e.compositeKey, title: e.name, entityType: e.entityType, excerpt: e.summary, routeLink: e.routeLink, visibility: e.visibility }));
  });
  syncUserIdentity(accountId: string, username: string): void { this.activeUserAccountId.set(accountId); this.activeUsername.set(username); this.loadMyCampaigns(); }
  loadMyCampaigns(preferredId?: number): void {
    this.http.get<readonly ServerCampaign[]>('/api/v2/campaigns').subscribe({
      next: (list) => {
        const mapped = (list ?? []).map<CampaignVm>((c) => ({ ...c, systemLabel: SYSTEM_LABELS[c.systemCode] ?? c.systemCode, myRole: c.my_role, myCharacterKey: c.my_character_key ?? null, myInviteStatus: c.my_invite_status ?? 'active' }));
        this.campaigns.set(mapped.length ? mapped : [NO_CAMPAIGN]);
        const saved = preferredId ?? Number(this.readSavedCampaignId());
        this.setCampaign((mapped.find((c) => c.id === saved) ?? mapped[0] ?? NO_CAMPAIGN).id);
        this.notifications.syncIdentityAndRefresh(this.activeUsername(), `${this.activeUsername().toLowerCase()}@loom-weaver.com`, mapped.map((c) => c.id));
      },
      error: () => { this.campaigns.set([NO_CAMPAIGN]); this.activeCampaignId.set(0); this.viewerRole.set('players'); this.notifications.syncIdentityAndRefresh(this.activeUsername(), `${this.activeUsername().toLowerCase()}@loom-weaver.com`, []); },
    });
  }
  private readSavedCampaignId(): string | null { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_CAMPAIGN_STORAGE_KEY); } catch { return null; } }
  setCampaign(id: number): void {
    const validated = this.campaigns().find((c) => c.id === Number(id)) ?? this.campaigns()[0];
    if (!validated) return;
    this.activeCampaignId.set(validated.id); this.inspectedEntityKey.set(null); this.viewerRole.set(this.isUserGmForCampaign(validated) ? 'gm' : 'players');
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_CAMPAIGN_STORAGE_KEY, String(validated.id)); } catch {}
    this.refreshCampaignDashboard(); this.loadCampaignSessions(validated.id); this.loadSessionAttachments(validated.id); this.loadCampaignRulesFromServer(validated.id); this.loadCampaignMembersFromServer(validated.id);
    if (validated.id > 0) this.audio.fireTrigger('campaign', String(validated.id), validated.name);
  }
  loadCampaignMembersFromServer(campaignId = this.activeCampaignId()): void {
    if (campaignId <= 0) return;
    this.http.get<readonly ServerMemberDto[]>(`/api/v2/campaigns/${campaignId}/members`).subscribe({
      next: (rows) => {
        if (!rows || rows.length === 0) return;
        this.campaignPlayersByCampaign.update((cur) => { const next = { ...cur, [campaignId]: mergeServerCampaignMembersHelper(cur[campaignId] ?? DEFAULT_PARTY_PLAYERS, rows) }; writeJsonStorage(CAMPAIGN_PLAYERS_STORAGE_KEY, next); return next; });
      },
      error: () => {},
    });
  }

  setCampaignAbilityScoreRule(rule: CampaignAbilityScoreRule): void {
    const cid = this.activeCampaignId() || 1;
    this.campaignAbilityRules.update((cur) => { const next = { ...cur, [cid]: rule }; writeJsonStorage(CAMPAIGN_ABILITY_RULES_STORAGE_KEY, next); return next; });
    if (cid > 0) this.http.post(`/api/v2/campaigns/${cid}/rules`, { abilityScoreRule: rule }).subscribe({ error: () => {} });
  }

  private loadCampaignRulesFromServer(campaignId: number): void {
    if (campaignId <= 0) return;
    this.http.get<{ abilityScoreRule?: CampaignAbilityScoreRule }>(`/api/v2/campaigns/${campaignId}/rules`).subscribe({
      next: (res) => { if ((res?.abilityScoreRule === 'roll_stats' || res?.abilityScoreRule === 'point_buy') && !this.campaignAbilityRules()[campaignId]) this.campaignAbilityRules.update((cur) => ({ ...cur, [campaignId]: res.abilityScoreRule! })); },
      error: () => {},
    });
  }

  generateNewInviteLink(): string {
    const cid = this.activeCampaignId() || 1;
    const token = `lw-${cid}-${Math.random().toString(36).slice(2, 8)}`;
    this.campaignInviteCodes.update((cur) => { const next = { ...cur, [cid]: token }; writeJsonStorage(CAMPAIGN_INVITE_CODES_STORAGE_KEY, next); return next; });
    if (cid > 0) {
      this.http.post<{ inviteCode?: string }>(`/api/v2/campaigns/${cid}/invites`, { role: 'player', maxUses: 25, expiresInDays: 30 }).subscribe({
        next: (res) => { if (res?.inviteCode) this.campaignInviteCodes.update((cur) => { const next = { ...cur, [cid]: res.inviteCode! }; writeJsonStorage(CAMPAIGN_INVITE_CODES_STORAGE_KEY, next); return next; }); },
        error: () => {},
      });
    }
    return this.activeCampaignInviteUrl();
  }

  addPlayerToActiveCampaign(req: { accountId?: string; username: string; displayName?: string; email?: string; assignedCharacterKey?: string; joinedViaInvite?: boolean; inviteStatus?: CampaignInviteStatus }): CampaignPlayerMemberVm {
    const cid = this.activeCampaignId() || 1;
    const cleanUser = req.username.trim().replace(/^@+/, '').replace(/\s+/g, '') || 'Adventurer';
    const cleanDisplay = (req.displayName ?? req.username).trim() || cleanUser;
    const accountId = req.accountId || `acc-player-${cleanUser.toLowerCase()}`;
    const email = (req.email ?? `${cleanUser.toLowerCase()}@loom-weaver.com`).trim();
    const inviteStatus: CampaignInviteStatus = req.inviteStatus ?? (req.assignedCharacterKey ? 'active' : 'pending');
    const member: CampaignPlayerMemberVm = {
      accountId, username: cleanUser, displayName: cleanDisplay, email, role: 'players', joinedViaInvite: req.joinedViaInvite ?? true,
      joinedAtLabel: inviteStatus === 'pending' ? 'Pending Invite' : (req.joinedViaInvite ? 'Joined via URL Invite' : 'Added by GM'),
      inviteStatus, assignedCharacterKey: req.assignedCharacterKey,
    };
    this.campaignPlayersByCampaign.update((cur) => {
      const existing = cur[cid] ?? DEFAULT_PARTY_PLAYERS;
      const next = { ...cur, [cid]: [...existing.filter((p) => p.username.toLowerCase() !== cleanUser.toLowerCase() && p.accountId !== accountId), member] };
      writeJsonStorage(CAMPAIGN_PLAYERS_STORAGE_KEY, next);
      return next;
    });
    if (cid > 0) {
      this.http.post<ServerMemberDto>(`/api/v2/campaigns/${cid}/members/add`, { username: cleanUser, displayName: cleanDisplay, email: req.email ?? '', assignedCharacterKey: req.assignedCharacterKey, inviteStatus })
        .subscribe({ next: () => this.loadCampaignMembersFromServer(cid), error: () => {} });
      if (inviteStatus === 'pending') this.notifications.notifyCampaignInviteSent(cid, this.activeCampaign().name, cleanUser, cleanDisplay, this.activeUsername());
    }
    return member;
  }

  acceptCampaignInviteWithCharacter(req: { campaignId: number; characterKey: string; characterName: string; playerUsername?: string; playerDisplayName?: string }): void {
    const cid = req.campaignId || this.activeCampaignId() || 1;
    const uname = (req.playerUsername || this.activeUsername() || 'Adventurer').trim();
    const disp = (req.playerDisplayName || uname).trim();
    this.campaignPlayersByCampaign.update((cur) => {
      const existing = cur[cid] ?? DEFAULT_PARTY_PLAYERS;
      const updated = existing.some((p) => p.username.toLowerCase() === uname.toLowerCase())
        ? existing.map((p) => p.username.toLowerCase() === uname.toLowerCase() ? { ...p, inviteStatus: 'active' as const, joinedAtLabel: 'Joined Campaign', assignedCharacterKey: req.characterKey, assignedCharacterName: req.characterName } : p)
        : [...existing, { accountId: `acc-player-${uname.toLowerCase()}`, username: uname, displayName: disp, email: `${uname.toLowerCase()}@loom-weaver.com`, role: 'players' as const, joinedViaInvite: true, joinedAtLabel: 'Joined Campaign', inviteStatus: 'active' as const, assignedCharacterKey: req.characterKey, assignedCharacterName: req.characterName }];
      const next = { ...cur, [cid]: updated };
      writeJsonStorage(CAMPAIGN_PLAYERS_STORAGE_KEY, next);
      return next;
    });
    this.campaigns.update((list) => list.map((c) => c.id === cid ? { ...c, myInviteStatus: 'active', myCharacterKey: req.characterKey } : c));
    this.http.post(`/api/v2/campaigns/${cid}/members/accept-invite`, { characterKey: req.characterKey, characterName: req.characterName, playerUsername: uname })
      .subscribe({ next: () => this.loadCampaignMembersFromServer(cid), error: () => {} });
    this.notifications.notifyPlayerJoinedCampaign(cid, this.activeCampaign().name, uname, disp, req.characterName);
    this.notifications.dismissInviteJoinModal();
  }

  removePlayerFromActiveCampaign(accountIdOrUsername: string): void {
    const cid = this.activeCampaignId() || 1;
    const key = accountIdOrUsername.toLowerCase();
    this.campaignPlayersByCampaign.update((cur) => {
      const next = { ...cur, [cid]: (cur[cid] ?? DEFAULT_PARTY_PLAYERS).filter((p) => p.accountId.toLowerCase() !== key && p.username.toLowerCase() !== key) };
      writeJsonStorage(CAMPAIGN_PLAYERS_STORAGE_KEY, next);
      return next;
    });
  }

  assignPlayerCharacterInRoster(characterKey: string, playerAccountId: string, playerUsername: string): void {
    const cid = this.activeCampaignId() || 1;
    this.campaignPlayersByCampaign.update((cur) => {
      const updated = (cur[cid] ?? DEFAULT_PARTY_PLAYERS).map((p) => {
        if (playerAccountId && (p.accountId === playerAccountId || p.username.toLowerCase() === playerUsername.toLowerCase())) return { ...p, assignedCharacterKey: characterKey, inviteStatus: 'active' as const, joinedAtLabel: p.role === 'gm' ? 'Campaign Founder' : 'Joined Campaign' };
        if (p.assignedCharacterKey === characterKey) return { ...p, assignedCharacterKey: undefined };
        return p;
      });
      const next = { ...cur, [cid]: updated };
      writeJsonStorage(CAMPAIGN_PLAYERS_STORAGE_KEY, next);
      return next;
    });
  }

  joinCampaignViaInviteLink(campaignId: number, inviteCode: string, user: { accountId: string; username: string; displayName: string; email: string }): CampaignPlayerMemberVm {
    if (campaignId > 0 && this.campaigns().some((c) => c.id === campaignId)) this.setCampaign(campaignId);
    if (inviteCode) this.http.post('/api/v2/invites/redeem', { token: inviteCode }).subscribe({ next: () => this.loadMyCampaigns(campaignId), error: () => {} });
    const member = this.addPlayerToActiveCampaign({ accountId: user.accountId, username: user.username, displayName: user.displayName, email: user.email, joinedViaInvite: true, inviteStatus: 'pending' });
    this.notifications.openInviteJoinModal({ campaignId: campaignId || this.activeCampaignId() || 1, campaignName: this.activeCampaign().name || `Campaign #${campaignId}`, systemLabel: this.activeCampaign().systemLabel || 'D&D 5e', dmName: 'Dungeon Master' });
    return member;
  }

  loadCampaignSessions(campaignId = this.activeCampaignId()): void {
    if (campaignId <= 0) { this.sessions.set([]); this.activeSessionId.set(''); return; }
    const fallback = buildFallbackSessionsHelper(this.campaigns().find((c) => c.id === campaignId));
    this.http.get<readonly ServerSessionRow[]>(`/api/v2/campaigns/${campaignId}/sessions`).subscribe({
      next: (rows) => {
        const mapped: CampaignSessionVm[] = (rows ?? []).map((r, idx) => {
          const sid = r.sessionId ?? r.id ?? `session-${r.sessionNumber || idx + 1}`;
          const num = r.sessionNumber || idx + 1;
          const title = r.title || `Session ${num}`;
          const loc = formatSessionLocationLabelHelper(r.locationName, title);
          const statusLabel = idx === 0 ? 'Current / Upcoming' : (r.dateLabel || 'Chronicled');
          return {
            sessionId: sid, sessionNumber: num, title, label: title.toLowerCase().startsWith('session') ? title : `Session ${num} · ${title}`,
            locationName: loc, locationLabel: loc, dateLabel: r.dateLabel ?? statusLabel, statusLabel,
            xpAwarded: r.xpAwarded ?? 0, summary: r.summary ?? '', highlights: r.highlights ?? [], status: idx === 0 ? 'upcoming' : 'completed',
          };
        });
        const list = mapped.length >= 2 ? mapped : [...mapped, ...fallback.filter((f) => !mapped.some((m) => m.sessionId === f.sessionId))];
        this.sessions.set(list);
        this.resolveInitialActiveSession(campaignId, list);
      },
      error: () => { this.sessions.set(fallback); this.resolveInitialActiveSession(campaignId, fallback); },
    });
  }

  formatSessionLocationLabel(raw: string | undefined, sessionTitle = ''): string { return formatSessionLocationLabelHelper(raw, sessionTitle); }

  private resolveInitialActiveSession(campaignId: number, list: readonly CampaignSessionVm[]): void {
    let saved = '';
    try { if (typeof localStorage !== 'undefined') saved = localStorage.getItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${campaignId}`) ?? ''; } catch {}
    this.http.get<{ sessionId: string }>(`/api/v2/campaigns/${campaignId}/active-session`).subscribe({
      next: (res) => this.setActiveSession(list.find((s) => s.sessionId === res?.sessionId)?.sessionId ?? list.find((s) => s.sessionId === saved)?.sessionId ?? list[0]?.sessionId ?? '', false),
      error: () => this.setActiveSession(list.find((s) => s.sessionId === saved)?.sessionId ?? list[0]?.sessionId ?? '', false),
    });
  }

  setActiveSession(sessionId: string, syncServer = true): void {
    if (!sessionId) return;
    this.activeSessionId.set(sessionId);
    const cid = this.activeCampaignId();
    try { if (typeof localStorage !== 'undefined' && cid > 0) localStorage.setItem(`${ACTIVE_SESSION_STORAGE_PREFIX}${cid}`, sessionId); } catch {}
    if (syncServer && cid > 0) {
      this.http.post(`/api/v2/campaigns/${cid}/active-session`, { sessionId }).subscribe({ error: () => {} });
      const sessLabel = this.sessions().find((s) => s.sessionId === sessionId)?.label || sessionId;
      this.audio.fireTrigger('session', sessionId, sessLabel, true);
    }
  }

  createSession(req: { title: string; summary: string; locationLabel: string }): void {
    const nextNum = (this.sessions()[0]?.sessionNumber ?? 15) + 1;
    const sessionId = `session-${nextNum}-${Date.now().toString().slice(-3)}`;
    const created: CampaignSessionVm = {
      sessionId, sessionNumber: nextNum, title: req.title, label: `Session ${nextNum} · ${req.title}`,
      locationName: req.locationLabel, locationLabel: req.locationLabel, dateLabel: 'Upcoming', statusLabel: 'Current / Upcoming',
      xpAwarded: 0, summary: req.summary || 'Planned campaign session.', highlights: [], status: 'upcoming',
    };
    this.sessions.update((cur) => [created, ...cur]);
    this.setActiveSession(sessionId);
    this.notifications.notifyUpcomingSessionLive(this.activeCampaignId() || 1, this.activeCampaign().name, created.label, created.locationLabel);
  }

  openAdventureGuideModal(scope: 'session' | 'adventure' | 'current-session' | 'whole-guide' = 'session'): void {
    this.adventureGuideModalScope.set(scope === 'adventure' || scope === 'whole-guide' ? 'adventure' : 'session');
    this.adventureGuideModalOpen.set(true);
  }
  closeAdventureGuideModal(): void { this.adventureGuideModalOpen.set(false); }

  loadSessionAttachments(campaignId = this.activeCampaignId()): void {
    if (campaignId <= 0) { this.sessionAttachments.set([]); return; }
    this.http.get<readonly SessionAttachmentVm[]>(`/api/v2/campaigns/${campaignId}/session-attachments?role=${this.viewerRole()}`).subscribe({
      next: (items) => this.sessionAttachments.set((items ?? []).map((i) => ({ ...i, elementId: i.elementId || i.targetKey, targetKey: i.targetKey || i.elementId }))),
      error: () => {},
    });
  }

  attachElementToSession(req: { sessionId?: string; elementKind: SessionAttachmentVm['elementKind']; targetKey?: string; elementId?: string; title: string; subtitle?: string; summary?: string; routeLink?: string; visibility?: 'players' | 'gm'; questKind?: 'main' | 'side' | null; artworkUrl?: string | null }): void {
    const cid = this.activeCampaignId();
    const sid = req.sessionId || this.activeSessionId() || this.sessions()[0]?.sessionId || 'session-15';
    const key = req.targetKey || req.elementId || `${req.elementKind.toLowerCase()}-${Date.now().toString().slice(-5)}`;
    const optimistic: SessionAttachmentVm = {
      id: `${sid}:${req.elementKind}:${key}`.toLowerCase(), sessionId: sid, elementKind: req.elementKind,
      targetKey: key, elementId: key, title: req.title, subtitle: req.subtitle || req.elementKind,
      summary: req.summary || `Attached to ${sid}`, routeLink: req.routeLink || '/sessions',
      visibility: req.visibility ?? 'players', questKind: req.questKind ?? null, artworkUrl: req.artworkUrl ?? null,
    };
    this.sessionAttachments.update((cur) => [optimistic, ...cur.filter((a) => a.id !== optimistic.id)]);
    if (optimistic.visibility !== 'gm') this.notifications.notifyNoteOrLorePublished(cid || 1, this.activeCampaign().name, req.title, req.elementKind, optimistic.routeLink);
    if (cid > 0) {
      this.http.post<SessionAttachmentVm>(`/api/v2/campaigns/${cid}/session-attachments?role=${this.viewerRole()}`, { ...req, targetKey: key, sessionId: sid }).subscribe({
        next: (saved) => this.sessionAttachments.update((cur) => [{ ...saved, elementId: saved.elementId || saved.targetKey, targetKey: saved.targetKey || saved.elementId }, ...cur.filter((a) => a.id !== saved.id && a.id !== optimistic.id)]),
        error: () => {},
      });
    }
  }

  detachElementFromSession(attachmentId: string): void {
    const cid = this.activeCampaignId();
    this.sessionAttachments.update((cur) => cur.filter((a) => a.id !== attachmentId));
    if (cid > 0) {
      this.http.delete<readonly SessionAttachmentVm[]>(`/api/v2/campaigns/${cid}/session-attachments/${encodeURIComponent(attachmentId)}?role=${this.viewerRole()}`).subscribe({
        next: (list) => this.sessionAttachments.set((list ?? []).map((i) => ({ ...i, elementId: i.elementId || i.targetKey, targetKey: i.targetKey || i.elementId }))),
        error: () => {},
      });
    }
  }

  setViewerRole(role: ViewerRole): void {
    if (!this.isGmForActiveCampaign()) { this.viewerRole.set('players'); this.refreshCampaignDashboard(); return; }
    this.viewerRole.set(role); this.refreshCampaignDashboard(); this.loadSessionAttachments();
  }

  setGenerativeAiOptIn(enabled: boolean): void {
    this.weaveEnabled.set(enabled);
    this.campaigns.update((list) => list.map((c) => ({ ...c, weaveEnabled: enabled })));
    if (!enabled) { this.hideAiContent.set(true); if (this.inspectedEntity()?.canonStatus === 'draft') this.inspectedEntityKey.set(null); }
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(GENERATIVE_AI_OPT_IN_STORAGE_KEY, String(enabled)); } catch {}
  }

  toggleWeave(): void { this.setGenerativeAiOptIn(!this.weaveEnabled()); }
  setHideAiContent(hide: boolean): void { this.hideAiContent.set(hide); try { if (typeof localStorage !== 'undefined') localStorage.setItem(HIDE_AI_CONTENT_STORAGE_KEY, String(hide)); } catch {} }
  setExperienceMode(mode: LwExperienceMode): void { this.experienceMode.set(mode); try { if (typeof localStorage !== 'undefined') localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode); } catch {} }

  refreshCampaignDashboard(): void {
    const campaignId = this.activeCampaignId();
    const role = this.viewerRole();
    this.campaignDashboard.set(buildEmptyDashboard(campaignId));
    if (campaignId <= 0) return;
    this.http.get<CampaignDashboardVm>(`/api/v2/campaigns/${campaignId}/dashboard?role=${role}`).subscribe({
      next: (res) => { if (res && res.campaignId === this.activeCampaignId()) this.campaignDashboard.set(res); },
      error: () => { if (this.activeCampaignId() === campaignId) this.campaignDashboard.set(buildEmptyDashboard(campaignId)); },
    });
  }

  togglePrepChecklistItem(itemId: string): void {
    if (this.viewerRole() !== 'gm') return;
    const campaignId = this.activeCampaignId();
    this.campaignDashboard.update((cur) => {
      const updatedList = cur.upcomingSession.checklist.map((item) => item.id === itemId ? { ...item, completed: !item.completed } : item);
      const completedCount = updatedList.filter((i) => i.completed).length;
      const totalCount = updatedList.length;
      return { ...cur, upcomingSession: { ...cur.upcomingSession, completedPrepCount: completedCount, totalPrepCount: totalCount, prepStatusLabel: completedCount === 0 ? 'Not Started' : completedCount >= totalCount ? 'Ready' : 'Prep In Progress', checklist: updatedList } };
    });
    this.http.post<CampaignDashboardVm>(`/api/v2/campaigns/${campaignId}/dashboard/prep/${itemId}/toggle?role=${this.viewerRole()}`, {}).subscribe({ next: (res) => { if (res && res.campaignId === this.activeCampaignId()) this.campaignDashboard.set(res); }, error: () => {} });
  }

  toggleSessionBeat(beatId: string): void {
    const campaignId = this.activeCampaignId();
    this.campaignDashboard.update((cur) => ({ ...cur, sessionGuide: { ...cur.sessionGuide, beats: cur.sessionGuide.beats.map((b) => (b.id === beatId ? { ...b, done: !b.done } : b)) } }));
    this.http.post<CampaignDashboardVm>(`/api/v2/campaigns/${campaignId}/dashboard/beats/${beatId}/toggle?role=${this.viewerRole()}`, {}).subscribe({ next: (res) => { if (res && res.campaignId === this.activeCampaignId()) this.campaignDashboard.set(res); }, error: () => {} });
  }

  acknowledgeDashboardAlert(alertId: string): void {
    const campaignId = this.activeCampaignId();
    this.campaignDashboard.update((cur) => ({ ...cur, alerts: cur.alerts.map((a) => (a.id === alertId ? { ...a, read: true } : a)) }));
    this.http.post<CampaignDashboardVm>(`/api/v2/campaigns/${campaignId}/dashboard/alerts/${alertId}/acknowledge?role=${this.viewerRole()}`, {}).subscribe({ next: (res) => { if (res && res.campaignId === this.activeCampaignId()) this.campaignDashboard.set(res); }, error: () => {} });
  }
  toggleLoomDrawer(open?: boolean): void { this.loomDrawerOpen.update((cur) => (open !== undefined ? open : !cur)); }
  setLoomSearchQuery(query: string): void { this.loomQuery.set(query); }
  inspectEntity(keyOrComposite: string | null): void { this.inspectedEntityKey.set(keyOrComposite); }
  registerEntity(entity: EntityCardVm): void {
    this.rawEntities.update((list) => [entity, ...list.filter((e) => e.compositeKey !== entity.compositeKey)]);
    if (entity.visibility !== 'gm') this.notifications.notifyNoteOrLorePublished(this.activeCampaignId() || 1, this.activeCampaign().name, entity.name, entity.entityType, entity.routeLink || '/world-lore');
  }
  registerGraphEdge(edge: GraphEdgeVm): void { this.rawEdges.update((list) => [edge, ...list]); }
  approveDraftEntity(compositeKey: string): void {
    if (this.viewerRole() !== 'gm') return;
    const found = this.rawEntities().find((e) => e.compositeKey === compositeKey);
    this.rawEntities.update((list) => list.map((e) => (e.compositeKey === compositeKey ? { ...e, canonStatus: 'approved', visibility: 'players' } : e)));
    if (found) this.notifications.notifyNoteOrLorePublished(this.activeCampaignId() || 1, this.activeCampaign().name, found.name, found.entityType, found.routeLink || '/world-lore');
  }
  unlockAsset(assetId: string): void { this.rawAssets.update((list) => list.map((a) => (a.id === assetId ? { ...a, entitlement: 'purchased', priceLabel: 'Owned (Unlocked)' } : a))); }

  rollGlobalQuickD20(): void {
    const who = this.activeUsername() || 'Table Roller';
    const trigger = (v: number, n20: boolean, n1: boolean) => {
      this.quickRollBanner.set(`d20: ${v}${n20 ? ' (NAT 20!)' : n1 ? ' (NAT 1)' : ''}`);
      this.fullscreenDice.triggerFullScreenRoll({ label: 'Quick d20 Roll', actorName: who, expression: '1d20', diceValues: [v], modifier: 0, total: v, isNat20: n20, isCritFail: n1, alert: { whoRolled: who, rollType: 'Quick d20 Roll', formula: '1d20 + 0', naturalDie: v, modifier: 0, modifiersBreakdown: '+0 Flat d20', adjustedTotal: v, isNat20: n20, isCritFail: n1 } });
    };
    this.http.post<{ total: number; isNat20: boolean; isNat1: boolean }>(`/api/v2/campaigns/${this.activeCampaignId()}/dice/roll`, { sides: 20, count: 1, modifier: 0, rollMode: 'normal', label: 'Core Shell Quick d20', skinId: 'skin-obsidian-gold' }).subscribe({
      next: (res) => trigger(res.total, res.isNat20, res.isNat1),
      error: () => { const v = Math.floor(Math.random() * 20) + 1; trigger(v, v === 20, v === 1); },
    });
  }

  private restoreGenerativeAiPreference(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const isOptedIn = localStorage.getItem(GENERATIVE_AI_OPT_IN_STORAGE_KEY) === 'true';
      this.weaveEnabled.set(isOptedIn);
      this.campaigns.update((list) => list.map((c) => ({ ...c, weaveEnabled: isOptedIn })));
      const savedHide = localStorage.getItem(HIDE_AI_CONTENT_STORAGE_KEY);
      this.hideAiContent.set(savedHide !== null ? savedHide === 'true' : !isOptedIn);
      const savedMode = localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY);
      if (savedMode === 'guided' || savedMode === 'advanced') this.experienceMode.set(savedMode);
    } catch {}
  }

  private verifyPolyglotHealth(): void {
    this.http.get<{ status: string }>('/api/v2/health').subscribe({ next: (res) => this.backendOnline.set(res?.status === 'healthy'), error: () => this.backendOnline.set(true) });
  }
}
