import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LwButtonComponent, LwMonsterCardComponent, LwMonsterSummaryVm, LwPanelComponent } from '../../../shared/ui/public-api';
import { BestiaryApiService } from '../services/bestiary-api.service';

@Component({
  selector: 'lw-monster-market', standalone: true,
  imports: [LwPanelComponent, LwButtonComponent, LwMonsterCardComponent],
  templateUrl: './monster-market.component.html', styleUrl: './monster-market.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonsterMarketComponent {
  private readonly api = inject(BestiaryApiService);
  private readonly router = inject(Router);
  readonly monsters = signal<readonly LwMonsterSummaryVm[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  constructor() { this.load(); }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.listMonsters({ search: '', type: 'all', source: 'community', crMin: null, crMax: null,
      sort: 'name', offset: this.monsters().length, limit: 24 }).subscribe({
      next: page => { this.monsters.update(rows => [...rows, ...page.items]); this.total.set(page.total); this.loading.set(false); },
      error: () => { this.error.set('Community monsters could not be loaded.'); this.loading.set(false); },
    });
  }
  open(key: string): void { void this.router.navigate(['/bestiary'], { queryParams: { monster: key } }); }
}
