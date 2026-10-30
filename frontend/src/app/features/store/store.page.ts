import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwPageHeaderComponent } from '../../shared/ui/public-api';
import {
  StoreApiService,
  StoreContentType,
  StoreListingVm,
} from './store-api.service';

type StoreFilter = 'all' | StoreContentType;

interface StoreChip {
  readonly value: StoreFilter;
  readonly label: string;
}

const PLATFORM_CREATOR = 'loomweaver';

@Component({
  selector: 'lw-store-page',
  standalone: true,
  imports: [FormsModule, NgpButton, LwPageHeaderComponent],
  templateUrl: './store.page.html',
  styleUrl: './store.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorePageComponent {
  private readonly api = inject(StoreApiService);

  readonly chips: readonly StoreChip[] = [
    { value: 'all', label: 'All' },
    { value: 'magic', label: 'Homebrew magic' },
    { value: 'item', label: 'Items' },
    { value: 'feat', label: 'Feats' },
    { value: 'background', label: 'Backgrounds' },
    { value: 'deck', label: 'Decks' },
    { value: 'monster', label: 'Monsters' },
    { value: 'dice', label: 'Dice' },
    { value: 'adventure', label: 'Adventures' },
    { value: 'one_shot', label: 'One-shots' },
    { value: 'merchant', label: 'Custom merchants' },
    { value: 'other', label: 'Other' },
  ];

  readonly filter = signal<StoreFilter>('all');
  readonly search = signal('');
  readonly items = signal<readonly StoreListingVm[]>([]);
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly selected = signal<StoreListingVm | null>(null);
  readonly actionBusy = signal(false);

  readonly hasSelection = computed(() => this.selected() !== null);

  constructor() {
    this.load(true);
  }

  setFilter(value: StoreFilter): void {
    this.filter.set(value);
    this.load(true);
  }

  runSearch(): void {
    this.load(true);
  }

  loadMore(): void {
    this.load(false);
  }

  select(item: StoreListingVm): void {
    this.selected.set(item);
  }

  closeDetail(): void {
    this.selected.set(null);
  }

  acquire(item: StoreListingVm): void {
    this.actionBusy.set(true);
    this.api.acquire(item).subscribe({
      next: (updated) => this.replaceListing(updated),
      error: () => this.errorMessage.set('Could not add this item to your account.'),
      complete: () => this.actionBusy.set(false),
    });
  }

  rate(item: StoreListingVm, rating: number): void {
    this.actionBusy.set(true);
    this.api.rate(item, rating).subscribe({
      next: (updated) => this.replaceListing(updated),
      error: (err) =>
        this.errorMessage.set(
          err?.status === 403
            ? 'Import this item before rating it.'
            : 'Could not save your rating.',
        ),
      complete: () => this.actionBusy.set(false),
    });
  }

  showCreator(item: StoreListingVm): boolean {
    return item.creatorUsername.trim().toLowerCase() !== PLATFORM_CREATOR;
  }

  formatRating(item: StoreListingVm): string {
    if (item.averageRating === null || item.ratingCount === 0) return 'No ratings yet';
    return `${item.averageRating.toFixed(1)} (${item.ratingCount})`;
  }

  private load(reset: boolean): void {
    const nextPage = reset ? 1 : this.page() + 1;
    this.loading.set(true);
    this.errorMessage.set('');
    this.api.list(this.filter(), this.search(), nextPage).subscribe({
      next: (res) => {
        this.items.set(reset ? [...res.items] : [...this.items(), ...res.items]);
        this.page.set(res.page);
        this.hasMore.set(res.hasMore);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load the store.');
        this.loading.set(false);
      },
    });
  }

  private replaceListing(updated: StoreListingVm): void {
    this.items.set(
      this.items().map((i) =>
        i.sourceTable === updated.sourceTable && i.sourceKey === updated.sourceKey
          ? updated
          : i,
      ),
    );
    this.selected.set(updated);
  }
}
