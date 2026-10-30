import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LwItemCardComponent } from '../../../shared/ui/item-card/item-card.component';
import { LwCatalogItemVm, LwItemCollectionVm } from '../../../shared/ui/item-card/item-card.models';
import { LwItemDetailModalComponent } from '../../../shared/ui/item-detail-modal/item-detail-modal.component';
import { LwPanelComponent } from '../../../shared/ui/panel/panel.component';
import { ItemsCatalogService } from '../services/items-catalog.service';

@Component({
  selector: 'lw-item-market', standalone: true,
  imports: [FormsModule, LwItemCardComponent, LwItemDetailModalComponent, LwPanelComponent],
  templateUrl: './item-market.component.html', styleUrl: './item-market.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemMarketComponent {
  private readonly http = inject(HttpClient);
  readonly catalog = inject(ItemsCatalogService);
  readonly items = signal<readonly LwCatalogItemVm[]>([]);
  readonly collections = signal<readonly LwItemCollectionVm[]>([]);
  readonly collectionOfficialItems = signal<readonly LwCatalogItemVm[]>([]);
  readonly selected = signal<LwCatalogItemVm | null>(null);
  readonly search = signal('');
  readonly collectionId = signal('');
  readonly status = signal('Loading free homebrew items...');
  readonly filtered = computed(() => {
    const ids = this.collections().find(c => c.id === this.collectionId())?.itemIds;
    const query = this.search().trim().toLowerCase();
    // Published collections can also contain standard catalog equipment.
    const all = ids ? [...this.items(), ...this.collectionOfficialItems()] : this.items();
    return all.filter(i => (!ids || ids.includes(i.id)) && `${i.name} ${i.shortDescription} ${i.creatorUsername}`.toLowerCase().includes(query)).sort((a,b) => a.name.localeCompare(b.name));
  });
  constructor() {
    this.http.get<readonly LwCatalogItemVm[]>('/api/v2/marketplace/items').subscribe({ next: rows => { this.items.set(rows); this.status.set('Always free. Item prices in GP are in-game values.'); }, error: () => this.status.set('Unable to load marketplace items. Please reload to retry.') });
    this.http.get<readonly LwItemCollectionVm[]>('/api/v2/marketplace/item-collections').subscribe({ next: rows => this.collections.set(rows), error: () => this.status.set('Unable to load published collections. Please reload to retry.') });
    effect(onCleanup => {
      const ids = this.collections().find(c => c.id === this.collectionId())?.itemIds ?? [];
      if (ids.length === 0) { this.collectionOfficialItems.set([]); return; }
      const params = new HttpParams().set('ids', ids.slice(0, 200).join(',')).set('limit', 200);
      const sub = this.http.get<{ items: readonly LwCatalogItemVm[] }>('/api/v2/items/page', { params }).subscribe({
        next: page => this.collectionOfficialItems.set(page.items.filter(i => !i.isHomebrew)),
        error: () => this.collectionOfficialItems.set([]),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }
}
