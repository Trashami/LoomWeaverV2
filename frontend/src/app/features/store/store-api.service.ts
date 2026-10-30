import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type StoreContentType =
  | 'dice'
  | 'adventure'
  | 'one_shot'
  | 'merchant'
  | 'magic'
  | 'item'
  | 'feat'
  | 'background'
  | 'deck'
  | 'monster'
  | 'other';

export interface StoreListingVm {
  readonly sourceTable: string;
  readonly sourceKey: string;
  readonly contentType: StoreContentType;
  readonly title: string;
  readonly summary: string;
  readonly creatorUsername: string;
  readonly isOfficial: boolean;
  readonly averageRating: number | null;
  readonly ratingCount: number;
  readonly acquisitionCount: number;
  readonly acquired: boolean;
  readonly myRating: number | null;
}

export interface StorePageVm {
  readonly items: readonly StoreListingVm[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

@Injectable({ providedIn: 'root' })
export class StoreApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v2/store/listings';

  list(type: StoreContentType | 'all', search: string, page: number): Observable<StorePageVm> {
    let params = new HttpParams().set('type', type).set('page', page);
    if (search.trim()) params = params.set('q', search.trim());
    return this.http.get<StorePageVm>(this.base, { params });
  }

  acquire(item: StoreListingVm): Observable<StoreListingVm> {
    return this.http.post<StoreListingVm>(this.listingUrl(item, '/acquire'), {});
  }

  rate(item: StoreListingVm, rating: number): Observable<StoreListingVm> {
    return this.http.put<StoreListingVm>(this.listingUrl(item, '/rating'), { rating });
  }

  private listingUrl(item: StoreListingVm, suffix: string): string {
    return `${this.base}/${encodeURIComponent(item.sourceTable)}/${encodeURIComponent(item.sourceKey)}${suffix}`;
  }
}
