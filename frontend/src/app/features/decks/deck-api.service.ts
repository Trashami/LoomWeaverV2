import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface LwDeckSummaryVm {
  readonly id: number;
  readonly name: string;
  readonly source_book: string;
  readonly description: string | null;
  readonly image_path: string | null;
}

export interface LwDeckCardVm {
  readonly key?: string;
  readonly replacement?: boolean;
  readonly name: string;
  readonly set_name: string;
  readonly source_book: string;
  readonly face_image_url: string | null;
  readonly back_image_url: string | null;
}

export interface LwDeckDetailVm extends LwDeckSummaryVm {
  readonly back_image_json: string | null;
  readonly cards: readonly LwDeckCardVm[];
  readonly uniqueCardCount: number;
}

export interface LwDeckDrawVm {
  readonly deckId: number;
  readonly deckName: string;
  readonly exhausted: boolean;
  readonly card: LwDeckCardVm | null;
}

@Injectable({ providedIn: 'root' })
export class DeckApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v2/decks';

  listDecks(source: string | null, search: string): Observable<{ decks: LwDeckSummaryVm[] }> {
    let params = new HttpParams();
    if (source) params = params.set('source', source);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<{ decks: LwDeckSummaryVm[] }>(this.base, { params });
  }

  getDeck(id: number): Observable<LwDeckDetailVm> {
    return this.http.get<LwDeckDetailVm>(`${this.base}/${id}`);
  }

  drawCard(id: number, excludeKeys: readonly string[]): Observable<LwDeckDrawVm> {
    let params = new HttpParams();
    if (excludeKeys.length) params = params.set('exclude', excludeKeys.join(','));
    return this.http.get<LwDeckDrawVm>(`${this.base}/${id}/draw`, { params });
  }
}
