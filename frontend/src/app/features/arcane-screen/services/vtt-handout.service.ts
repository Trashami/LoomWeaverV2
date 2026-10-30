import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { TableRealtimeSyncService } from '../../../core/services/table-realtime-sync.service';
import { parseVttEvent } from './vtt-realtime-events';

export interface VttRevealedHandout {
  readonly title: string;
  readonly body: string;
}

/** GM-composed handouts revealed to the table over SignalR. Plain text only; never rendered as HTML. */
@Injectable({ providedIn: 'root' })
export class VttHandoutService {
  private readonly store = inject(LoomWeaverStoreService);
  private readonly realtime = inject(TableRealtimeSyncService);

  readonly draftTitle = signal<string>('');
  readonly draftBody = signal<string>('');
  readonly composeOpen = signal<boolean>(false);
  readonly revealed = signal<VttRevealedHandout | null>(null);
  readonly viewOpen = signal<boolean>(false);
  readonly hasRevealed = computed(() => this.revealed() !== null);

  constructor() {
    this.realtime.vttEvents.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((evt) => {
      if (evt.type !== 'handout_revealed' || evt.actorKey === this.store.activeUserAccountId()) return;
      const parsed = parseVttEvent(evt);
      if (parsed?.kind !== 'handout_revealed') return;
      this.revealed.set({ title: parsed.title, body: parsed.body });
      this.viewOpen.set(true);
    });
  }

  openCompose(): void {
    this.composeOpen.set(true);
  }

  closeCompose(): void {
    this.composeOpen.set(false);
  }

  /** Publishes the draft to every connected player and keeps a reopenable tab for the GM. */
  async reveal(): Promise<boolean> {
    const title = this.draftTitle().trim();
    const body = this.draftBody().trim();
    if (!title) return false;
    const handout: VttRevealedHandout = { title, body };
    this.revealed.set(handout);
    this.composeOpen.set(false);
    this.viewOpen.set(true);
    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) return false;
    return this.realtime.publishVtt(campaignId, 'handout_revealed', this.store.activeUserAccountId(), handout);
  }

  openRevealed(): void {
    if (this.revealed()) this.viewOpen.set(true);
  }

  closeView(): void {
    this.viewOpen.set(false);
  }
}
