import { Subject, takeUntil } from 'rxjs';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import {
  LwMonsterAssignmentVm,
  LwMonsterCollectionVm,
  LwMonsterDetailVm,
  LwMonsterPickOptionVm,
  LwMonsterPlacementRequest,
  LwMonsterPlacementVm,
  LwMonsterSightingDraft,
  LwMonsterSightingVm,
  LwMonsterAssignmentDraft,
  LwSaveMonsterCollectionDraft,
} from '../../../shared/ui/public-api';
import { VttCombatService } from '../../arcane-screen/services/vtt-combat.service';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
import { BestiaryApiService } from './bestiary-api.service';
import { apiErrorMessage } from './bestiary-catalog.service';
import { buildEncounterMonsterSlot } from './bestiary-encounter.mapper';

/**
 * Campaign-aware bestiary state. GM-ness is resolved per active campaign (a player in one campaign can be the DM
 * of another); DM prep data is fetched only for the effective GM and the server re-checks every request.
 */
@Injectable({ providedIn: 'root' })
export class BestiaryCampaignService {
  private readonly auth = inject(AuthSessionService);
  private readonly contextChanged = new Subject<void>();
  private readonly api = inject(BestiaryApiService);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly vtt = inject(VttCombatService);
  private readonly characters = inject(CharacterStudioService);
  private readonly alertify = inject(LwAlertifyService);

  readonly isEffectiveGm = computed(() => this.store.isGmForActiveCampaign() && this.store.viewerRole() === 'gm');
  readonly role = computed(() => (this.isEffectiveGm() ? 'gm' : 'players'));

  readonly collections = signal<readonly LwMonsterCollectionVm[]>([]);
  readonly assignments = signal<readonly LwMonsterAssignmentVm[]>([]);
  readonly placements = signal<readonly LwMonsterPlacementVm[]>([]);
  readonly sightings = signal<readonly LwMonsterSightingVm[]>([]);
  readonly busy = signal<boolean>(false);
  readonly collectionError = signal<string>('');
  readonly activeCollectionId = signal<string>('all');

  readonly collectionsForCampaign = computed(() =>
    this.collections().filter((c) => c.assignedCampaignIds.includes(this.store.activeCampaignId())),
  );
  readonly activeCollection = computed(
    () => this.collections().find((c) => c.id === this.activeCollectionId()) ?? null,
  );

  readonly sessionOptions = computed<readonly LwMonsterPickOptionVm[]>(() =>
    this.vtt.sessionsForActiveCampaign().map((s) => ({ id: s.id, label: s.title, hint: s.locationName })),
  );

  readonly encounterOptions = computed<readonly LwMonsterPickOptionVm[]>(() => {
    const cid = this.store.activeCampaignId();
    const all = this.vtt.encounterDetails();
    const own = all.filter((e) => e.campaignId === cid);
    return own.map((e) => ({
      id: e.id,
      label: e.name,
      hint: e.sessionTitle,
    }));
  });

  readonly characterOptions = computed<readonly LwMonsterPickOptionVm[]>(() =>
    this.characters.authorizedSheetsForActiveCampaign().map((c) => ({ id: c.characterKey, label: c.name })),
  );

  /** Campaigns where the signed-in user is DM; the only valid collection assignment targets. */
  readonly gmCampaignOptions = computed<readonly LwMonsterPickOptionVm[]>(() =>
    this.store
      .campaigns()
      .filter((c) => this.store.isUserGmForCampaign(c))
      .map((c) => ({ id: String(c.id), label: c.name })),
  );

  constructor() {
    effect(() => {
      this.auth.activeAccountId();
      this.contextChanged.next();
      this.busy.set(false);
      const cid = this.store.activeCampaignId();
      const gm = this.isEffectiveGm();
      this.sightings.set([]);
      this.sightingRequest++;
      this.activeCollectionId.set('all');
      this.collections.set([]);
      this.assignments.set([]);
      this.placements.set([]);
      if (gm) this.loadState(cid);
    });
  }

  private sightingRequest = 0;

  loadState(campaignId = this.store.activeCampaignId()): void {
    if (!this.isEffectiveGm()) return;
    this.api.getCampaignState(campaignId, 'gm').pipe(takeUntil(this.contextChanged)).subscribe({
      next: (s) => {
        if (campaignId !== this.store.activeCampaignId() || !this.isEffectiveGm()) return;
        this.collections.set(s.collections);
        this.assignments.set(s.assignments);
        this.placements.set(s.placements);
      },
      error: () => {},
    });
  }

  loadSightings(monsterKey: string): void {
    const cid = this.store.activeCampaignId();
    const request = ++this.sightingRequest;
    const role = this.role();
    this.sightings.set([]);
    this.api.listSightings(cid, this.role(), monsterKey).pipe(takeUntil(this.contextChanged)).subscribe({
      next: (list) => {
        if (request === this.sightingRequest && cid === this.store.activeCampaignId() && role === this.role()) this.sightings.set(list);
      },
      error: () => this.sightings.set([]),
    });
  }

  assignmentFor(key: string): LwMonsterAssignmentVm | null {
    return this.assignments().find((a) => a.monsterKey === key) ?? null;
  }

  placementsFor(key: string): readonly LwMonsterPlacementVm[] {
    return this.placements().filter((p) => p.monsterKey === key);
  }

  addPlacement(detail: LwMonsterDetailVm, req: LwMonsterPlacementRequest): void {
    const cid = this.store.activeCampaignId();
    const session = this.vtt.sessions().find((s) => s.id === req.sessionId);
    const encounter = this.vtt.encounterDetails().find((e) => e.id === req.encounterId);
    this.busy.set(true);
    this.api
      .addPlacement(cid, 'gm', {
        monsterKey: detail.summary.key,
        monsterName: detail.summary.name,
        scope: req.scope,
        sessionId: req.sessionId ?? null,
        sessionLabel: session?.title ?? null,
        encounterId: req.encounterId ?? null,
        encounterLabel: encounter?.name ?? null,
        count: req.count,
      })
      .pipe(takeUntil(this.contextChanged)).subscribe({
        next: (p) => {
          this.busy.set(false);
          this.placements.update((list) => [p, ...list]);
          if (encounter && req.scope === 'encounter') {
            const slot = buildEncounterMonsterSlot(detail, req.count, this.assignmentFor(detail.summary.key));
            const monsters = [...encounter.monsters, slot];
            this.vtt.saveEncounterDetail({
              ...encounter,
              monsters,
              enemyCount: monsters.reduce((n, m) => n + m.count, 0),
              totalXp: monsters.reduce((n, m) => n + m.xpValue * m.count, 0),
            });
          }
          const where = req.scope === 'campaign' ? this.store.activeCampaign().name : (encounter?.name ?? session?.title ?? '');
          this.alertify.notifyStatus(p.addedBy, 'Added to campaign prep', `${detail.summary.name} added to ${where}.`, 'emerald');
        },
        error: (err) => this.fail(err, 'Could not add the monster.'),
      });
  }

  removePlacement(placementId: string): void {
    this.api.removePlacement(this.store.activeCampaignId(), 'gm', placementId).pipe(takeUntil(this.contextChanged)).subscribe({
      next: () => this.placements.update((list) => list.filter((p) => p.id !== placementId)),
      error: (err) => this.fail(err, 'Could not remove the placement.'),
    });
  }

  saveAssignment(monsterKey: string, draft: LwMonsterAssignmentDraft): void {
    const blankToNull = (v: string) => (v ? v : null);
    this.busy.set(true);
    this.api
      .saveAssignment(this.store.activeCampaignId(), 'gm', monsterKey, {
        primaryTokenUrl: blankToNull(draft.primaryTokenUrl),
        secondaryTokenUrl: blankToNull(draft.secondaryTokenUrl),
        primaryModelUrl: blankToNull(draft.primaryModelUrl),
        secondaryModelUrl: blankToNull(draft.secondaryModelUrl),
      })
      .pipe(takeUntil(this.contextChanged)).subscribe({
        next: (a) => {
          this.busy.set(false);
          this.assignments.update((list) => [a, ...list.filter((x) => x.monsterKey !== monsterKey)]);
          this.alertify.notifyStatus(a.updatedBy, 'Token assignments saved', `Applied to ${this.store.activeCampaign().name} only.`, 'emerald');
        },
        error: (err) => this.fail(err, 'Could not save token assignments.'),
      });
  }

  recordSighting(detail: LwMonsterDetailVm, draft: LwMonsterSightingDraft): void {
    const session = this.vtt.sessions().find((s) => s.id === draft.sessionId);
    const encounter = this.vtt.encounterDetails().find((e) => e.id === draft.encounterId);
    this.busy.set(true);
    this.api
      .recordSighting(this.store.activeCampaignId(), 'gm', {
        monsterKey: detail.summary.key,
        monsterName: detail.summary.name,
        outcome: draft.outcome,
        sessionId: session?.id ?? null,
        sessionLabel: session?.title ?? null,
        locationName: draft.locationName || session?.locationName || null,
        encounterId: encounter?.id ?? null,
        encounterLabel: encounter?.name ?? null,
        witnessCharacterKeys: draft.witnessCharacterKeys,
        visibility: draft.visibility,
        notes: draft.notes || null,
      })
      .pipe(takeUntil(this.contextChanged)).subscribe({
        next: (s) => {
          this.busy.set(false);
          this.sightings.update((list) => [s, ...list]);
          this.alertify.notifyStatus('The Loom', 'Meeting recorded', `${s.monsterName}: ${s.outcome}.`, 'emerald');
        },
        error: (err) => this.fail(err, 'The Loom could not record this meeting.'),
      });
  }

  saveCollection(draft: LwSaveMonsterCollectionDraft, onSaved: (c: LwMonsterCollectionVm) => void): void {
    this.busy.set(true);
    this.collectionError.set('');
    this.api.saveCollection(this.store.activeCampaignId(), 'gm', draft).pipe(takeUntil(this.contextChanged)).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.collections.update((list) => [c, ...list.filter((x) => x.id !== c.id)].sort((a, b) => a.name.localeCompare(b.name)));
        onSaved(c);
      },
      error: (err) => {
        this.busy.set(false);
        this.collectionError.set(apiErrorMessage(err, 'The collection could not be saved.'));
      },
    });
  }

  toggleInCollection(collectionId: string, monsterKey: string): void {
    const c = this.collections().find((x) => x.id === collectionId);
    if (!c) return;
    const has = c.monsterKeys.includes(monsterKey);
    const monsterKeys = has ? c.monsterKeys.filter((k) => k !== monsterKey) : [...c.monsterKeys, monsterKey];
    this.saveCollection({ ...c, monsterKeys }, () => {});
  }

  deleteCollection(collectionId: string, onDeleted: () => void): void {
    this.busy.set(true);
    this.api.deleteCollection(this.store.activeCampaignId(), 'gm', collectionId).pipe(takeUntil(this.contextChanged)).subscribe({
      next: () => {
        this.busy.set(false);
        this.collections.update((list) => list.filter((c) => c.id !== collectionId));
        if (this.activeCollectionId() === collectionId) this.activeCollectionId.set('all');
        onDeleted();
      },
      error: (err) => {
        this.busy.set(false);
        this.collectionError.set(apiErrorMessage(err, 'The collection could not be deleted.'));
      },
    });
  }

  private fail(err: unknown, fallback: string): void {
    this.busy.set(false);
    this.alertify.notifyStatus('Bestiary', 'Action failed', apiErrorMessage(err, fallback), 'crimson');
  }
}
