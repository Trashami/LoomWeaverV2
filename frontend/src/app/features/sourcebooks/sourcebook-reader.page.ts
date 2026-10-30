import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { renderEntries } from './book-entry-html';
import {
  LwBookNodeVm,
  LwSourceDetailVm,
  SourceBookApiService,
} from './sourcebook-api.service';

@Component({
  selector: 'lw-sourcebook-reader-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sourcebook-reader.page.html',
  styleUrl: './sourcebook-reader.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceBookReaderPageComponent {
  private readonly api = inject(SourceBookApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly code = this.route.snapshot.paramMap.get('code') ?? '';

  readonly source = signal<LwSourceDetailVm | null>(null);
  readonly node = signal<LwBookNodeVm | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly sections = computed(() => this.source()?.sections ?? []);
  readonly title = computed(() => this.node()?.data_json?.name ?? this.node()?.name ?? '');
  readonly bodyHtml = computed(() => renderEntries(this.node()?.data_json?.entries ?? []));
  readonly prevSection = computed(() => {
    const index = this.sections().findIndex((s) => s.id === this.selectedId());
    return index > 0 ? this.sections()[index - 1] : null;
  });
  readonly nextSection = computed(() => {
    const index = this.sections().findIndex((s) => s.id === this.selectedId());
    return index >= 0 && index < this.sections().length - 1 ? this.sections()[index + 1] : null;
  });

  constructor() {
    this.api.getSource(this.code).subscribe({
      next: (detail) => {
        this.source.set(detail);
        if (!this.selectedId() && detail.sections.length) {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { section: detail.sections[0].id },
            replaceUrl: true,
          });
        }
      },
      error: () => this.errorMessage.set('Could not load this sourcebook.'),
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = Number(params.get('section'));
      if (Number.isFinite(id) && id > 0) {
        this.selectedId.set(id);
        this.loadNode(id);
      }
    });
  }

  private loadNode(id: number): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.api.getNode(this.code, id).subscribe({
      next: (node) => {
        this.node.set(node);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load this section.');
        this.loading.set(false);
      },
    });
  }
}
