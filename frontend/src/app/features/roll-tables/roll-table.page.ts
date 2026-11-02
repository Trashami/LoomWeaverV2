import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwBadgeComponent, LwIconComponent, LwPageHeaderComponent } from '../../shared/ui/public-api';
import { LwModalComponent } from '../../shared/ui/modal/modal.component';
import { FullscreenDiceOverlayService } from '../dice/engine/fullscreen-dice-overlay.service';
import type { FullscreenDieEntry } from '../dice/engine/fullscreen-dice-overlay.service';
import type { DicePolyhedronType } from '../dice/engine/models/dice-model.types';
import {
  LwRollDieVm,
  LwRollTableDetailVm,
  LwRollTableRowVm,
  RollTablesApiService,
} from './roll-tables-api.service';
import {
  LwMerchantSummaryVm,
  MerchantsApiService,
} from '../merchants/merchants-api.service';

const SUPPORTED_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

@Component({
  selector: 'lw-roll-table-page',
  standalone: true,
  imports: [FormsModule, RouterLink, NgpButton, LwPageHeaderComponent, LwModalComponent, LwIconComponent],
  templateUrl: './roll-table.page.html',
  styleUrl: './roll-table.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RollTablePageComponent {
  private readonly api = inject(RollTablesApiService);
  private readonly merchantApi = inject(MerchantsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly overlay = inject(FullscreenDiceOverlayService);
  readonly store = inject(LoomWeaverStoreService);

  readonly table = signal<LwRollTableDetailVm | null>(null);
  readonly merchants = signal<readonly LwMerchantSummaryVm[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly rolling = signal(false);
  readonly lastTotal = signal<number | null>(null);
  readonly matchedRow = signal<LwRollTableRowVm | null>(null);
  readonly modalOpen = signal(false);

  // Attach modal state
  readonly attachModalOpen = signal(false);
  readonly attachTargetType = signal<'campaign' | 'session' | 'merchant'>('merchant');
  readonly selectedSessionId = signal('');
  readonly selectedMerchantId = signal<number | null>(null);
  readonly attachNotes = signal('');

  readonly isGm = computed(() => this.store.isGmForActiveCampaign() || this.store.viewerRole() === 'gm');
  readonly campaignSessions = computed(() => this.store.sessions());

  readonly die = computed<LwRollDieVm | null>(() => {
    const d = this.table()?.die;
    if (!d || !SUPPORTED_SIDES.has(d.sides) || d.count < 1) return null;
    return d;
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.errorMessage.set('Roll table not found.');
      return;
    }
    this.loading.set(true);
    this.api.getTable(id).subscribe({
      next: (detail) => {
        this.table.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load this roll table.');
        this.loading.set(false);
      },
    });

    const cid = this.store.activeCampaignId() || 1;
    this.merchantApi.listMerchants(cid).subscribe({
      next: (data) => {
        this.merchants.set(data);
        if (data.length > 0) this.selectedMerchantId.set(data[0].id);
      },
    });
  }

  roll(): void {
    const t = this.table();
    const d = this.die();
    if (!t || !d || this.rolling()) return;

    const dieType = `d${d.sides}` as DicePolyhedronType;
    const values = Array.from({ length: d.count }, () => 1 + Math.floor(Math.random() * d.sides));
    const entries: FullscreenDieEntry[] = values.map((value) => ({ dieType, value }));
    const total = values.reduce((sum, v) => sum + v, 0);

    this.rolling.set(true);
    this.lastTotal.set(total);
    this.overlay.triggerFullScreenRoll({
      label: t.name,
      expression: d.expression,
      diceValues: values,
      diceEntries: entries,
      total,
      onComplete: () => {
        this.rolling.set(false);
        this.matchedRow.set(this.findRow(t.rows, total));
        this.modalOpen.set(true);
      },
    });
  }

  openAttachModal(): void {
    this.selectedSessionId.set(this.campaignSessions()[0]?.sessionId || '');
    this.attachNotes.set('');
    this.attachModalOpen.set(true);
  }

  confirmAttach(): void {
    const t = this.table();
    if (!t) return;

    const cid = this.store.activeCampaignId() || 1;
    const targetType = this.attachTargetType();

    let sessionId: string | undefined;
    let sessionTitle: string | undefined;
    let merchantId: number | undefined;
    let merchantName: string | undefined;

    if (targetType === 'session') {
      sessionId = this.selectedSessionId();
      sessionTitle = this.campaignSessions().find((s) => s.sessionId === sessionId)?.title || 'Campaign Session';
    } else if (targetType === 'merchant') {
      merchantId = this.selectedMerchantId() ?? undefined;
      merchantName = this.merchants().find((m) => m.id === merchantId)?.storeName || 'Merchant Store';
    }

    this.merchantApi
      .attachRollTable(cid, {
        rollTableId: t.id,
        tableName: t.name,
        sourceBook: t.sourceBook ?? undefined,
        sessionId,
        sessionTitle,
        merchantId,
        merchantName,
        notes: this.attachNotes(),
      })
      .subscribe({
        next: () => {
          this.attachModalOpen.set(false);
          this.successMessage.set(`Successfully attached table to ${targetType}!`);
          setTimeout(() => this.successMessage.set(''), 4000);
        },
        error: () => this.errorMessage.set('Could not attach roll table.'),
      });
  }

  findRow(rows: readonly LwRollTableRowVm[], total: number): LwRollTableRowVm | null {
    return rows.find((r) => r.min != null && r.max != null && total >= r.min && total <= r.max) ?? null;
  }

  cellLabel(index: number): string {
    return this.table()?.colLabels[index] ?? '';
  }
}
