import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  StoryBeatItemVm,
  StoryLoreClueFeedItemVm,
  StorySessionSequenceItemVm,
  TruthAssessmentStatus,
} from '../../core/models/connected-story.models';
import { AdventureGuideService } from '../../core/services/adventure-guide.service';
import { ConnectedStoryService } from '../../core/services/connected-story.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwBadgeComponent,
  LwButtonComponent,
  LwEmptyStateComponent,
  LwEntityCardComponent,
  LwIconComponent,
  LwQuestStepToggleEvent,
  LwQuestTrackerCardComponent,
  LwQuestTrackerItem,
  LwPageHeaderComponent,
} from '../../shared/ui/public-api';

export type StoryPageViewMode = 'story-acts' | 'evidence-chain' | 'quests-registry';

@Component({
  selector: 'lw-campaigns-page',
  standalone: true,
  imports: [
    LwPageHeaderComponent,
    FormsModule,
    RouterLink,
    LwBadgeComponent,
    LwButtonComponent,
    LwIconComponent,
    LwEntityCardComponent,
    LwEmptyStateComponent,
    LwQuestTrackerCardComponent,
  ],
  templateUrl: './campaigns.page.html',
  styleUrl: './campaigns.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampaignsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly store = inject(LoomWeaverStoreService);
  readonly story = inject(ConnectedStoryService);
  readonly advGuide = inject(AdventureGuideService);

  readonly generativeAiEnabled = input<boolean>(false);
  readonly isWeaveEnabled = computed(
    () => this.generativeAiEnabled() || this.store.weaveEnabled(),
  );

  readonly viewMode = signal<StoryPageViewMode>('story-acts');
  readonly showAddBeatModal = signal<boolean>(false);
  readonly targetActId = signal<string>('act-2');
  readonly targetSessionId = signal<string>('');
  readonly targetSceneKey = signal<string>('');
  readonly newBeatTitle = signal<string>('');
  readonly newBeatKind = signal<string>('scene');
  readonly newBeatLocationKey = signal<string>('loc-ruined-chapel');

  readonly availableSessionOptions = computed(() => {
    const storeSessions = this.store.sessions();
    if (storeSessions.length > 0) {
      return storeSessions.map((s) => ({
        id: s.sessionId,
        label: s.label || `Session ${s.sessionNumber} — ${s.title}`,
      }));
    }
    return this.story.workspace().sessionSequence.map((s) => ({
      id: s.sessionId,
      label: s.title,
    }));
  });

  readonly availableBattlemaps = computed(() => {
    const mapByKey = new Map<string, { sceneKey: string; name: string }>();
    for (const sc of this.store.authorizedScenes()) {
      mapByKey.set(sc.sceneKey, { sceneKey: sc.sceneKey, name: sc.name });
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('lw.mapStudio.savedScenes.v1');
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, { sceneKey?: string; name?: string }>;
          for (const entry of Object.values(parsed)) {
            if (entry?.sceneKey && entry?.name && !mapByKey.has(entry.sceneKey)) {
              mapByKey.set(entry.sceneKey, { sceneKey: entry.sceneKey, name: entry.name });
            }
          }
        }
      } catch {
        // ignore storage parse errors
      }
    }
    if (!mapByKey.has('scene-c1-shattered-nave')) {
      mapByKey.set('scene-c1-shattered-nave', {
        sceneKey: 'scene-c1-shattered-nave',
        name: 'Ruined Chapel — Shattered Nave',
      });
    }
    if (!mapByKey.has('scene-vampire-gala-ballroom')) {
      mapByKey.set('scene-vampire-gala-ballroom', {
        sceneKey: 'scene-vampire-gala-ballroom',
        name: 'Vampire Gala — Crimson Ballroom',
      });
    }
    return Array.from(mapByKey.values());
  });

  readonly relFromKey = signal<string>('');
  readonly relType = signal<string>('CURRENTLY_IN');
  readonly relToKey = signal<string>('');
  readonly relWhyLabel = signal<string>('');
  readonly relMarkHistorical = signal<boolean>(true);

  readonly selectedCategory = signal<string>('All');
  readonly categories = ['All', 'Quest', 'NPC', 'Location', 'Faction', 'Clue', 'Secret'];
  readonly quests = signal<readonly LwQuestTrackerItem[]>([]);
  readonly questXpBanner = signal<string>('Select a campaign to load its quests.');

  readonly filteredEntities = computed(() => {
    const cat = this.selectedCategory();
    const weaveOn = this.isWeaveEnabled();
    return this.store
      .authorizedEntities()
      .filter(
        (e) =>
          e.entityType !== 'Character' &&
          (weaveOn || e.canonStatus !== 'draft') &&
          (cat === 'All' || e.entityType === cat),
      );
  });

  readonly truthOptions: readonly TruthAssessmentStatus[] = [
    'confirmed',
    'unverified',
    'disputed',
    'disproven',
  ];

  constructor() {
    effect((onCleanup) => {
      const campaignId = this.store.activeCampaignId();
      this.quests.set([]);
      if (campaignId <= 0) {
        this.questXpBanner.set('Select a campaign to load its quests.');
        return;
      }

      this.questXpBanner.set('Loading campaign quests.');
      const subscription = this.http
        .get<readonly LwQuestTrackerItem[]>(`/api/v2/campaigns/${campaignId}/quests`)
        .subscribe({
          next: (quests) => {
            this.quests.set(quests ?? []);
            this.questXpBanner.set(
              quests?.length ? 'Campaign quests loaded.' : 'No saved quests exist for this campaign yet.',
            );
          },
          error: () => {
            this.quests.set([]);
            this.questXpBanner.set('Campaign quests could not be loaded.');
          },
        });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  openAddBeatForAct(actId: string): void {
    this.targetActId.set(actId);
    if (!this.targetSessionId()) {
      this.targetSessionId.set(
        this.store.activeSessionId() || this.availableSessionOptions()[0]?.id || '',
      );
    }
    this.showAddBeatModal.set(true);
  }

  submitNewBeat(): void {
    const title = this.newBeatTitle().trim();
    if (!title) return;
    this.story.addBeat(this.targetActId(), title, this.newBeatKind(), this.newBeatLocationKey());
    const sessionId = this.targetSessionId();
    const sceneKey = this.targetSceneKey();
    if (sessionId && sceneKey) {
      this.assignBattlemapToSession(sessionId, sceneKey);
    }
    this.newBeatTitle.set('');
    this.showAddBeatModal.set(false);
  }

  assignBattlemapToSession(sessionId: string, sceneKey: string): void {
    if (!sessionId || !sceneKey) return;
    const mapObj = this.availableBattlemaps().find((m) => m.sceneKey === sceneKey);
    const sessObj = this.availableSessionOptions().find((s) => s.id === sessionId);
    const mapTitle = mapObj?.name || sceneKey;
    const sessLabel = sessObj?.label || sessionId;
    this.store.setActiveSession(sessionId);
    this.advGuide.assignBattlemapToSessionAndPlace({
      sceneKey,
      sceneTitle: mapTitle,
      sessionId,
      sessionTitle: sessLabel,
      locationNodeId: this.newBeatLocationKey() || 'node-room-c1-nave',
      locationTitle: sessLabel,
      artworkUrl: '/battlemap-showcase.jpg',
    });
    this.store.attachElementToSession({
      sessionId,
      elementKind: 'Map',
      targetKey: sceneKey,
      title: mapTitle,
      subtitle: `Battlemap · ${sessLabel}`,
      summary: `Assigned to ${sessLabel}`,
      routeLink: `/arcane-screen?scene=${sceneKey}`,
      visibility: 'players',
      artworkUrl: '/battlemap-showcase.jpg',
    });
    this.story.statusBanner.set(`Assigned map '${mapTitle}' to ${sessLabel}.`);
  }

  onBeatSelected(beat: StoryBeatItemVm): void {
    this.story.selectBeat(beat);
  }

  onSessionSelected(ses: StorySessionSequenceItemVm): void {
    this.targetSessionId.set(ses.sessionId);
    this.store.setActiveSession(ses.sessionId);
    this.advGuide.selectScope('session', ses.sessionId);
  }

  onFeedItemSelected(item: StoryLoreClueFeedItemVm): void {
    this.story.navigateConnectedElement(item.compositeKey, item.routeLink, null, item.loreEntryId);
  }

  resumeCurrentSession(): void {
    this.advGuide.selectScope('session', 'session-15');
    this.router.navigateByUrl('/arcane-screen');
  }

  openStoryPlanner(): void {
    this.viewMode.set(this.viewMode() === 'evidence-chain' ? 'story-acts' : 'evidence-chain');
  }

  submitNewRelationship(): void {
    this.story.createRelationship(
      this.relFromKey(),
      this.relType(),
      this.relToKey(),
      this.relWhyLabel(),
      'players',
      this.relMarkHistorical(),
    );
  }

  beatIcon(kind: string): string {
    switch (kind) {
      case 'quest':
        return 'compass';
      case 'location':
        return 'map-pin';
      case 'clue':
        return 'search';
      case 'npc':
        return 'users';
      case 'lore':
        return 'book-open';
      case 'secret':
        return 'lock';
      case 'monster':
      case 'encounter':
        return 'swords';
      default:
        return 'flag';
    }
  }

  handleStepToggle(event: LwQuestStepToggleEvent): void {
    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) {
      this.questXpBanner.set('Select a campaign before updating a quest.');
      return;
    }

    this.http
      .post<{ quest: LwQuestTrackerItem; awardedXp: number; message: string }>(
        `/api/v2/campaigns/${campaignId}/quests/${event.questId}/steps/${event.stepId}/toggle`,
        {},
      )
      .subscribe({
        next: (res) => {
          if (res?.quest) {
            this.quests.update((list) =>
              list.map((q) => (q.id === event.questId ? res.quest : q)),
            );
          }
          if (res?.message) this.questXpBanner.set(res.message);
        },
        error: () => this.questXpBanner.set('Quest progress could not be saved. No XP was awarded.'),
      });
  }
}
