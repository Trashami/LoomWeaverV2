import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { AuthSessionService } from '../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LW_CREATURE_TYPES,
  LwBadgeComponent,
  LwButtonComponent,
  LwMonsterAssignmentDraft,
  LwMonsterCardComponent,
  LwMonsterCollectionModalComponent,
  LwMonsterCollectionVm,
  LwMonsterCustomModalComponent,
  LwMonsterDetailModalComponent,
  LwMonsterPlacementRequest,
  LwMonsterSightingDraft,
  LwMonsterSortOption,
  LwMonsterSourceFilter,
  LwPanelComponent,
  LwSaveMonsterCollectionDraft,
} from '../../shared/ui/public-api';
import { BestiaryCampaignService } from './services/bestiary-campaign.service';
import { BestiaryCatalogService, CR_BANDS } from './services/bestiary-catalog.service';
import { MonsterTokenLibraryService } from './services/monster-token-library.service';

@Component({
  selector: 'lw-bestiary-page',
  standalone: true,
  imports: [
    FormsModule,
    NgpButton,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwMonsterCardComponent,
    LwMonsterDetailModalComponent,
    LwMonsterCustomModalComponent,
    LwMonsterCollectionModalComponent,
  ],
  templateUrl: './bestiary.page.html',
  styleUrl: './bestiary.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BestiaryPageComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly auth = inject(AuthSessionService);
  readonly catalog = inject(BestiaryCatalogService);
  readonly campaign = inject(BestiaryCampaignService);
  private readonly tokens = inject(MonsterTokenLibraryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly types = LW_CREATURE_TYPES;
  readonly crBands = CR_BANDS;
  readonly sourceTabs: readonly { id: LwMonsterSourceFilter; label: string }[] = [
    { id: 'all', label: 'All monsters' },
    { id: 'official', label: 'Official compendium' },
    { id: 'community', label: 'Community market (free)' },
    { id: 'mine', label: 'My creations' },
  ];
  readonly sortOptions: readonly { value: LwMonsterSortOption; label: string }[] = [
    { value: 'name', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'cr', label: 'Challenge (low to high)' },
    { value: 'cr-desc', label: 'Challenge (high to low)' },
  ];

  readonly detailOpen = signal<boolean>(false);
  readonly collectionModalOpen = signal<boolean>(false);
  readonly editingCollection = signal<LwMonsterCollectionVm | null>(null);

  readonly openSummary = computed(() => this.catalog.detail()?.summary ?? null);
  readonly openPlacements = computed(() => {
    const key = this.catalog.openKey();
    return key ? this.campaign.placements().filter((p) => p.monsterKey === key) : [];
  });
  readonly openAssignment = computed(() => {
    const key = this.catalog.openKey();
    return key ? (this.campaign.assignments().find((a) => a.monsterKey === key) ?? null) : null;
  });
  readonly tokenOptions = computed(() => {
    const s = this.openSummary();
    return s && this.campaign.isEffectiveGm() ? this.tokens.tokenOptionsFor(s, this.catalog.monsters()) : [];
  });
  readonly modelOptions = computed(() => {
    const s = this.openSummary();
    return s && this.campaign.isEffectiveGm() ? this.tokens.modelOptionsFor(s) : [];
  });
  readonly collectionKeySet = computed(() => new Set(this.campaign.collections().flatMap((c) => c.monsterKeys)));
  readonly hasActiveFilters = computed(
    () =>
      !!this.catalog.searchQuery() ||
      this.catalog.typeFilter() !== 'all' ||
      this.catalog.crBandId() !== 'all' ||
      this.catalog.sourceFilter() !== 'all',
  );

  constructor() {
    this.catalog.ensureLoaded();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const key = params.get('monster');
      if (key) this.openMonster(key);
    });
    effect(() => {
      // Campaign switch or role change: drop any collection filter that belonged to the previous context
      // and re-read the open monster's Loom history under the new campaign/role.
      this.store.activeCampaignId();
      this.campaign.isEffectiveGm();
      untracked(() => {
        if (this.catalog.collectionKeys()) this.catalog.showCollection(null);
        const key = this.catalog.openKey();
        if (this.detailOpen() && key) this.campaign.loadSightings(key);
      });
    });
  }

  openMonster(key: string): void {
    this.catalog.openMonster(key);
    this.campaign.loadSightings(key);
    if (this.campaign.isEffectiveGm()) this.tokens.ensureLoaded();
    this.detailOpen.set(true);
  }

  closeMonster(): void {
    this.detailOpen.set(false);
    this.catalog.closeMonster();
    if (this.route.snapshot.queryParamMap.has('monster')) {
      void this.router.navigate([], { queryParams: { monster: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  assignedImage(key: string): string | null {
    return this.campaign.assignments().find((a) => a.monsterKey === key)?.primaryTokenUrl ?? null;
  }

  selectSource(id: LwMonsterSourceFilter): void {
    this.leaveCollection();
    this.catalog.setFilter(() => this.catalog.sourceFilter.set(id));
  }

  setType(value: string): void {
    this.applyFilter(() => this.catalog.typeFilter.set(value));
  }

  setCrBand(value: string): void {
    this.applyFilter(() => this.catalog.crBandId.set(value));
  }

  setSort(value: LwMonsterSortOption): void {
    this.applyFilter(() => this.catalog.sortBy.set(value));
  }

  applyFilter(apply: () => void): void {
    this.leaveCollection();
    this.catalog.setFilter(apply);
  }

  onSearch(value: string): void {
    this.leaveCollection();
    this.catalog.setSearch(value);
  }

  resetFilters(): void {
    this.leaveCollection();
    this.catalog.resetFilters();
  }

  toggleCollectionFilter(collection: LwMonsterCollectionVm): void {
    if (this.campaign.activeCollectionId() === collection.id) {
      this.leaveCollection();
      this.catalog.reload();
      return;
    }
    this.campaign.activeCollectionId.set(collection.id);
    this.catalog.showCollection(collection.monsterKeys);
  }

  campaignNames(ids: readonly number[]): string {
    const names = this.store.campaigns().filter((c) => ids.includes(c.id)).map((c) => c.name);
    return names.length ? names.join(', ') : 'Not assigned to a campaign';
  }

  openCreateCollection(): void {
    this.editingCollection.set(null);
    this.campaign.collectionError.set('');
    this.collectionModalOpen.set(true);
  }

  openEditCollection(collection: LwMonsterCollectionVm): void {
    this.editingCollection.set(collection);
    this.campaign.collectionError.set('');
    this.collectionModalOpen.set(true);
  }

  saveCollection(draft: LwSaveMonsterCollectionDraft): void {
    this.campaign.saveCollection(draft, (saved) => {
      this.collectionModalOpen.set(false);
      if (this.campaign.activeCollectionId() === saved.id) this.catalog.showCollection(saved.monsterKeys);
    });
  }

  deleteCollection(id: string): void {
    this.campaign.deleteCollection(id, () => {
      this.collectionModalOpen.set(false);
      if (this.catalog.collectionKeys()) {
        this.catalog.showCollection(null);
      }
    });
  }

  onPlacement(req: LwMonsterPlacementRequest): void {
    const d = this.catalog.detail();
    if (d) this.campaign.addPlacement(d, req);
  }

  onAssignment(draft: LwMonsterAssignmentDraft): void {
    const key = this.catalog.openKey();
    if (key) this.campaign.saveAssignment(key, draft);
  }

  onSighting(draft: LwMonsterSightingDraft): void {
    const d = this.catalog.detail();
    if (d) this.campaign.recordSighting(d, draft);
  }

  onCollectionToggled(collectionId: string): void {
    const key = this.catalog.openKey();
    if (key) this.campaign.toggleInCollection(collectionId, key);
  }

  private leaveCollection(): void {
    if (this.campaign.activeCollectionId() !== 'all' || this.catalog.collectionKeys()) {
      this.campaign.activeCollectionId.set('all');
      this.catalog.collectionKeys.set(null);
    }
  }
}
