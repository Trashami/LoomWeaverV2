import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwAssetCardComponent,
  LwButtonComponent,
  LwPageHeaderComponent,
  LwPanelComponent,
} from '../../shared/ui/public-api';

@Component({
  selector: 'lw-assets-page',
  standalone: true,
  imports: [
    RouterLink,
    LwPageHeaderComponent,
    LwPanelComponent,
    LwButtonComponent,
    LwAssetCardComponent,
  ],
  templateUrl: './assets.page.html',
  styleUrl: './assets.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsPageComponent {
  readonly store = inject(LoomWeaverStoreService);

  readonly selectedCategory = signal<string>('All');
  readonly categories = ['All', 'Map Pack', 'Dice Skin', 'Spell FX', 'Audio Pack', 'Module'];

  readonly filteredAssets = computed(() => {
    const cat = this.selectedCategory();
    return this.store.assets().filter((a) => cat === 'All' || a.category === cat);
  });
}
