import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwCreatePlaceholderComponent, LwPanelComponent } from '../../shared/ui/public-api';

interface SessionEntry {
  readonly id: string;
  readonly sessionNumber: number;
  readonly title: string;
  readonly dateLabel: string;
  readonly summary: string;
  readonly locationName: string;
  readonly xpAwarded: number;
  readonly highlights: readonly string[];
}

interface PlayEventEntry {
  readonly id: number;
  readonly sessionId: string | null;
  readonly kind: string;
  readonly actor: string;
  readonly summary: string;
  readonly createdAt: string;
}

@Component({
  selector: 'lw-timeline-page',
  standalone: true,
  imports: [DatePipe, RouterLink, LwPanelComponent, LwCreatePlaceholderComponent],
  templateUrl: './timeline.page.html',
  styleUrl: './timeline.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelinePageComponent {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);

  readonly loading = signal(true);
  readonly sessions = signal<readonly SessionEntry[]>([]);
  readonly playEvents = signal<readonly PlayEventEntry[]>([]);
  readonly eventsVisible = signal(false);

  readonly totalXp = computed(() => this.sessions().reduce((sum, s) => sum + s.xpAwarded, 0));

  constructor() {
    this.load();
  }

  load(): void {
    const campaignId = this.store.activeCampaignId();
    this.loading.set(true);
    this.http.get<SessionEntry[]>(`/api/v2/campaigns/${campaignId}/sessions`).subscribe({
      next: (rows) => {
        this.sessions.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.sessions.set([]);
        this.loading.set(false);
      },
    });
    // play-events is GM-only; players receive 403 and the feed stays hidden.
    this.http.get<PlayEventEntry[]>(`/api/v2/campaigns/${campaignId}/play-events`).subscribe({
      next: (rows) => {
        this.playEvents.set(rows ?? []);
        this.eventsVisible.set(true);
      },
      error: () => {
        this.playEvents.set([]);
        this.eventsVisible.set(false);
      },
    });
  }
}
