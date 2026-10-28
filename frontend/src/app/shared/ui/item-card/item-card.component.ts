import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwBadgeComponent, LwBadgeTone } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwCatalogItemVm } from './item-card.models';

@Component({
  selector: 'lw-item-card',
  standalone: true,
  imports: [NgpButton, LwBadgeComponent, LwButtonComponent],
  templateUrl: './item-card.component.html',
  styleUrl: './item-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwItemCardComponent {
  readonly canAdd = input<boolean>(true);
  readonly canPublish = input<boolean>(false);
  readonly item = input.required<LwCatalogItemVm>();
  readonly targetCharacterName = input<string>('Active Character');
  readonly isGm = input<boolean>(false);
  readonly activeCollectionName = input<string>('');
  readonly inActiveCollection = input<boolean>(false);

  readonly itemSelected = output<LwCatalogItemVm>();
  readonly addToCharacterRequested = output<{ item: LwCatalogItemVm; equipNow: boolean }>();
  readonly toggleCollectionRequested = output<LwCatalogItemVm>();

  readonly imageFailed = signal<boolean>(false);

  readonly resolvedImageUrl = computed<string>(() => {
    if (this.imageFailed() || !this.item().imageUrl) {
      return '/assets/previews-png/obj-c4468a17dd78e8a4.png';
    }
    return this.item().imageUrl;
  });

  readonly rarityTone = computed<LwBadgeTone>(() => {
    switch (this.item().rarity) {
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

  onImageError(): void {
    this.imageFailed.set(true);
  }

  onCardClick(): void {
    this.itemSelected.emit(this.item());
  }

  onAddClick(event: Event): void {
    event.stopPropagation();
    this.addToCharacterRequested.emit({ item: this.item(), equipNow: false });
  }

  onToggleCollectionClick(event: Event): void {
    event.stopPropagation();
    this.toggleCollectionRequested.emit(this.item());
  }
}
