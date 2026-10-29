import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import {
  DeckApiService,
  LwDeckCardVm,
  LwDeckDetailVm,
  LwDeckSummaryVm,
} from './deck-api.service';

@Component({
  selector: 'lw-decks-page',
  standalone: true,
  imports: [FormsModule, RouterLink, NgpButton],
  templateUrl: './decks.page.html',
  styleUrl: './decks.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecksPageComponent {
  private readonly api = inject(DeckApiService);
  private readonly route = inject(ActivatedRoute);

  readonly deckId = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly sourceFilter = this.route.snapshot.queryParamMap.get('source');

  readonly search = signal('');
  readonly decks = signal<readonly LwDeckSummaryVm[]>([]);
  readonly deck = signal<LwDeckDetailVm | null>(null);
  readonly drawn = signal<LwDeckCardVm | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly uniqueCards = computed<readonly LwDeckCardVm[]>(() => {
    const seen = new Map<string, LwDeckCardVm>();
    for (const card of this.deck()?.cards ?? []) {
      if (!seen.has(card.name)) seen.set(card.name, card);
    }
    return [...seen.values()];
  });

  constructor() {
    if (this.deckId) {
      this.loadDeck(this.deckId);
    } else {
      this.loadList();
    }
  }

  loadList(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.api.listDecks(this.sourceFilter, this.search()).subscribe({
      next: (res) => {
        this.decks.set(res.decks);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load decks.');
        this.loading.set(false);
      },
    });
  }

  loadDeck(id: number): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.api.getDeck(id).subscribe({
      next: (deck) => {
        this.deck.set(deck);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load this deck.');
        this.loading.set(false);
      },
    });
  }

  draw(): void {
    const id = this.deck()?.id;
    if (!id) return;
    this.api.drawCard(id).subscribe({
      next: (res) => this.drawn.set(res.card),
      error: () => this.errorMessage.set('Could not draw a card from this deck.'),
    });
  }
}
