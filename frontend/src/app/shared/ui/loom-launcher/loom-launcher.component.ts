import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { NgpInput } from 'ng-primitives/input';
import { LoomCitationVm } from '../../../core/models/loomweaver.models';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwIconComponent } from '../icon/icon.component';
import { LwModalComponent } from '../modal/modal.component';

export interface LoomQuickPromptCard {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly query: string;
}

export interface LoomConversationTurnVm {
  readonly id: string;
  readonly question: string;
  readonly paragraphs: readonly string[];
  readonly sourceTags: readonly string[];
  readonly references: readonly LoomCitationVm[];
  readonly isExample?: boolean;
}

@Component({
  selector: 'lw-loom-launcher',
  standalone: true,
  imports: [
    FormsModule,
    NgpButton,
    NgpInput,
    LwBadgeComponent,
    LwIconComponent,
    LwModalComponent,
  ],
  templateUrl: './loom-launcher.component.html',
  styleUrl: './loom-launcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwLoomLauncherComponent {
  readonly store = inject(LoomWeaverStoreService);
  private readonly router = inject(Router);
  readonly generativeAiEnabled = input<boolean>(false);

  readonly promptDraft = signal<string>('');
  readonly conversationTurns = signal<readonly LoomConversationTurnVm[]>([]);
  readonly expandedSourceTurnIds = signal<ReadonlySet<string>>(new Set());
  private lastHandledStoreQuery = '';

  readonly quickPrompts: readonly LoomQuickPromptCard[] = [
    {
      id: 'catch-up',
      label: 'Catch me up',
      icon: 'scroll',
      query: 'What happened in our most recent session?',
    },
    {
      id: 'active-quests',
      label: 'Active quests',
      icon: 'swords',
      query: 'What quests and clues are currently active?',
    },
    {
      id: 'npcs-factions',
      label: 'NPCs & factions',
      icon: 'users',
      query: 'Who are the key NPCs and factions in our campaign?',
    },
    {
      id: 'unresolved-mysteries',
      label: 'Unresolved mysteries',
      icon: 'book-open',
      query: 'What unresolved mysteries or clues are still open?',
    },
  ];

  readonly activeCampaignTitle = computed(
    () => this.store.activeCampaign().name || 'Shadow of the Mountain',
  );

  readonly viewerRoleBadgeLabel = computed(() =>
    this.store.viewerRole() === 'gm' ? 'GM View' : 'Player View',
  );

  readonly footerSessionStatus = computed(() => {
    const sessions = this.store.sessions();
    const active = this.store.activeSession() ?? sessions[0];
    const num = active?.sessionNumber ?? 5;
    const perm =
      this.store.viewerRole() === 'gm' ? 'GM permissions' : 'Player permissions';
    return `Session ${num} · ${perm}`;
  });

  readonly isShowingExample = computed(() => {
    const turns = this.conversationTurns();
    return turns.length === 1 && !!turns[0]?.isExample;
  });

  constructor() {
    effect(() => {
      const isOpen = this.store.loomDrawerOpen();
      const currentQuery = this.store.loomQuery().trim();
      if (isOpen && this.conversationTurns().length === 0) {
        this.seedExampleTurn();
      }
      if (isOpen && currentQuery && currentQuery !== this.lastHandledStoreQuery) {
        this.lastHandledStoreQuery = currentQuery;
        this.askLoom(currentQuery);
      }
    });
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.store.toggleLoomDrawer();
    } else if (event.key === 'Escape' && this.store.loomDrawerOpen()) {
      this.store.toggleLoomDrawer(false);
    }
  }

  onModalOpenChange(open: boolean): void {
    this.store.toggleLoomDrawer(open);
  }

  submitDraft(): void {
    const q = this.promptDraft().trim();
    if (!q) return;
    this.promptDraft.set('');
    this.askLoom(q);
  }

  askLoom(question: string): void {
    const trimmed = question.trim();
    if (!trimmed) return;
    this.lastHandledStoreQuery = trimmed;
    this.store.setLoomSearchQuery(trimmed);

    const turn = this.synthesizeTurn(trimmed);
    this.conversationTurns.update((prev) => {
      const nonExample = prev.filter((item) => !item.isExample);
      return [...nonExample, turn];
    });
  }

  isSourcesExpanded(turnId: string): boolean {
    return this.expandedSourceTurnIds().has(turnId);
  }

  toggleSources(turnId: string): void {
    this.expandedSourceTurnIds.update((set) => {
      const next = new Set(set);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }

  openReference(ref: LoomCitationVm): void {
    const rawRoute = ref.routeLink || '/sessions';
    const [pathPart, queryPart] = rawRoute.split('?');
    const queryParams: Record<string, string> = {};
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });
    }
    this.store.inspectEntity(ref.compositeKey);
    this.store.toggleLoomDrawer(false);
    void this.router.navigate([pathPart], { queryParams });
  }

  inspectReferenceInDrawer(ref: LoomCitationVm): void {
    this.store.inspectEntity(ref.compositeKey);
    this.store.toggleLoomDrawer(false);
  }

  openFullLoomWorkspace(): void {
    this.store.toggleLoomDrawer(false);
    void this.router.navigate(['/loom']);
  }

  formatRouteLabel(routeLink: string): string {
    const clean = (routeLink || '').split('?')[0];
    switch (clean) {
      case '/sessions':
        return 'Open in Sessions';
      case '/campaigns':
        return 'Open in Quests & Story';
      case '/world-lore':
        return 'Open in World & Lore';
      case '/characters':
        return 'Open in Characters';
      case '/maps':
        return 'Open in Maps';
      case '/arcane-screen':
        return 'Open in Arcane Screen';
      case '/encounters':
        return 'Open in Encounters';
      case '/handouts':
        return 'Open in Handouts';
      default:
        return `Open ${clean || 'Record'}`;
    }
  }

  private seedExampleTurn(): void {
    const sessions = this.store.sessions();
    const sessionFive =
      sessions.find((s) => s.sessionNumber === 5) ?? sessions[0];
    const loreCit =
      this.store
        .loomCitations()
        .find((c) =>
          `${c.title} ${c.excerpt}`.toLowerCase().includes('lineage') ||
          `${c.title} ${c.excerpt}`.toLowerCase().includes('dal'),
        ) ?? this.store.loomCitations()[0];

    const refs: LoomCitationVm[] = [
      {
        compositeKey: `Session:${sessionFive?.sessionId ?? 'session-5'}`,
        title: sessionFive
          ? `Session ${sessionFive.sessionNumber} — ${sessionFive.title}`
          : 'Session 5 — The Grand Illusion',
        entityType: 'Session',
        excerpt:
          sessionFive?.summary ||
          'The sacred grove assignment. The lineage book. The party is discovered and escapes.',
        routeLink: '/sessions',
        visibility: 'players',
      },
      loreCit ?? {
        compositeKey: '1:Lore:dal-lineage-book',
        title: "Dal Riata's Royal Lineage Ledger",
        entityType: 'Lore',
        excerpt:
          'Recovered museum ledger indicating Dal Riata belongs to the true Edhellainian royal bloodline.',
        routeLink: '/world-lore',
        visibility: 'players',
      },
    ];

    this.conversationTurns.set([
      {
        id: 'example-turn-1',
        question: "What happened with Dal Riata's lineage book?",
        paragraphs: [
          "The party discovered that Dal Riata's family may be the true royal bloodline. The book was taken from the museum, and the group escaped after being discovered.",
          'The connection to the sacred grove assignment remains unresolved.',
        ],
        sourceTags: ['Session 5', 'Lore'],
        references: refs,
        isExample: true,
      },
    ]);
  }

  private synthesizeTurn(question: string): LoomConversationTurnVm {
    const q = question.toLowerCase();
    const sessions = this.store.sessions();
    const activeSess = this.store.activeSession() ?? sessions[0];
    const attachments = this.store.activeSessionAttachments();
    const entities = this.store.authorizedEntities();
    const citations = this.store.loomCitations();

    const sessionRefs: LoomCitationVm[] = sessions.slice(0, 3).map((s) => ({
      compositeKey: `Session:${s.sessionId}`,
      title: `Session ${s.sessionNumber} — ${s.title}`,
      entityType: 'Session',
      excerpt: s.summary || `Location: ${s.locationLabel}`,
      routeLink: '/sessions',
      visibility: 'players',
    }));

    if (
      q.includes('recent session') ||
      q.includes('catch me up') ||
      q.includes('current session') ||
      q.includes('last session') ||
      q.includes('recap')
    ) {
      const latest = activeSess ?? sessions[0];
      const prior = sessions[1];
      const paragraphs: string[] = [];
      if (latest) {
        paragraphs.push(
          `In Session ${latest.sessionNumber} (${latest.title}) at ${latest.locationLabel}, ${latest.summary || 'the party advanced into the next stage of the investigation.'}`,
        );
      }
      if (prior) {
        paragraphs.push(
          `Previously in Session ${prior.sessionNumber} (${prior.title}), ${prior.summary}`,
        );
      }
      const refs = [
        ...sessionRefs.slice(0, 2),
        ...attachments.slice(0, 2).map((a) => ({
          compositeKey: a.targetKey || a.id,
          title: a.title,
          entityType: a.elementKind,
          excerpt: a.subtitle || a.summary,
          routeLink: a.routeLink || '/sessions',
          visibility: a.visibility,
        })),
      ];
      return {
        id: `turn-${Date.now()}`,
        question,
        paragraphs:
          paragraphs.length > 0
            ? paragraphs
            : ['No session recaps have been recorded for this campaign yet.'],
        sourceTags: this.buildSourceTags(refs, latest?.sessionNumber),
        references: refs,
      };
    }

    if (q.includes('quest') || q.includes('active')) {
      const questAttachments = attachments.filter(
        (a) => a.elementKind === 'Quest' || a.elementKind === 'SideQuest',
      );
      const questEntities = entities.filter((e) =>
        ['quest', 'plot', 'clue'].includes(e.entityType.toLowerCase()),
      );
      const refs: LoomCitationVm[] = [
        ...questAttachments.map((qItem) => ({
          compositeKey: qItem.targetKey,
          title: qItem.title,
          entityType: qItem.elementKind === 'SideQuest' ? 'Side Quest' : 'Quest',
          excerpt: qItem.subtitle || qItem.summary,
          routeLink: qItem.routeLink || '/campaigns',
          visibility: qItem.visibility,
        })),
        ...questEntities.slice(0, 3).map((e) => ({
          compositeKey: e.compositeKey,
          title: e.name,
          entityType: e.entityType,
          excerpt: e.summary,
          routeLink: e.routeLink,
          visibility: e.visibility,
        })),
      ].slice(0, 4);

      const finalRefs = refs.length > 0 ? refs : citations.slice(0, 3);
      const topTwo = finalRefs.slice(0, 2);
      const paragraphs = topTwo.map((r) => `${r.title}: ${r.excerpt}`);
      return {
        id: `turn-${Date.now()}`,
        question,
        paragraphs:
          paragraphs.length > 0
            ? paragraphs
            : ['No active quests are currently logged in the campaign records.'],
        sourceTags: this.buildSourceTags(finalRefs, activeSess?.sessionNumber),
        references: finalRefs,
      };
    }

    if (q.includes('npc') || q.includes('faction') || q.includes('who')) {
      const npcEntities = entities.filter((e) =>
        ['npc', 'character', 'faction', 'deity', 'person'].includes(
          e.entityType.toLowerCase(),
        ),
      );
      const refs: LoomCitationVm[] = (
        npcEntities.length > 0 ? npcEntities.slice(0, 4) : entities.slice(0, 4)
      ).map((e) => ({
        compositeKey: e.compositeKey,
        title: e.name,
        entityType: e.entityType,
        excerpt: e.summary,
        routeLink: e.routeLink,
        visibility: e.visibility,
      }));
      const paragraphs: string[] = [];
      if (refs.length > 0) {
        paragraphs.push(
          refs
            .slice(0, 2)
            .map((r) => `${r.title} (${r.entityType}) — ${r.excerpt}`)
            .join(' '),
        );
      }
      if (refs.length > 2) {
        paragraphs.push(
          refs
            .slice(2, 4)
            .map((r) => `${r.title} — ${r.excerpt}`)
            .join(' '),
        );
      }
      return {
        id: `turn-${Date.now()}`,
        question,
        paragraphs:
          paragraphs.length > 0
            ? paragraphs
            : ['No NPCs or factions match that query in your campaign records.'],
        sourceTags: this.buildSourceTags(refs, activeSess?.sessionNumber),
        references: refs,
      };
    }

    if (
      q.includes('myster') ||
      q.includes('unresolved') ||
      q.includes('clue') ||
      q.includes('open')
    ) {
      const mysteryEntities = entities.filter((e) =>
        ['lore', 'clue', 'artifact', 'quest', 'location'].includes(
          e.entityType.toLowerCase(),
        ),
      );
      const refs: LoomCitationVm[] = [
        ...sessionRefs.slice(0, 1),
        ...(mysteryEntities.length > 0 ? mysteryEntities : entities)
          .slice(0, 3)
          .map((e) => ({
            compositeKey: e.compositeKey,
            title: e.name,
            entityType: e.entityType,
            excerpt: e.summary,
            routeLink: e.routeLink,
            visibility: e.visibility,
          })),
      ].slice(0, 4);

      const paragraphs: string[] = [
        refs[1]
          ? `${refs[1].title}: ${refs[1].excerpt}`
          : "Dal Riata's royal lineage ledger and its connection to the sacred grove assignment remain open threads.",
      ];
      if (refs[2]) {
        paragraphs.push(`${refs[2].title}: ${refs[2].excerpt}`);
      }
      return {
        id: `turn-${Date.now()}`,
        question,
        paragraphs,
        sourceTags: this.buildSourceTags(refs, activeSess?.sessionNumber),
        references: refs,
      };
    }

    const refs =
      citations.length > 0
        ? [...citations.slice(0, 3)]
        : [...sessionRefs.slice(0, 2)];
    const paragraphs = refs
      .slice(0, 2)
      .map((r) => `${r.title}: ${r.excerpt}`);

    return {
      id: `turn-${Date.now()}`,
      question,
      paragraphs:
        paragraphs.length > 0
          ? paragraphs
          : ['No matching records were found in this campaign.'],
      sourceTags: this.buildSourceTags(refs, activeSess?.sessionNumber),
      references: refs,
    };
  }

  private buildSourceTags(
    refs: readonly LoomCitationVm[],
    sessionNumber?: number,
  ): readonly string[] {
    const tags: string[] = [];
    for (const ref of refs) {
      const sessionMatch = ref.title.match(/^Session\s+\d+/i);
      const label = sessionMatch
        ? sessionMatch[0]
        : ref.entityType === 'SideQuest'
          ? 'Quest'
          : ref.entityType;
      if (label && !tags.includes(label)) {
        tags.push(label);
      }
      if (tags.length >= 3) break;
    }
    if (tags.length === 0 && sessionNumber) {
      tags.push(`Session ${sessionNumber}`);
    }
    return tags;
  }
}
