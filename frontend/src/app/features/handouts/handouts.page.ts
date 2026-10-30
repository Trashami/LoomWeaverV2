import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwCreatePlaceholderComponent, LwPageHeaderComponent, LwPanelComponent } from '../../shared/ui/public-api';

interface HandoutEntry {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly category: string;
  readonly excerpt: string;
  readonly content: string;
  readonly artworkUrl: string;
  readonly visibility: string;
  readonly archived: boolean;
  readonly updatedAtLabel: string;
}

interface LoreWorkspaceResponse {
  readonly loreEntries?: readonly HandoutEntry[];
}

@Component({
  selector: 'lw-handouts-page',
  standalone: true,
  imports: [LwPageHeaderComponent, LwPanelComponent, LwCreatePlaceholderComponent],
  templateUrl: './handouts.page.html',
  styleUrl: './handouts.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HandoutsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);

  readonly loading = signal(true);
  readonly handouts = signal<readonly HandoutEntry[]>([]);
  readonly activeCategory = signal<string>('All');
  readonly selectedId = signal<string>('');

  readonly categories = computed(() => {
    const set = new Set(this.handouts().map((h) => h.category || 'Uncategorized'));
    return ['All', ...Array.from(set).sort()];
  });

  readonly visibleHandouts = computed(() => {
    const category = this.activeCategory();
    return this.handouts().filter(
      (h) => !h.archived && (category === 'All' || (h.category || 'Uncategorized') === category),
    );
  });

  readonly selected = computed<HandoutEntry | undefined>(() => {
    const list = this.visibleHandouts();
    return list.find((h) => h.id === this.selectedId()) ?? list[0];
  });

  constructor() {
    this.load();
  }

  load(): void {
    const campaignId = this.store.activeCampaignId();
    const role = this.store.viewerRole();
    this.loading.set(true);
    this.http.get<LoreWorkspaceResponse>(`/api/v2/campaigns/${campaignId}/world-lore?role=${role}`).subscribe({
      next: (res) => {
        this.handouts.set(res?.loreEntries ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.handouts.set([]);
        this.loading.set(false);
      },
    });
  }

  selectCategory(category: string): void {
    this.activeCategory.set(category);
    this.selectedId.set('');
  }
}
