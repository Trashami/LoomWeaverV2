import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CampaignSessionVm, SessionAttachmentVm } from '../../core/models/loomweaver.models';
import { AdventureGuideService } from '../../core/services/adventure-guide.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { WorldLoreFacadeService } from '../../core/services/world-lore-facade.service';
import {
  LwBadgeComponent,
  LwButtonComponent,
  LwIconComponent,
  LwModalComponent,
  LwPageHeaderComponent,
  LwPanelComponent,
} from '../../shared/ui/public-api';

type AttachmentCategoryTab =
  | 'All'
  | 'Map'
  | 'Lore'
  | 'Quest'
  | 'SideQuest'
  | 'Encounter'
  | 'NPC'
  | 'Item';

@Component({
  selector: 'lw-sessions-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LwPageHeaderComponent,
    LwPanelComponent,
    LwButtonComponent,
    LwBadgeComponent,
    LwIconComponent,
    LwModalComponent,
  ],
  templateUrl: './sessions.page.html',
  styleUrl: './sessions.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionsPageComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly adventureGuide = inject(AdventureGuideService);
  readonly worldLore = inject(WorldLoreFacadeService);
  private readonly router = inject(Router);

  readonly isGm = computed(() => this.store.viewerRole() === 'gm');
  readonly activeTab = signal<AttachmentCategoryTab>('All');
  readonly categoryTabs: readonly { id: AttachmentCategoryTab; label: string; icon: string }[] = [
    { id: 'All', label: 'All Attached', icon: 'layers' },
    { id: 'Map', label: 'Maps & Scenes', icon: 'map' },
    { id: 'Lore', label: 'World & Lore', icon: 'book-open' },
    { id: 'Quest', label: 'Main Quests', icon: 'scroll-text' },
    { id: 'SideQuest', label: 'Side Quests', icon: 'compass' },
    { id: 'Encounter', label: 'Encounters', icon: 'swords' },
    { id: 'NPC', label: 'NPCs & Bestiary', icon: 'users' },
    { id: 'Item', label: 'Items & Handouts', icon: 'backpack' },
  ];

  readonly createSessionModalOpen = signal<boolean>(false);
  readonly newSessionTitle = signal<string>('');
  readonly newSessionSummary = signal<string>('');
  readonly newSessionLocation = signal<string>('Cinth — Vampire Gala');

  readonly attachKind = signal<SessionAttachmentVm['elementKind']>('Map');
  readonly attachExistingKey = signal<string>('');
  readonly attachCustomTitle = signal<string>('');
  readonly attachCustomSubtitle = signal<string>('');
  readonly attachVisibility = signal<'players' | 'gm'>('players');

  readonly filteredAttachments = computed(() => {
    const tab = this.activeTab();
    const list = this.store
      .activeSessionAttachments()
      .filter((a) => this.isGm() || a.visibility !== 'gm');
    if (tab === 'All') return list;
    return list.filter((a) => a.elementKind === tab);
  });

  readonly availableExistingOptions = computed(() => {
    const kind = this.attachKind();
    const items: Array<{ key: string; title: string; subtitle: string; routeLink: string }> = [];
    if (kind === 'Map') {
      items.push(
        {
          key: 'scene-vampire-gala-ballroom',
          title: 'Vampire Gala — Crimson Ballroom',
          subtitle: '3D Tactical Scene · Cinth',
          routeLink: '/arcane-screen?scene=scene-vampire-gala-ballroom',
        },
        {
          key: 'scene-c1-shattered-nave',
          title: 'Ruined Chapel — Shattered Nave (C1–C3)',
          subtitle: '3D Tactical Scene · Moonlit Crypt',
          routeLink: '/arcane-screen?scene=scene-c1-shattered-nave',
        },
      );
      for (const sc of this.store.authorizedScenes()) {
        if (!items.some((i) => i.key === sc.sceneKey)) {
          items.push({
            key: sc.sceneKey,
            title: sc.name,
            subtitle: `Battlemap · ${sc.biome || 'Campaign Scene'}`,
            routeLink: `/arcane-screen?scene=${sc.sceneKey}`,
          });
        }
      }
      if (typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem('lw.mapStudio.savedScenes.v1');
          if (raw) {
            const parsed = JSON.parse(raw) as Record<string, { sceneKey?: string; name?: string }>;
            for (const entry of Object.values(parsed)) {
              if (entry?.sceneKey && entry?.name && !items.some((i) => i.key === entry.sceneKey)) {
                items.push({
                  key: entry.sceneKey,
                  title: entry.name,
                  subtitle: 'Custom Studio Battlemap',
                  routeLink: `/arcane-screen?scene=${entry.sceneKey}`,
                });
              }
            }
          }
        } catch {
          // ignore storage parse errors
        }
      }
      for (const m of this.worldLore.workspace().maps) {
        const key = m.linkedSceneKey || m.mapId;
        if (!items.some((i) => i.key === key)) {
          items.push({
            key,
            title: m.name,
            subtitle: `${m.scopeLevel} Map`,
            routeLink: `/world-lore`,
          });
        }
      }
    } else if (kind === 'Lore') {
      for (const l of this.worldLore.workspace().loreEntries) {
        items.push({
          key: l.id,
          title: l.title,
          subtitle: `${l.category} · ${l.subtitle}`,
          routeLink: '/world-lore',
        });
      }
    } else {
      for (const e of this.store.authorizedEntities()) {
        if (
          (kind === 'Quest' || kind === 'SideQuest') &&
          e.entityType === 'Quest'
        ) {
          items.push({ key: e.compositeKey, title: e.name, subtitle: e.subtitle, routeLink: '/campaigns' });
        } else if (kind === 'NPC' && (e.entityType === 'NPC' || e.entityType === 'Character')) {
          items.push({ key: e.compositeKey, title: e.name, subtitle: e.subtitle, routeLink: '/characters' });
        } else if (kind === 'Encounter' && e.entityType === 'Encounter') {
          items.push({ key: e.compositeKey, title: e.name, subtitle: e.subtitle, routeLink: '/encounters' });
        } else if (kind === 'Item' && e.entityType === 'Item') {
          items.push({ key: e.compositeKey, title: e.name, subtitle: e.subtitle, routeLink: '/items' });
        }
      }
    }
    return items;
  });

  selectSession(session: CampaignSessionVm): void {
    this.store.setActiveSession(session.sessionId);
    this.adventureGuide.selectScope('session', session.sessionId);
  }

  onExistingOptionChange(key: string): void {
    this.attachExistingKey.set(key);
    const match = this.availableExistingOptions().find((o) => o.key === key);
    if (match) {
      this.attachCustomTitle.set(match.title);
      this.attachCustomSubtitle.set(match.subtitle);
    }
  }

  attachSelectedElement(): void {
    const title = this.attachCustomTitle().trim();
    if (!title) return;
    const kind = this.attachKind();
    const sess = this.store.activeSession();
    if (!sess) return;

    const existing = this.availableExistingOptions().find((o) => o.key === this.attachExistingKey());
    const elementId = existing?.key || `${kind.toLowerCase()}-${Date.now().toString().slice(-5)}`;
    const subtitle =
      this.attachCustomSubtitle().trim() ||
      existing?.subtitle ||
      `Attached to Session ${sess.sessionNumber} · ${sess.title}`;
    const routeLink =
      existing?.routeLink ||
      (kind === 'Map'
        ? `/arcane-screen?scene=${elementId}`
        : kind === 'Lore'
          ? '/world-lore'
          : kind === 'Encounter'
            ? '/encounters'
            : kind === 'NPC'
              ? '/characters'
              : kind === 'Item'
                ? '/items'
                : '/campaigns');

    this.store.attachElementToSession({
      sessionId: sess.sessionId,
      elementKind: kind,
      elementId,
      title,
      subtitle,
      routeLink,
      visibility: this.attachVisibility(),
    });

    if (kind === 'Map') {
      this.adventureGuide.assignBattlemapToSessionAndPlace({
        sceneKey: elementId,
        sceneTitle: title,
        sessionId: sess.sessionId,
        locationNodeId: 'node-room-c1-nave',
        artworkUrl: '/battlemap-showcase.jpg',
      });
    } else if (kind === 'Lore') {
      const loreEntry = this.worldLore.workspace().loreEntries.find((l) => l.id === elementId);
      if (loreEntry) {
        this.worldLore.saveLoreEntry({
          id: loreEntry.id,
          title: loreEntry.title,
          category: loreEntry.category,
          subtitle: loreEntry.subtitle,
          excerpt: loreEntry.excerpt,
          content: loreEntry.content,
          tags: loreEntry.tags,
          linkedEntityKeys: loreEntry.linkedEntityKeys,
          visibility: loreEntry.visibility,
          sessionId: sess.sessionId,
          sessionLabel: `Session ${sess.sessionNumber} · ${sess.title}`,
          questId: loreEntry.questId ?? null,
          questTitle: loreEntry.questTitle ?? null,
          questKind: loreEntry.questKind ?? null,
        });
      }
    }

    this.attachCustomTitle.set('');
    this.attachCustomSubtitle.set('');
    this.attachExistingKey.set('');
  }

  createNewSession(): void {
    const title = this.newSessionTitle().trim();
    if (!title) return;
    this.store.createSession({
      title,
      summary: this.newSessionSummary().trim(),
      locationLabel: this.newSessionLocation().trim() || 'Campaign Frontier',
    });
    this.newSessionTitle.set('');
    this.newSessionSummary.set('');
    this.createSessionModalOpen.set(false);
  }

  openAdventureGuide(scope: 'session' | 'adventure'): void {
    this.store.openAdventureGuideModal(scope);
  }

  launchArcaneScreenForSession(): void {
    const mapAtt = this.store
      .activeSessionAttachments()
      .find((a) => a.elementKind === 'Map');
    const sceneKey =
      mapAtt?.elementId || this.adventureGuide.guide().assignedBattlemap?.sceneKey || '';
    if (sceneKey) {
      void this.router.navigate(['/arcane-screen'], { queryParams: { scene: sceneKey } });
    } else {
      void this.router.navigate(['/arcane-screen']);
    }
  }
}
