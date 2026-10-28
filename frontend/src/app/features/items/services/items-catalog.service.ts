import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwCatalogItemVm, LwCreateCustomItemDraftVm, LwCreateItemCollectionDraftVm, LwItemCategory, LwItemCollectionVm, LwItemRarity, LwItemSortOption } from '../../../shared/ui/item-card/item-card.models';
import { CharacterSheetVm, EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
const RARITY_ORDER: Record<LwItemRarity, number> = { Common: 1, Uncommon: 2, Rare: 3, 'Very Rare': 4, Legendary: 5, Artifact: 6 };
@Injectable({ providedIn: 'root' })
export class ItemsCatalogService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly characterStudio = inject(CharacterStudioService);
  readonly allItems = signal<readonly LwCatalogItemVm[]>([]);
  readonly allCollections = signal<readonly LwItemCollectionVm[]>([]);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<'All' | LwItemCategory>('All');
  readonly selectedRarity = signal<'All' | LwItemRarity>('All');
  readonly selectedSource = signal<'All' | 'Official' | 'Homebrew' | 'StoreFree'>('All');
  readonly selectedCollectionId = signal('All');
  readonly sortBy = signal<LwItemSortOption>('name-asc');
  readonly inspectedItemId = signal<string | null>(null);
  readonly selectedTargetCharacterKey = signal('');
  readonly statusBanner = signal('Loading items…');
  readonly characterNotice = signal('');
  readonly busy = signal(false);
  readonly serverIsGm = signal(false);
  readonly collectionsForActiveCampaign = computed(() => this.allCollections().filter(c => c.campaignId === this.store.activeCampaignId()));
  readonly activeCollection = computed(() => this.collectionsForActiveCampaign().find(c => c.id === this.selectedCollectionId()) ?? null);
  readonly availableCampaignCharacters = computed(() => this.characterStudio.sheets().filter(s => s.campaignId === this.store.activeCampaignId() && s.characterKey === this.selectedTargetCharacterKey()));
  readonly targetCampaignCharacter = computed<CharacterSheetVm | null>(() => this.availableCampaignCharacters()[0] ?? null);
  readonly campaignLocations = computed(() => this.store.authorizedEntities().filter(e => e.campaignId === this.store.activeCampaignId() && e.entityType === 'Location').map(e => ({ key: e.entityKey, name: e.name })));
  readonly filteredAndSortedItems = computed<readonly LwCatalogItemVm[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();
    const rar = this.selectedRarity();
    const src = this.selectedSource();
    const activeCol = this.activeCollection();
    const sort = this.sortBy();

    const filtered = this.allItems().filter((item) => {
      if (cat !== 'All' && item.category !== cat) return false;
      if (rar !== 'All' && item.rarity !== rar) return false;
      if (src === 'Official' && item.isHomebrew) return false;
      if (src === 'Homebrew' && !item.isHomebrew) return false;
      if (src === 'StoreFree' && !(item.isHomebrew && item.publishedToStore)) return false;
      if (activeCol && !activeCol.itemIds.includes(item.id)) return false;

      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.shortDescription.toLowerCase().includes(q) ||
        item.fullDescription.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.rarity.toLowerCase().includes(q) ||
        item.damageOrEffectLabel.toLowerCase().includes(q) ||
        item.creatorUsername.toLowerCase().includes(q) ||
        item.properties.some((p) => p.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'price-asc':
          return a.priceGp - b.priceGp || a.name.localeCompare(b.name);
        case 'price-desc':
          return b.priceGp - a.priceGp || a.name.localeCompare(b.name);
        case 'rarity-asc':
          return (
            (RARITY_ORDER[a.rarity] ?? 1) - (RARITY_ORDER[b.rarity] ?? 1) ||
            a.name.localeCompare(b.name)
          );
        case 'rarity-desc':
          return (
            (RARITY_ORDER[b.rarity] ?? 1) - (RARITY_ORDER[a.rarity] ?? 1) ||
            a.name.localeCompare(b.name)
          );
        case 'weight-asc':
          return a.weightLb - b.weightLb || a.name.localeCompare(b.name);
        case 'name-asc':
        default:
          return a.name.localeCompare(b.name);
      }
    });
  });

  readonly inspectedItem = computed<LwCatalogItemVm | null>(() => {
    const id = this.inspectedItemId();
    if (!id) return null;
    return this.allItems().find((it) => it.id === id) ?? null;
  });


  constructor() {
    effect(onCleanup => {
      const campaign = this.store.activeCampaignId();
      const account = this.auth.activeProfile().accountId;
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      this.allItems.set([]); this.allCollections.set([]); this.selectedTargetCharacterKey.set('');
      this.characterNotice.set('');
      this.statusBanner.set('Loading items…');
      this.serverIsGm.set(false); this.inspectedItemId.set(null); this.selectedCollectionId.set('All');
      this.http.get<readonly LwCatalogItemVm[]>('/api/v2/items').subscribe({
        next: items => { if (!cancelled) { this.allItems.set(items); this.statusBanner.set(''); } },
        error: e => { if (!cancelled) this.fail(e); },
      });
      this.http.get<{ characterKey: string; isGm: boolean }>(`/api/v2/campaigns/${campaign}/items-context`).subscribe({
        next: context => {
          if (cancelled) return;
          this.selectedTargetCharacterKey.set(context.characterKey); this.serverIsGm.set(context.isGm);
          if (context.isGm) this.http.get<readonly LwItemCollectionVm[]>(`/api/v2/campaigns/${campaign}/item-collections`).subscribe({
            next: rows => { if (!cancelled) this.allCollections.set(rows); }, error: e => { if (!cancelled) this.fail(e); },
          });
        }, error: e => {
          if (!cancelled) this.characterNotice.set(e.status === 403
            ? 'No character assigned in this campaign.'
            : 'Character access is temporarily unavailable.');
        },
      });
    });
  }
  openItemDetail(item: LwCatalogItemVm): void { this.inspectedItemId.set(item.id); }
  closeItemDetail(): void { this.inspectedItemId.set(null); }
  setTargetCharacterKey(key: string): void { /* The server owns the campaign character binding. */ }
  canPublish(item: LwCatalogItemVm): boolean { return item.isHomebrew && !item.publishedToStore && item.creatorAccountId === this.auth.activeProfile().accountId; }
  private fail(error: { error?: { error?: string } }): void { this.statusBanner.set(error?.error?.error ?? 'Unable to save or load items. Check your connection and campaign access, then try again.'); }
  private sameContext(account: string, campaign: number): boolean { return account === this.auth.activeProfile().accountId && campaign === this.store.activeCampaignId(); }
  async addItemToCampaignCharacter(item: LwCatalogItemVm, equipNow: boolean): Promise<void> {
    const target = this.targetCampaignCharacter();
    if (!target) { this.statusBanner.set('Assign your character to this campaign before adding items.'); return; }
    if (this.busy()) return;
    const campaign = this.store.activeCampaignId(), account = this.auth.activeProfile().accountId;
    this.busy.set(true);
    try {
      const equipment = await firstValueFrom(this.http.post<EquipmentLoadoutItemVm>(`/api/v2/campaigns/${campaign}/characters/${encodeURIComponent(target.characterKey)}/items`, { itemId: item.id, equipNow }));
      if (!this.sameContext(account, campaign)) return;
      this.characterStudio.mergeCatalogInventory(campaign, target.characterKey, [equipment]);
      this.statusBanner.set(`${item.name} ${equipNow ? 'equipped on' : 'added to'} ${target.name}.`);
    } catch (e) { this.fail(e as never); } finally { this.busy.set(false); }
  }
  async createCustomItem(draft: LwCreateCustomItemDraftVm): Promise<LwCatalogItemVm | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    const account = this.auth.activeProfile().accountId, campaign = this.store.activeCampaignId();
    try {
      const created = await firstValueFrom(this.http.post<LwCatalogItemVm>('/api/v2/items/custom', { ...draft, properties: draft.propertiesText.split(',').map(x => x.trim()).filter(Boolean), publishedToStore: draft.publishToStore, icon: 'inventory_2' }));
      if (!this.sameContext(account, campaign)) return null;
      this.allItems.update(items => [created, ...items]); this.statusBanner.set(`Saved homebrew item ${created.name}.`); return created;
    } catch (e) { this.fail(e as never); return null; } finally { this.busy.set(false); }
  }
  async publishHomebrewToStore(item: LwCatalogItemVm): Promise<void> {
    if (!this.canPublish(item) || this.busy()) return;
    this.busy.set(true);
    const account = this.auth.activeProfile().accountId, campaign = this.store.activeCampaignId();
    try {
      const saved = await firstValueFrom(this.http.post<LwCatalogItemVm>(`/api/v2/items/${encodeURIComponent(item.id)}/publish-store`, {}));
      if (!this.sameContext(account, campaign)) return;
      this.allItems.update(items => items.map(i => i.id === saved.id ? saved : i)); this.statusBanner.set(`Published ${saved.name} for free, credited to ${saved.creatorUsername}.`);
    } catch (e) { this.fail(e as never); } finally { this.busy.set(false); }
  }
  async saveGmCollection(draft: LwCreateItemCollectionDraftVm): Promise<LwItemCollectionVm | null> {
    if (!this.serverIsGm() || this.busy()) return null;
    this.busy.set(true);
    const campaign = this.store.activeCampaignId(), account = this.auth.activeProfile().accountId;
    try {
      const saved = await firstValueFrom(this.http.post<LwItemCollectionVm>(`/api/v2/campaigns/${campaign}/item-collections`, draft));
      if (!this.sameContext(account, campaign)) return null;
      this.allCollections.update(rows => [saved, ...rows.filter(c => c.id !== saved.id)]);
      this.statusBanner.set(`Saved ${saved.name}${saved.publishedToStore ? ' to the free marketplace' : ' privately'}.`); return saved;
    } catch (e) { this.fail(e as never); return null; } finally { this.busy.set(false); }
  }
  async toggleItemInCollection(collectionId: string, itemId: string): Promise<void> {
    const c = this.allCollections().find(c => c.id === collectionId);
    if (!c) return;
    await this.saveGmCollection({ ...c, itemIds: c.itemIds.includes(itemId) ? c.itemIds.filter(id => id !== itemId) : [...c.itemIds, itemId], assignedMerchantName: c.assignedMerchantName ?? '', assignedLocationKey: c.assignedLocationKey ?? '', assignedLocationName: c.assignedLocationName ?? '' });
  }
}
