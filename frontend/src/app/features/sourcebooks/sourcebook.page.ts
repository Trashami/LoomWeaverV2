import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import {
  LwSourceDetailVm,
  LwSourceSummaryVm,
  SourceBookApiService,
} from './sourcebook-api.service';

@Component({
  selector: 'lw-sourcebook-page',
  standalone: true,
  imports: [FormsModule, RouterLink, NgpButton],
  templateUrl: './sourcebook.page.html',
  styleUrl: './sourcebook.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceBookPageComponent {
  private readonly api = inject(SourceBookApiService);
  private readonly route = inject(ActivatedRoute);

  readonly code = this.route.snapshot.paramMap.get('code');

  readonly search = signal('');
  readonly sources = signal<readonly LwSourceSummaryVm[]>([]);
  readonly source = signal<LwSourceDetailVm | null>(null);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    if (this.code) {
      this.loadSource(this.code);
    } else {
      this.loadList();
    }
  }

  loadList(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.api.listSources(this.search()).subscribe({
      next: (res) => {
        this.sources.set(res.sources);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load sourcebooks.');
        this.loading.set(false);
      },
    });
  }

  loadSource(code: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.api.getSource(code).subscribe({
      next: (detail) => {
        this.source.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load this sourcebook.');
        this.loading.set(false);
      },
    });
  }
}
