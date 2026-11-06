import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { NgpInput } from 'ng-primitives/input';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwModalComponent } from '../modal/modal.component';
import { LwScrollAreaComponent } from '../scroll-area/scroll-area.component';

export interface LwLoomChatReference {
  readonly compositeKey: string;
  readonly title: string;
  readonly entityType: string;
  readonly visibility: 'gm' | 'players' | 'public';
  readonly excerpt: string;
  readonly routeLink: string;
  readonly routeLabel: string;
}

export interface LwLoomChatTurn {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
  readonly timestampLabel: string;
  readonly scopeLabel: string;
  readonly references: readonly LwLoomChatReference[];
  readonly loading?: boolean;
}

interface ServerLoomQueryResponse {
  readonly synthesis?: string;
  readonly graphPaths?: readonly {
    readonly pathSummary: string;
    readonly sourceKey: string;
    readonly relationshipType: string;
    readonly targetKey: string;
    readonly visibility: string;
  }[];
}

@Component({
  selector: 'lw-loom-launcher',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgpButton,
    NgpInput,
    LwBadgeComponent,
    LwButtonComponent,
    LwModalComponent,
    LwScrollAreaComponent,
  ],
  templateUrl: './loom-launcher.component.html',
  styleUrl: './loom-launcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwLoomLauncherComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly store = inject(LoomWeaverStoreService);
  readonly generativeAiEnabled = input<boolean>(false);

  readonly draftQuestion = signal<string>('');

  readonly quickPrompts: readonly string[] = [
    'What is happening in our current session?',
    'Summarize recent session recaps',
    'What quests and clues are active?',
    'Who are the key NPCs & factions in Cinth?',
  ];

  readonly chatTurns = signal<readonly LwLoomChatTurn[]>([]);

  readonly effectiveTurns = computed<readonly LwLoomChatTurn[]>(() => {
    const existing = this.chatTurns();
    if (existing.length > 0) return existing;
    return [this.buildInitialWelcomeTurn()];
  });

  @HostListener('document:keydown', ['$event'])
  onGlobalShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.store.toggleLoomDrawer();
    }
  }

  askQuickPrompt(prompt: string): void {
    this.draftQuestion.set(prompt);
    this.submitQuestion(prompt);
  }

  clearHistory(): void {
    this.chatTurns.set([]);
  }

  submitQuestion(explicitQuestion?: string): void {
    const q = (explicitQuestion ?? this.draftQuestion()).trim();
    if (!q) return;

    this.draftQuestion.set('');
    this.store.setLoomSearchQuery(q);

    const turnId = `loom-turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const isGm = this.store.viewerRole() === 'gm';
    const scopeLabel = isGm ? 'GM Canon + Secrets' : 'Player-Safe Canon';
    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const localResult = this.synthesizeLocalCanon(q, isGm);

    const pendingTurn: LwLoomChatTurn = {
      id: turnId,
      question: q,
      answer: localResult.answer,
      timestampLabel: nowLabel,
      scopeLabel,
      references: localResult.references,
      loading: true,
    };

    this.chatTurns.update((prev) => [...prev, pendingTurn]);

    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) {
      this.chatTurns.update((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, loading: false } : t)),
      );
      return;
    }

    this.http
      .post<ServerLoomQueryResponse>(`/api/v2/campaigns/${campaignId}/loom/query`, {
        query: q,
        role: this.store.viewerRole(),
        witnessCharacter: 'All Party',
        includePrivateNotes: true,
      })
      .subscribe({
        next: (res) => {
          const serverSynthesis = res?.synthesis?.trim();
          const combinedAnswer =
            serverSynthesis &&
            !serverSynthesis.toLowerCase().includes('no lore synthesis') &&
            !serverSynthesis.toLowerCase().includes('select a campaign')
              ? `${serverSynthesis}\n\n${localResult.answer}`
              : localResult.answer;
          this.chatTurns.update((prev) =>
            prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    answer: combinedAnswer,
                    loading: false,
                  }
                : t,
            ),
          );
        },
        error: () => {
          this.chatTurns.update((prev) =>
            prev.map((t) => (t.id === turnId ? { ...t, loading: false } : t)),
          );
        },
      });
  }

  inspectReference(ref: LwLoomChatReference): void {
    this.store.inspectEntity(ref.compositeKey);
    this.store.toggleLoomDrawer(false);
  }

  openReferenceLink(ref: LwLoomChatReference): void {
    this.store.toggleLoomDrawer(false);
    void this.router.navigateByUrl(ref.routeLink);
  }

  private buildInitialWelcomeTurn(): LwLoomChatTurn {
    const activeSess = this.store.activeSession();
    const campName = this.store.activeCampaign()?.name || 'Shadow of the Mountain';
    const isGm = this.store.viewerRole() === 'gm';
    const refs = this.collectMatchingReferences('', isGm).slice(0, 4);
    const sessLine = activeSess
      ? `Active Planning / Play Session: Session ${activeSess.sessionNumber} — ${activeSess.title} (${activeSess.locationLabel}).`
      : 'All chronicled sessions and world dossiers are indexed.';

    return {
      id: 'loom-welcome',
      question: 'What campaign canon and session memory do you have ready?',
      answer: `I am The Loom, your zero-generation campaign memory for ${campName}. I only recall established canon, session chronicles, quests, NPCs, and role-authorized notes. ${sessLine} Ask me any question below and I will synthesize the answer alongside direct links to the source references.`,
      timestampLabel: 'Ready',
      scopeLabel: isGm ? 'GM Canon + Secrets' : 'Player-Safe Canon',
      references: refs,
    };
  }

  private synthesizeLocalCanon(
    query: string,
    isGm: boolean,
  ): { answer: string; references: readonly LwLoomChatReference[] } {
    const refs = this.collectMatchingReferences(query, isGm);
    const activeSess = this.store.activeSession();
    const lower = query.toLowerCase();

    if (lower.includes('current session') || lower.includes('happening') || lower.includes('upcoming')) {
      if (activeSess) {
        const summaryText =
          activeSess.summary ||
          `Session ${activeSess.sessionNumber} (${activeSess.title}) is set at ${activeSess.locationLabel}.`;
        return {
          answer: `Current Selected Session: Session ${activeSess.sessionNumber} — ${activeSess.title} (${activeSess.statusLabel}, Location: ${activeSess.locationLabel}). ${summaryText}`,
          references: refs,
        };
      }
    }

    if (refs.length === 0) {
      return {
        answer: `No established canon records matched "${query}" within your current ${isGm ? 'GM' : 'Player'} visibility scope. The Loom never invents fiction—try asking about a session, location, NPC, quest, or lore entry.`,
        references: this.collectMatchingReferences('', isGm).slice(0, 3),
      };
    }

    const topSummaries = refs
      .slice(0, 3)
      .map((r) => `${r.title} (${r.entityType}): ${r.excerpt}`)
      .join(' ');

    return {
      answer: `Synthesized from ${refs.length} canon reference${refs.length === 1 ? '' : 's'}: ${topSummaries}`,
      references: refs,
    };
  }

  private collectMatchingReferences(query: string, isGm: boolean): LwLoomChatReference[] {
    const q = query.trim().toLowerCase();
    const tokens = q
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !['what', 'who', 'where', 'when', 'how', 'much', 'did', 'get', 'got', 'after', 'the', 'and', 'are', 'for', 'our', 'summarize'].includes(w));

    const isLootQuery = ['gold', 'gp', 'loot', 'treasure', 'defeating', 'dungeon', 'encounter', 'sword', 'claimed'].some((k) => q.includes(k));
    const scored: { ref: LwLoomChatReference; score: number }[] = [];
    const seen = new Set<string>();

    const scoreText = (text: string, isLootRecord: boolean): number => {
      if (!q || tokens.length === 0) return isLootRecord ? 5 : 1;
      let s = text.includes(q) ? 12 : 0;
      for (const t of tokens) {
        if (text.includes(t)) s += 2;
      }
      const sessMatch = q.match(/session\s+(\d+)/i);
      if (sessMatch && text.includes(`session ${sessMatch[1]}`)) s += 8;
      if (isLootQuery && isLootRecord) s += 10;
      return s;
    };

    // 1. Store Entities / Citations (including EncounterLoot Chronicles)
    for (const cit of this.store.authorizedEntities()) {
      const text = `${cit.name} ${cit.subtitle} ${cit.summary} ${cit.entityType}`.toLowerCase();
      const isLoot = cit.compositeKey.includes('EncounterLoot') || cit.name.toLowerCase().includes('loot & battle ledger');
      const sc = scoreText(text, isLoot);
      if (sc > 0 && !seen.has(cit.compositeKey)) {
        seen.add(cit.compositeKey);
        const route = cit.routeLink || this.resolveRouteForKind(cit.entityType.toLowerCase());
        scored.push({
          score: sc,
          ref: {
            compositeKey: cit.compositeKey,
            title: cit.name,
            entityType: isLoot ? 'LOOT LEDGER' : cit.entityType.toUpperCase(),
            visibility: cit.visibility === 'gm' ? 'gm' : 'players',
            excerpt: cit.summary,
            routeLink: route,
            routeLabel: this.formatRouteLabel(route),
          },
        });
      }
    }

    // 2. Session Attachments (Lore, Quests, NPCs, Encounters, Maps)
    for (const att of this.store.sessionAttachments()) {
      if (!isGm && att.visibility === 'gm') continue;
      const text = `${att.title} ${att.subtitle} ${att.summary} ${att.elementKind}`.toLowerCase();
      const isLoot = text.includes('loot & recap') || text.includes('gp looted');
      const sc = scoreText(text, isLoot);
      const key = att.targetKey || att.id;
      if (sc > 0 && !seen.has(key)) {
        seen.add(key);
        scored.push({
          score: sc,
          ref: {
            compositeKey: key,
            title: att.title,
            entityType: att.elementKind,
            visibility: (att.visibility as 'gm' | 'players') || 'players',
            excerpt: att.summary || att.subtitle || `Attached to ${att.sessionId}`,
            routeLink: att.routeLink || '/sessions',
            routeLabel: this.formatRouteLabel(att.routeLink || '/sessions'),
          },
        });
      }
    }

    // 3. Sessions
    for (const s of this.store.sessions()) {
      const text = `${s.title} ${s.locationLabel} ${s.summary} session ${s.sessionNumber}`.toLowerCase();
      const sc = scoreText(text, false);
      const key = `session:${s.sessionId}`;
      if (sc > 0 && !seen.has(key)) {
        seen.add(key);
        scored.push({
          score: sc,
          ref: {
            compositeKey: key,
            title: `Session ${s.sessionNumber} — ${s.title}`,
            entityType: 'Session',
            visibility: 'players',
            excerpt: s.summary || `${s.locationLabel} · ${s.statusLabel}`,
            routeLink: '/sessions',
            routeLabel: 'Sessions Planner',
          },
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.ref);
  }

  private resolveRouteForKind(kind: string): string {
    switch (kind) {
      case 'npc':
      case 'pc':
        return '/characters';
      case 'location':
        return '/maps';
      case 'quest':
      case 'faction':
        return '/campaigns';
      case 'session':
        return '/sessions';
      case 'item':
        return '/items';
      default:
        return '/world-lore';
    }
  }

  private formatRouteLabel(route: string): string {
    switch (route) {
      case '/sessions':
        return 'Sessions';
      case '/world-lore':
        return 'World & Lore';
      case '/campaigns':
        return 'Quests & Story';
      case '/characters':
        return 'Characters';
      case '/maps':
        return 'Maps & Scenes';
      case '/items':
        return 'Items';
      case '/encounters':
        return 'Encounters';
      default:
        return route.replace(/^\//, '') || 'Studio';
    }
  }
}
