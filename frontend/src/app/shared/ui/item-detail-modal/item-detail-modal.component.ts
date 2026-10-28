import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, HostListener, computed, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwBadgeComponent, LwBadgeTone } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwIconComponent } from '../icon/icon.component';
import { LwCatalogItemVm, LwItemCollectionVm } from '../item-card/item-card.models';

@Component({
  selector: 'lw-item-detail-modal',
  standalone: true,
  imports: [A11yModule,NgpButton, LwBadgeComponent, LwButtonComponent, LwIconComponent],
  templateUrl: './item-detail-modal.component.html',
  styleUrl: './item-detail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwItemDetailModalComponent {
  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.item()) this.closed.emit(); }
  readonly canAdd = input<boolean>(true);
  readonly canPublish = input<boolean>(false);
  readonly item = input<LwCatalogItemVm | null>(null);
  readonly targetCharacterName = input<string>('Active Character');
  readonly targetCampaignName = input<string>('Active Campaign');
  readonly isGm = input<boolean>(false);
  readonly collections = input<readonly LwItemCollectionVm[]>([]);

  readonly closed = output<void>();
  readonly addToCharacterRequested = output<{ item: LwCatalogItemVm; equipNow: boolean }>();
  readonly publishToStoreRequested = output<LwCatalogItemVm>();
  readonly toggleItemInCollectionRequested = output<{
    collectionId: string;
    itemId: string;
  }>();

  readonly rarityTone = computed<LwBadgeTone>(() => {
    const it = this.item();
    if (!it) return 'neutral';
    switch (it.rarity) {
      case 'Legendary':
      case 'Artifact':
        return 'crimson';
      case 'Very Rare':
      case 'Rare':
        return 'gold';
      case 'Uncommon':
        return 'emerald';
      default:
        return 'neutral';
    }
  });

  isItemInCollection(collection: LwItemCollectionVm, itemId: string): boolean {
    return collection.itemIds.includes(itemId);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('lw-item-modal-backdrop')) {
      this.closed.emit();
    }
  }
}
