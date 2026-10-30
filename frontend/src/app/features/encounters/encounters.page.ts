import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { NgpTabButton, NgpTabList, NgpTabset } from 'ng-primitives/tabs';
import { AdventureGuideService } from '../../core/services/adventure-guide.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwBadgeComponent,
  LwButtonComponent,
  LwEncounterBuilderComponent,
  LwIconComponent,
  LwPageHeaderComponent,
  LwScrollAreaComponent,
} from '../../shared/ui/public-api';
import { VttCombatService } from '../arcane-screen/services/vtt-combat.service';
import {
  CampaignSessionVm,
  EncounterCategoryType,
  EncounterDetailTabId,
  EncounterDetailVm,
  EncounterFilterTabId,
} from './models/encounter-studio.models';

@Component({
  selector: 'lw-encounters-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgpButton,
    NgpTabset,
    NgpTabList,
    NgpTabButton,
    LwBadgeComponent,
    LwButtonComponent,
    LwEncounterBuilderComponent,
    LwIconComponent,
    LwPageHeaderComponent,
    LwScrollAreaComponent,
  ],
  templateUrl: './encounters.page.html',
  styleUrl: './encounters.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncountersPageComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly vtt = inject(VttCombatService);
  readonly advGuide = inject(AdventureGuideService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly pageMode = signal<'view' | 'create' | 'edit'>('view');
  /**
   * Left sub-menu of encounters is collapsible and auto-collapses when an encounter is selected.
   */
  readonly leftSubmenuCollapsed = signal<boolean>(false);
  readonly activeFilterTab = signal<EncounterFilterTabId>('all');
  readonly activeSessionFilter = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly selectedEncounterId = signal<string>('enc-ruined-chapel');
  readonly activeDetailTab = signal<EncounterDetailTabId>('overview');

  readonly filterTabs: readonly { id: EncounterFilterTabId; label: string }[] = [
    { id: 'all', label: 'All Encounters' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'past', label: 'Past Encounters' },
    { id: 'by-location', label: 'By Location' },
    { id: 'by-creature', label: 'By Creature' },
    { id: 'custom', label: 'Custom' },
  ];

  readonly detailTabs: readonly { id: EncounterDetailTabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'creatures', label: 'Creatures' },
    { id: 'party-npcs', label: 'Players & NPCs' },
    { id: 'traps', label: 'Traps & Hazards' },
    { id: 'map', label: 'Map' },
    { id: 'read-aloud', label: 'Read Aloud' },
    { id: 'rewards', label: 'Rewards' },
    { id: 'links', label: 'Links' },
    { id: 'notes', label: 'Notes' },
  ];

  readonly filteredEncounters = computed<readonly EncounterDetailVm[]>(() => {
    const cid = this.store.activeCampaignId();
    const tab = this.activeFilterTab();
    const sesFilter = this.activeSessionFilter();
    const q = this.searchQuery().trim().toLowerCase();

    return this.vtt
      .encounterDetails()
      .filter((e) => e.campaignId === cid)
      .filter((e) => sesFilter === 'all' || e.sessionId === sesFilter)
      .filter((e) => {
        if (tab === 'upcoming') return !e.completed;
        if (tab === 'past') return !!e.completed;
        if (tab === 'custom') return !!e.isCustom;
        if (tab === 'by-creature') return e.monsters.length > 0;
        return true;
      })
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.actLabel.toLowerCase().includes(q) ||
          e.encounterType.toLowerCase().includes(q) ||
          e.sessionTitle.toLowerCase().includes(q) ||
          e.sceneName.toLowerCase().includes(q),
      );
  });

  readonly selectedEncounter = computed<EncounterDetailVm>(() => {
    const id = this.selectedEncounterId();
    const pool = this.vtt.encounterDetails();
    return pool.find((e) => e.id === id) ?? this.filteredEncounters()[0] ?? pool[0];
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const focus = params.get('focus') || params.get('encounter');
      const mode = params.get('mode');
      const editId = params.get('edit');
      if (focus) {
        const found = this.vtt
          .encounterDetails()
          .find((e) => e.id === focus || e.compositeKey.endsWith(focus));
        if (found) {
          this.selectedEncounterId.set(found.id);
        }
      }
      if (editId) {
        this.selectedEncounterId.set(editId);
        this.pageMode.set('edit');
      } else if (mode === 'create' || mode === 'builder') {
        this.pageMode.set('create');
      }
    });
  }

  /**
   * Selecting an encounter from the left sub-menu selects it and auto-collapses the left sub-menu.
   */
  selectEncounterFromMenu(enc: EncounterDetailVm): void {
    this.selectedEncounterId.set(enc.id);
    this.vtt.activeEncounterId.set(enc.id);
    this.pageMode.set('view');
    this.leftSubmenuCollapsed.set(true);
  }

  toggleLeftSubmenu(): void {
    this.leftSubmenuCollapsed.update((c) => !c);
  }

  openCreateEncounterPage(): void {
    this.pageMode.set('create');
  }

  openEditEncounterPage(enc?: EncounterDetailVm): void {
    if (enc) {
      this.selectedEncounterId.set(enc.id);
    }
    this.pageMode.set('edit');
  }

  onEncounterSaved(detail: EncounterDetailVm): void {
    this.vtt.saveEncounterDetail(detail);
    this.selectedEncounterId.set(detail.id);
    this.pageMode.set('view');
  }

  onEncounterSavedAndLaunched(detail: EncounterDetailVm): void {
    this.vtt.saveEncounterDetail(detail);
    this.selectedEncounterId.set(detail.id);
    this.runEncounterInVtt(detail);
  }

  onSessionCreated(session: CampaignSessionVm): void {
    this.vtt.sessions.update((list) => [...list, session]);
  }

  runEncounterInVtt(enc: EncounterDetailVm): void {
    this.vtt.launchEncounterIntoVtt(enc.id);
    void this.router.navigateByUrl('/arcane-screen');
  }

  encounterTypeIcon(type: EncounterCategoryType): string {
    switch (type) {
      case 'Social':
        return 'users';
      case 'Exploration':
        return 'search';
      case 'Boss':
        return 'shield';
      case 'Mixed':
        return 'compass';
      default:
        return 'swords';
    }
  }
}
