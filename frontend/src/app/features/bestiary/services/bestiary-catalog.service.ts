import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import {
  LwCustomMonsterDraft,
  LwMonsterDetailVm,
  LwMonsterSortOption,
  LwMonsterSourceFilter,
  LwMonsterSummaryVm,
} from '../../../shared/ui/public-api';
import { BestiaryApiService } from './bestiary-api.service';

const PAGE_SIZE = 48;

export interface CrBand {
  readonly id: string;
  readonly label: string;
  readonly min: number | null;
  readonly max: number | null;
}

export const CR_BANDS: readonly CrBand[] = [
  { id: 'all', label: 'Any CR', min: null, max: null },
  { id: 'low', label: 'CR 0 - 1', min: 0, max: 1 },
  { id: 'mid', label: 'CR 2 - 4', min: 2, max: 4 },
  { id: 'high', label: 'CR 5 - 10', min: 5, max: 10 },
  { id: 'elite', label: 'CR 11 - 16', min: 11, max: 16 },
  { id: 'mythic', label: 'CR 17+', min: 17, max: null },
];

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const msg = (err.error as { message?: string } | null)?.message;
    if (msg) return msg;
    if (err.status === 0) return 'The LoomWeaver server is unreachable. Check that the backend is running.';
  }
  return fallback;
}

/** Bestiary browsing state: server-side search/filter/paging, the open monster detail, and custom monster authoring. */
@Injectable({ providedIn: 'root' })
export class BestiaryCatalogService {
  private readonly api = inject(BestiaryApiService);
  private readonly alertify = inject(LwAlertifyService);
  private readonly searchInput$ = new Subject<void>();

  readonly searchQuery = signal<string>('');
  readonly typeFilter = signal<string>('all');
  readonly sourceFilter = signal<LwMonsterSourceFilter>('all');
  readonly crBandId = signal<string>('all');
  readonly sortBy = signal<LwMonsterSortOption>('name');

  readonly monsters = signal<readonly LwMonsterSummaryVm[]>([]);
  readonly total = signal<number>(0);
  /** Zero-based index of the page currently shown. */
  readonly page = signal<number>(0);
  readonly pageSize = PAGE_SIZE;
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly loading = signal<boolean>(false);
  readonly listError = signal<string>('');
  readonly databaseOnline = signal<boolean>(true);

  readonly openKey = signal<string | null>(null);
  readonly detail = signal<LwMonsterDetailVm | null>(null);
  readonly detailLoading = signal<boolean>(false);
  readonly detailError = signal<string>('');

  readonly customModalOpen = signal<boolean>(false);
  readonly editingCustom = signal<LwMonsterDetailVm | null>(null);
  readonly customSaving = signal<boolean>(false);
  readonly customError = signal<string>('');

  /** Name lookup for every monster seen this session (collections store keys only). */
  readonly knownNames = signal<Readonly<Record<string, string>>>({});

  /** When set, the grid shows exactly these monsters (a DM collection) instead of the filtered catalog. */
  readonly collectionKeys = signal<readonly string[] | null>(null);
  readonly pickerResults = signal<readonly LwMonsterSummaryVm[]>([]);
  private readonly pickerInput$ = new Subject<string>();

  private requestId = 0;
  private loaded = false;

  constructor() {
    this.searchInput$.pipe(debounceTime(300)).subscribe(() => this.reload());
    this.pickerInput$
      .pipe(
        debounceTime(250),
        switchMap((q) =>
          this.api
            .listMonsters({
              search: q, type: 'all', source: 'all', crMin: null, crMax: null, sort: 'name', offset: 0, limit: 25,
            })
            .pipe(catchError(() => of(null))),
        ),
      )
      .subscribe((page) => {
        this.pickerResults.set(page?.items ?? []);
        if (page) this.remember(page.items);
      });
  }

  searchPicker(query: string): void {
    this.pickerInput$.next(query);
  }

  showCollection(keys: readonly string[] | null): void {
    this.collectionKeys.set(keys ? [...keys] : null);
    if (keys && keys.length === 0) {
      this.requestId++;
      this.monsters.set([]);
      this.total.set(0);
      this.loading.set(false);
      return;
    }
    this.reload();
  }

  ensureLoaded(): void {
    if (!this.loaded) {
      this.loaded = true;
      this.reload();
    }
  }

  setSearch(value: string): void {
    this.searchQuery.set(value);
    this.searchInput$.next();
  }

  setFilter(apply: () => void): void {
    apply();
    this.reload();
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.typeFilter.set('all');
    this.sourceFilter.set('all');
    this.crBandId.set('all');
    this.sortBy.set('name');
    this.reload();
  }

  reload(): void {
    this.page.set(0);
    this.fetchPage(0);
  }

  goToPage(index: number): void {
    const target = Math.min(Math.max(0, index), this.pageCount() - 1);
    if (this.loading() || target === this.page()) return;
    this.page.set(target);
    this.fetchPage(target * PAGE_SIZE);
  }

  refreshPage(): void {
    this.fetchPage(this.page() * PAGE_SIZE);
  }

  openMonster(key: string): void {
    this.openKey.set(key);
    this.detailError.set('');
    if (this.detail()?.summary.key !== key) this.detail.set(null);
    this.detailLoading.set(true);
    this.api.getMonster(key).subscribe({
      next: (d) => {
        if (this.openKey() !== key) return;
        this.detail.set(d);
        this.remember([d.summary]);
        this.detailLoading.set(false);
      },
      error: (err) => {
        this.detailError.set(apiErrorMessage(err, 'This monster could not be loaded.'));
        this.detailLoading.set(false);
      },
    });
  }

  closeMonster(): void {
    this.openKey.set(null);
    this.detail.set(null);
    this.detailError.set('');
  }

  openCreateCustom(): void {
    this.editingCustom.set(null);
    this.customError.set('');
    this.customModalOpen.set(true);
  }

  openEditCustom(): void {
    const d = this.detail();
    if (!d?.summary.ownedByViewer) return;
    this.editingCustom.set(d);
    this.customError.set('');
    this.customModalOpen.set(true);
  }

  saveCustom(draft: LwCustomMonsterDraft): void {
    const editing = this.editingCustom();
    this.customSaving.set(true);
    this.customError.set('');
    const request$ = editing
      ? this.api.updateCustomMonster(editing.summary.key, draft)
      : this.api.createCustomMonster(draft);
    request$.subscribe({
      next: (saved) => {
        this.customSaving.set(false);
        this.customModalOpen.set(false);
        this.alertify.notifyStatus(
          saved.summary.creatorUsername ?? 'Creator',
          editing ? 'Custom monster updated' : 'Custom monster created',
          `${saved.summary.name} ${saved.summary.isPublished ? 'is live in the market for free.' : 'is saved privately to your account.'}`,
          'gold',
        );
        this.refreshPage();
        this.openKey.set(saved.summary.key);
        this.detail.set(saved);
      },
      error: (err) => {
        this.customSaving.set(false);
        this.customError.set(apiErrorMessage(err, 'The custom monster could not be saved.'));
      },
    });
  }

  publish(key: string): void {
    this.api.publishCustomMonster(key).subscribe({
      next: (summary) => {
        this.detail.update((d) => (d && d.summary.key === key ? { ...d, summary } : d));
        this.monsters.update((list) => list.map((m) => (m.key === key ? summary : m)));
        this.alertify.notifyStatus(summary.creatorUsername ?? 'Creator', 'Published to the market', `${summary.name} is now free for every table.`, 'emerald');
      },
      error: (err) => this.detailError.set(apiErrorMessage(err, 'Publishing failed.')),
    });
  }

  private fetchPage(offset: number): void {
    const id = ++this.requestId;
    const band = CR_BANDS.find((b) => b.id === this.crBandId()) ?? CR_BANDS[0];
    const keys = this.collectionKeys();
    this.loading.set(true);
    this.listError.set('');
    const request$ = keys
      ? this.api.listByKeys(keys)
      : this.api.listMonsters({
          search: this.searchQuery(),
          type: this.typeFilter(),
          source: this.sourceFilter(),
          crMin: band.min,
          crMax: band.max,
          sort: this.sortBy(),
          offset,
          limit: PAGE_SIZE,
        });
    request$.subscribe({
      next: (page) => {
        if (id !== this.requestId) return;
        this.monsters.set(page.items);
        this.total.set(page.total);
        this.databaseOnline.set(page.databaseOnline);
        this.remember(page.items);
        this.loading.set(false);
      },
      error: (err) => {
        if (id !== this.requestId) return;
        this.listError.set(apiErrorMessage(err, 'The bestiary could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  private remember(items: readonly LwMonsterSummaryVm[]): void {
    this.knownNames.update((names) => {
      const next = { ...names };
      for (const m of items) next[m.key] = m.name;
      return next;
    });
  }
}
