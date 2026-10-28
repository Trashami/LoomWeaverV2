import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  LwCustomMonsterDraft,
  LwMonsterAssignmentVm,
  LwMonsterCollectionVm,
  LwMonsterDetailVm,
  LwMonsterPageVm,
  LwMonsterPlacementVm,
  LwMonsterSightingVm,
  LwMonsterSortOption,
  LwMonsterSourceFilter,
  LwMonsterSummaryVm,
  LwSaveMonsterCollectionDraft,
} from '../../../shared/ui/public-api';

export interface BestiaryListParams {
  readonly search: string;
  readonly type: string;
  readonly source: LwMonsterSourceFilter;
  readonly crMin: number | null;
  readonly crMax: number | null;
  readonly sort: LwMonsterSortOption;
  readonly offset: number;
  readonly limit: number;
}

export interface CampaignBestiaryStateVm {
  readonly campaignId: number;
  readonly isEffectiveGm: boolean;
  readonly collections: readonly LwMonsterCollectionVm[];
  readonly assignments: readonly LwMonsterAssignmentVm[];
  readonly placements: readonly LwMonsterPlacementVm[];
}

export interface RecordSightingBody {
  readonly monsterKey: string;
  readonly monsterName: string;
  readonly outcome: string;
  readonly sessionId: string | null;
  readonly sessionLabel: string | null;
  readonly locationName: string | null;
  readonly encounterId: string | null;
  readonly encounterLabel: string | null;
  readonly witnessCharacterKeys: readonly string[];
  readonly visibility: string;
  readonly notes: string | null;
}

export interface AddPlacementBody {
  readonly monsterKey: string;
  readonly monsterName: string;
  readonly scope: string;
  readonly sessionId: string | null;
  readonly sessionLabel: string | null;
  readonly encounterId: string | null;
  readonly encounterLabel: string | null;
  readonly count: number;
}

/** Typed HTTP client for the .NET Bestiary module. Campaign calls pass the viewer role so the server can down-scope previews. */
@Injectable({ providedIn: 'root' })
export class BestiaryApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v2';

  listMonsters(p: BestiaryListParams): Observable<LwMonsterPageVm> {
    let params = new HttpParams()
      .set('source', p.source)
      .set('sort', p.sort)
      .set('offset', p.offset)
      .set('limit', p.limit);
    if (p.search.trim()) params = params.set('search', p.search.trim());
    if (p.type && p.type !== 'all') params = params.set('type', p.type);
    if (p.crMin !== null) params = params.set('crMin', p.crMin);
    if (p.crMax !== null) params = params.set('crMax', p.crMax);
    return this.http.get<LwMonsterPageVm>(`${this.base}/bestiary/monsters`, { params });
  }

  listByKeys(keys: readonly string[]): Observable<LwMonsterPageVm> {
    const params = new HttpParams().set('keys', keys.join(','));
    return this.http.get<LwMonsterPageVm>(`${this.base}/bestiary/monsters`, { params });
  }

  getMonster(key: string): Observable<LwMonsterDetailVm> {
    return this.http.get<LwMonsterDetailVm>(`${this.base}/bestiary/monsters/${encodeURIComponent(key)}`);
  }

  createCustomMonster(draft: LwCustomMonsterDraft): Observable<LwMonsterDetailVm> {
    return this.http.post<LwMonsterDetailVm>(`${this.base}/bestiary/custom-monsters`, draft);
  }

  updateCustomMonster(key: string, draft: LwCustomMonsterDraft): Observable<LwMonsterDetailVm> {
    return this.http.put<LwMonsterDetailVm>(`${this.base}/bestiary/custom-monsters/${encodeURIComponent(key)}`, draft);
  }

  publishCustomMonster(key: string): Observable<LwMonsterSummaryVm> {
    return this.http.post<LwMonsterSummaryVm>(`${this.base}/bestiary/custom-monsters/${encodeURIComponent(key)}/publish`, {});
  }

  getCampaignState(campaignId: number, role: string): Observable<CampaignBestiaryStateVm> {
    return this.http.get<CampaignBestiaryStateVm>(this.campaignUrl(campaignId, 'state', role));
  }

  saveCollection(campaignId: number, role: string, draft: LwSaveMonsterCollectionDraft): Observable<LwMonsterCollectionVm> {
    const body = {
      name: draft.name,
      description: draft.description,
      assignedCampaignIds: draft.assignedCampaignIds,
      monsterKeys: draft.monsterKeys,
    };
    return draft.id
      ? this.http.put<LwMonsterCollectionVm>(this.campaignUrl(campaignId, `collections/${encodeURIComponent(draft.id)}`, role), body)
      : this.http.post<LwMonsterCollectionVm>(this.campaignUrl(campaignId, 'collections', role), body);
  }

  deleteCollection(campaignId: number, role: string, collectionId: string): Observable<void> {
    return this.http.delete<void>(this.campaignUrl(campaignId, `collections/${encodeURIComponent(collectionId)}`, role));
  }

  saveAssignment(
    campaignId: number,
    role: string,
    monsterKey: string,
    body: Pick<LwMonsterAssignmentVm, 'primaryTokenUrl' | 'secondaryTokenUrl' | 'primaryModelUrl' | 'secondaryModelUrl'>,
  ): Observable<LwMonsterAssignmentVm> {
    return this.http.put<LwMonsterAssignmentVm>(
      this.campaignUrl(campaignId, `assignments/${encodeURIComponent(monsterKey)}`, role),
      body,
    );
  }

  addPlacement(campaignId: number, role: string, body: AddPlacementBody): Observable<LwMonsterPlacementVm> {
    return this.http.post<LwMonsterPlacementVm>(this.campaignUrl(campaignId, 'placements', role), body);
  }

  removePlacement(campaignId: number, role: string, placementId: string): Observable<void> {
    return this.http.delete<void>(this.campaignUrl(campaignId, `placements/${encodeURIComponent(placementId)}`, role));
  }

  listSightings(campaignId: number, role: string, monsterKey?: string): Observable<LwMonsterSightingVm[]> {
    const suffix = monsterKey ? `&monsterKey=${encodeURIComponent(monsterKey)}` : '';
    return this.http.get<LwMonsterSightingVm[]>(`${this.campaignUrl(campaignId, 'sightings', role)}${suffix}`);
  }

  recordSighting(campaignId: number, role: string, body: RecordSightingBody): Observable<LwMonsterSightingVm> {
    return this.http.post<LwMonsterSightingVm>(this.campaignUrl(campaignId, 'sightings', role), body);
  }

  private campaignUrl(campaignId: number, path: string, role: string): string {
    return `${this.base}/campaigns/${campaignId}/bestiary/${path}?role=${encodeURIComponent(role)}`;
  }
}
