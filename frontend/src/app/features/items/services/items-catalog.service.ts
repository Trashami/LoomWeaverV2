import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwCatalogItemVm, LwCreateCustomItemDraftVm, LwCreateItemCollectionDraftVm, LwItemCategory, LwItemCollectionVm, LwItemRarity, LwItemSortOption } from '../../../shared/ui/item-card/item-card.models';
import { CharacterSheetVm, EquipmentLoadoutItemVm } from '../../characters/models/character-studio.models';
import { CharacterStudioService } from '../../characters/services/character-studio.service';
export const ITEM_PAGE_SIZE = 48;
export const PICKER_PAGE_SIZE = 60;

export interface LwItemPageVm {
  readonly items: readonly LwCatalogItemVm[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
}

@Injectable({ providedIn: 'root' })
export class ItemsCatalogService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly auth = inject(AuthSessionService);
  private readonly characterStudio = inject(CharacterStudioService);
  readonly pageItems = signal<readonly LwCatalogItemVm[]>([]);
  readonly totalItems = signal(0);
  readonly page = signal(0);
  readonly pageSize = ITEM_PAGE_SIZE;
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.totalItems() / ITEM_PAGE_SIZE)));
  readonly loadingPage = signal(false);
  readonly pickerItems = signal<readonly LwCatalogItemVm[]>([]);
  readonly allCollections = signal<readonly LwItemCollectionVm[]>([]);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<'All' | LwItemCategory>('All');
  readonly selectedRarity = signal<'All' | LwItemRarity>('All');
  readonly selectedSource = signal<'All' | 'Official' | 'Homebrew' | 'StoreFree'>('All');
  readonly selectedCollectionId = signal('All');
  readonly sortBy = signal<LwItemSortOption>('name-asc');
  readonly inspectedItem = signal<LwCatalogItemVm | null>(null);
  readonly selectedTargetCharacterKey = signal('');
  readonly statusBanner = signal('Loading items…');
  readonly characterNotice = signal('');
  readonly busy = signal(false);
  readonly serverIsGm = signal(false);
  private pageSeq = 0;
  private pickerSeq = 0;
  private pageFilterKey = '';

  readonly filterKey = computed(() => [
    this.store.activeCampaignId(), this.auth.activeProfile().accountId, this.searchQuery().trim(),
    this.selectedCategory(), this.selectedRarity(), this.selectedSource(), this.sortBy(),
    this.activeCollection()?.id ?? 'All', (this.activeCollection()?.itemIds ?? []).join(','),
  ].join('|'));

  readonly collectionsForActiveCampaign = computed(() => this.allCollections().filter(c => c.campaignId === this.store.activeCampaignId()));
  readonly activeCollection = computed(() => this.collectionsForActiveCampaign().find(c => c.id === this.selectedCollectionId()) ?? null);
  readonly availableCampaignCharacters = computed(() => this.characterStudio.sheets().filter(s => s.campaignId === this.store.activeCampaignId() && s.characterKey === this.selectedTargetCharacterKey()));
  readonly targetCampaignCharacter = computed<CharacterSheetVm | null>(() => this.availableCampaignCharacters()[0] ?? null);
  readonly campaignLocations = computed(() => this.store.authorizedEntities().filter(e => e.campaignId === this.store.activeCampaignId() && e.entityType === 'Location').map(e => ({ key: e.entityKey, name: e.name })));

  constructor() {
    effect(onCleanup => {
      const campaign = this.store.activeCampaignId();
      const account = this.auth.activeProfile().accountId;
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      this.allCollections.set([]); this.selectedTargetCharacterKey.set('');
      this.characterNotice.set('');
      this.serverIsGm.set(false); this.inspectedItem.set(null); this.selectedCollectionId.set('All');
      this.pageItems.set([]); this.totalItems.set(0); this.page.set(0); this.pageFilterKey = '';
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

    // Filter changes return to the first page; the debounce keeps typing from issuing a request per keystroke.
    effect(onCleanup => {
      const key = this.filterKey();
      const page = this.page();
      untracked(() => {
        if (key !== this.pageFilterKey) {
          this.pageFilterKey = key;
          if (page !== 0) this.page.set(0);
        }
      });
      const timer = setTimeout(() => this.fetchPage(), 200);
      onCleanup(() => clearTimeout(timer));
    });
  }

  goToPage(index: number): void {
    if (index < 0 || index >= this.pageCount() || index === this.page()) return;
    this.page.set(index);
  }

  refreshPage(): void { this.fetchPage(); }

  searchPicker(query: string): void {
    const seq = ++this.pickerSeq;
    const params = new HttpParams().set('search', query.trim()).set('limit', PICKER_PAGE_SIZE);
    this.http.get<LwItemPageVm>('/api/v2/items/page', { params }).subscribe({
      next: result => { if (seq === this.pickerSeq) this.pickerItems.set(result.items); },
      error: e => { if (seq === this.pickerSeq) this.fail(e); },
    });
  }

  private fetchPage(): void {
    const seq = ++this.pageSeq;
    const collection = this.activeCollection();
    if (collection && collection.itemIds.length === 0) {
      this.pageItems.set([]); this.totalItems.set(0); this.loadingPage.set(false);
      this.statusBanner.set('');
      return;
    }
    let params = new HttpParams()
      .set('offset', this.page() * ITEM_PAGE_SIZE)
      .set('limit', ITEM_PAGE_SIZE)
      .set('sort', this.sortBy());
    const q = this.searchQuery().trim();
    if (q) params = params.set('search', q);
    if (this.selectedCategory() !== 'All') params = params.set('category', this.selectedCategory());
    if (this.selectedRarity() !== 'All') params = params.set('rarity', this.selectedRarity());
    if (this.selectedSource() !== 'All') params = params.set('source', this.selectedSource());
    if (collection) params = params.set('ids', collection.itemIds.slice(0, 500).join(','));

    this.loadingPage.set(true);
    this.http.get<LwItemPageVm>('/api/v2/items/page', { params }).subscribe({
      next: result => {
        if (seq !== this.pageSeq) return;
        this.pageItems.set(result.items); this.totalItems.set(result.total);
        this.loadingPage.set(false); this.statusBanner.set('');
      },
      error: e => { if (seq === this.pageSeq) { this.loadingPage.set(false); this.fail(e); } },
    });
  }

  openItemDetail(item: LwCatalogItemVm): void { this.inspectedItem.set(item); }
  closeItemDetail(): void { this.inspectedItem.set(null); }
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
      this.fetchPage(); this.statusBanner.set(`Saved homebrew item ${created.name}.`); return created;
    } catch (e) { this.fail(e as never); return null; } finally { this.busy.set(false); }
  }
  async publishHomebrewToStore(item: LwCatalogItemVm): Promise<void> {
    if (!this.canPublish(item) || this.busy()) return;
    this.busy.set(true);
    const account = this.auth.activeProfile().accountId, campaign = this.store.activeCampaignId();
    try {
      const saved = await firstValueFrom(this.http.post<LwCatalogItemVm>(`/api/v2/items/${encodeURIComponent(item.id)}/publish-store`, {}));
      if (!this.sameContext(account, campaign)) return;
      this.pageItems.update(items => items.map(i => i.id === saved.id ? saved : i));
      if (this.inspectedItem()?.id === saved.id) this.inspectedItem.set(saved);
      this.statusBanner.set(`Published ${saved.name} for free, credited to ${saved.creatorUsername}.`);
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
