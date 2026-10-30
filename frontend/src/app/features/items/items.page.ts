import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwBadgeComponent,
  LwButtonComponent,
  LwCatalogItemVm,
  LwCreateCustomItemDraftVm,
  LwCreateItemCollectionDraftVm,
  LwItemCardComponent,
  LwItemCategory,
  LwItemCollectionModalComponent,
  LwItemCollectionVm,
  LwItemCustomModalComponent,
  LwItemDetailModalComponent,
  LwItemRarity,
  LwItemSortOption,
  LwPagerComponent,
  LwPanelComponent,
} from '../../shared/ui/public-api';
import { ItemsCatalogService } from './services/items-catalog.service';

@Component({
  selector: 'lw-items-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NgpButton,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwItemCardComponent,
    LwItemDetailModalComponent,
    LwItemCustomModalComponent,
    LwItemCollectionModalComponent,
    LwPagerComponent,
  ],
  templateUrl: './items.page.html',
  styleUrl: './items.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemsPageComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly catalog = inject(ItemsCatalogService);

  readonly showFilters = signal(false);
  readonly activeFilterCount = computed(() => Number(this.catalog.selectedRarity() !== 'All') + Number(this.catalog.selectedSource() !== 'All') + Number(this.catalog.selectedCollectionId() !== 'All'));
  readonly saveError = signal('');
  readonly customItemModalOpen = signal<boolean>(false);
  readonly collectionModalOpen = signal<boolean>(false);
  readonly editingCollection = signal<LwItemCollectionVm | null>(null);

  readonly isEffectiveGm = computed<boolean>(
    () => this.catalog.serverIsGm() && this.store.viewerRole() === 'gm',
  );

  readonly categoryOptions: readonly ('All' | LwItemCategory)[] = [
    'All',
    'Weapon',
    'Armor',
    'Shield',
    'Focus',
    'Wondrous Gear',
    'Potion & Consumable',
    'Tool & Kit',
    'Companion Gear',
  ];

  readonly rarityOptions: readonly ('All' | LwItemRarity)[] = [
    'All',
    'Common',
    'Uncommon',
    'Rare',
    'Very Rare',
    'Legendary',
    'Artifact',
  ];

  readonly sortOptions: readonly { readonly value: LwItemSortOption; readonly label: string }[] = [
    { value: 'name-asc', label: 'Name (A–Z)' },
    { value: 'name-desc', label: 'Name (Z–A)' },
    { value: 'price-asc', label: 'Price (Low to High)' },
    { value: 'price-desc', label: 'Price (High to Low)' },
    { value: 'rarity-asc', label: 'Rarity (Common to Legendary)' },
    { value: 'rarity-desc', label: 'Rarity (Legendary to Common)' },
    { value: 'weight-asc', label: 'Weight (Light to Heavy)' },
  ];

  openCreateCustomItemModal(): void {
    this.saveError.set('');
    this.customItemModalOpen.set(true);
  }

  openCreateCollectionModal(): void {
    this.editingCollection.set(null);
    this.saveError.set('');
    this.collectionModalOpen.set(true);
  }

  openEditCollectionModal(collection: LwItemCollectionVm): void {
    this.editingCollection.set(collection);
    this.saveError.set('');
    this.collectionModalOpen.set(true);
  }

  async handleCustomItemCreated(draft: LwCreateCustomItemDraftVm): Promise<void> {
    const created = await this.catalog.createCustomItem(draft);
    if (created) { this.customItemModalOpen.set(false); this.catalog.openItemDetail(created); }
    else this.saveError.set(this.catalog.statusBanner());
  }

  async handleCollectionSaved(draft: LwCreateItemCollectionDraftVm): Promise<void> {
    const saved = await this.catalog.saveGmCollection(draft);
    if (saved) { this.collectionModalOpen.set(false); this.catalog.selectedCollectionId.set(saved.id); }
    else this.saveError.set(this.catalog.statusBanner());
  }

  handleCardToggleCollection(item: LwCatalogItemVm): void {
    const activeCol = this.catalog.activeCollection();
    const targetCol = activeCol ?? this.catalog.collectionsForActiveCampaign()[0];
    if (!targetCol) {
      this.openCreateCollectionModal();
      return;
    }
    this.catalog.toggleItemInCollection(targetCol.id, item.id);
  }

  isItemInActiveCollection(itemId: string): boolean {
    const col =
      this.catalog.activeCollection() ?? this.catalog.collectionsForActiveCampaign()[0];
    return col ? col.itemIds.includes(itemId) : false;
  }

  activeOrDefaultCollectionName(): string {
    const col =
      this.catalog.activeCollection() ?? this.catalog.collectionsForActiveCampaign()[0];
    return col?.name ?? '';
  }

  resetAllFilters(): void {
    this.catalog.searchQuery.set('');
    this.catalog.selectedCategory.set('All');
    this.catalog.selectedRarity.set('All');
    this.catalog.selectedSource.set('All');
    this.catalog.selectedCollectionId.set('All');
    this.catalog.sortBy.set('name-asc');
  }
}
