import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwBadgeComponent, LwBadgeTone } from '../badge/badge.component';
import { LW_MONSTER_PLACEHOLDER_IMAGE, LwMonsterSummaryVm } from './monster-card.models';

/** Compact bestiary list card: small image, name, short description, CR, and creator credit for homebrew. */
@Component({
  selector: 'lw-monster-card',
  standalone: true,
  imports: [NgpButton, LwBadgeComponent],
  templateUrl: './monster-card.component.html',
  styleUrl: './monster-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterCardComponent {
  readonly monster = input.required<LwMonsterSummaryVm>();
  /** Campaign-specific primary token (DM-only assignment); overrides the default art when provided. */
  readonly assignedImageUrl = input<string | null>(null);
  readonly inCollection = input<boolean>(false);
  readonly timesMet = input<number>(0);

  readonly monsterSelected = output<LwMonsterSummaryVm>();

  private readonly failedUrls = signal<readonly string[]>([]);

  readonly resolvedImageUrl = computed<string>(() => {
    const m = this.monster();
    const failed = this.failedUrls();
    const candidates = [this.assignedImageUrl(), m.imageUrl, m.tokenUrl].filter(
      (u): u is string => !!u && !failed.includes(u),
    );
    return candidates[0] ?? LW_MONSTER_PLACEHOLDER_IMAGE;
  });

  readonly crTone = computed<LwBadgeTone>(() => {
    const cr = this.monster().crValue;
    if (cr >= 17) return 'crimson';
    if (cr >= 11) return 'violet';
    if (cr >= 5) return 'gold';
    if (cr >= 1) return 'emerald';
    return 'neutral';
  });

  onImageError(): void {
    const current = this.resolvedImageUrl();
    if (current !== LW_MONSTER_PLACEHOLDER_IMAGE) {
      this.failedUrls.update((list) => [...list, current]);
    }
  }
}
