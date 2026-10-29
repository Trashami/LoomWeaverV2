import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface LwSourceSummaryVm {
  readonly id: string;
  readonly name: string;
  readonly source_type: string | null;
  readonly source_group: string | null;
  readonly published: string | null;
  readonly author: string | null;
  readonly cover_path: string | null;
  readonly deck_count: number;
}

export interface LwSourceSectionVm {
  readonly id: number;
  readonly name: string;
  readonly node_type: string | null;
  readonly page: number | null;
  readonly seq: number | null;
}

export interface LwSourceDeckVm {
  readonly id: number;
  readonly name: string;
  readonly cards_count: number | null;
  readonly image_path: string | null;
}

export interface LwSourceDetailVm extends Omit<LwSourceSummaryVm, 'deck_count'> {
  readonly sections: readonly LwSourceSectionVm[];
  readonly decks: readonly LwSourceDeckVm[];
}

@Injectable({ providedIn: 'root' })
export class SourceBookApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v2/sources';

  listSources(search: string): Observable<{ sources: LwSourceSummaryVm[] }> {
    let params = new HttpParams();
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<{ sources: LwSourceSummaryVm[] }>(this.base, { params });
  }

  getSource(code: string): Observable<LwSourceDetailVm> {
    return this.http.get<LwSourceDetailVm>(`${this.base}/${encodeURIComponent(code)}`);
  }
}
