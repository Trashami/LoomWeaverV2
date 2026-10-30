import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwIconComponent } from '../icon/icon.component';
import {
  LwCatalogItemVm,
  LwCreateItemCollectionDraftVm,
  LwItemCollectionVm,
} from '../item-card/item-card.models';

export interface LwCampaignLocationOptionVm {
  readonly key: string;
  readonly name: string;
}

@Component({
  selector: 'lw-item-collection-modal',
  standalone: true,
  imports: [A11yModule,FormsModule, NgpButton, LwBadgeComponent, LwButtonComponent, LwIconComponent],
  templateUrl: './item-collection-modal.component.html',
  styleUrl: './item-collection-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwItemCollectionModalComponent {
  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.open()) this.close(); }
  readonly saveError = input<string>('');
  readonly busy = input(false);
  readonly open = model<boolean>(false);
  readonly campaignName = input<string>('Active Campaign');
  readonly editingCollection = input<LwItemCollectionVm | null>(null);
  readonly availableItems = input<readonly LwCatalogItemVm[]>([]);
  readonly campaignLocations = input<readonly LwCampaignLocationOptionVm[]>([]);

  readonly collectionSaved = output<LwCreateItemCollectionDraftVm>();
  readonly pickerSearch = output<string>();

  readonly publishedToStore = signal(false);
  readonly name = signal<string>('');
  readonly description = signal<string>('');
  readonly assignedMerchantName = signal<string>('');
  readonly assignedLocationKey = signal<string>('');
  readonly selectedItemIds = signal<readonly string[]>([]);
  readonly itemSearchQuery = signal<string>('');
  readonly errorMessage = signal<string>('');
  private pickerTimer: ReturnType<typeof setTimeout> | undefined;

  onItemSearchChange(value: string): void {
    this.itemSearchQuery.set(value);
    clearTimeout(this.pickerTimer);
    this.pickerTimer = setTimeout(() => this.pickerSearch.emit(value.trim()), 200);
  }

  constructor() {
    effect(
      () => {
        const isOpen = this.open();
        const editing = this.editingCollection();
        const locs = this.campaignLocations();
        if (!isOpen) return;

        if (editing) {
          this.publishedToStore.set(editing.publishedToStore ?? false);
          this.name.set(editing.name);
          this.description.set(editing.description);
          this.assignedMerchantName.set(editing.assignedMerchantName ?? '');
          this.assignedLocationKey.set(editing.assignedLocationKey ?? locs[0]?.key ?? '');
          this.selectedItemIds.set([...editing.itemIds]);
        } else {
          this.publishedToStore.set(false);
          this.name.set('');
          this.description.set('');
          this.assignedMerchantName.set('');
          this.assignedLocationKey.set(locs[0]?.key ?? '');
          this.selectedItemIds.set([]);
        }
        this.itemSearchQuery.set('');
        this.errorMessage.set('');
        this.pickerSearch.emit('');
      },
      { allowSignalWrites: true },
    );
  }

  isItemSelected(itemId: string): boolean {
    return this.selectedItemIds().includes(itemId);
  }

  toggleItem(itemId: string): void {
    this.selectedItemIds.update((cur) =>
      cur.includes(itemId) ? cur.filter((id) => id !== itemId) : [...cur, itemId],
    );
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('lw-col-modal-backdrop')) {
      this.close();
    }
  }

  close(): void {
    this.errorMessage.set('');
    this.open.set(false);
  }

  saveCollection(): void {
    const cleanName = this.name().trim();
    if (!cleanName) {
      this.errorMessage.set('Please enter a name for the custom item collection.');
      return;
    }

    const locKey = this.assignedLocationKey().trim();
    const matchedLoc = this.campaignLocations().find((l) => l.key === locKey);

    this.collectionSaved.emit({
      id: this.editingCollection()?.id,
      name: cleanName,
      publishedToStore: this.publishedToStore(),
      description:
        this.description().trim() ||
        `Curated GM item collection for ${this.campaignName()}.`,
      itemIds: this.selectedItemIds(),
      assignedMerchantName: this.assignedMerchantName().trim(),
      assignedLocationKey: locKey,
      assignedLocationName: matchedLoc?.name ?? '',
    });


  }
}
