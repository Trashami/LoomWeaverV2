import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwIconComponent, LwPageHeaderComponent } from '../../shared/ui/public-api';
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
  LwCampaignRollTableVm,
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
  readonly tableAttachments = signal<readonly LwCampaignRollTableVm[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly rolling = signal(false);
  readonly lastTotal = signal<number | null>(null);
  readonly matchedRow = signal<LwRollTableRowVm | null>(null);
  readonly modalOpen = signal(false);
  readonly lootActionFeedback = signal('');
  readonly searchFilter = signal('');

  // Attach modal state
  readonly attachModalOpen = signal(false);
  readonly attachTargetType = signal<'campaign' | 'encounter' | 'session' | 'merchant'>('encounter');
  readonly selectedSessionId = signal('');
  readonly selectedEncounterId = signal('enc-goblin-ambush');
  readonly customEncounterName = signal('');
  readonly selectedMerchantId = signal<number | null>(null);
  readonly attachNotes = signal('');

  readonly campaignEncounters = signal<Array<{ id: string; name: string }>>([
    { id: 'enc-goblin-ambush', name: 'Goblin Ambush & Roadblock' },
    { id: 'enc-crypt-guardian', name: 'Crypt Guardian & Sarcophagus' },
    { id: 'enc-bandit-camp', name: 'Bandit Lair & Supply Chest' },
    { id: 'enc-dragon-hoard', name: 'Dragon Cult Hoard' },
  ]);

  readonly isGm = computed(() => this.store.isGmForActiveCampaign() || this.store.viewerRole() === 'gm');
  readonly campaignSessions = computed(() => this.store.sessions());

  readonly die = computed<LwRollDieVm | null>(() => {
    const d = this.table()?.die;
    if (!d || !SUPPORTED_SIDES.has(d.sides) || d.count < 1) return null;
    return d;
  });

  readonly filteredRows = computed(() => {
    const t = this.table();
    if (!t) return [];
    const q = this.searchFilter().trim().toLowerCase();
    if (!q) return t.rows;
    return t.rows.filter(
      (r) =>
        r.rangeLabel.toLowerCase().includes(q) ||
        r.cells.some((c) => c.toLowerCase().includes(q))
    );
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
        this.loadAttachments(id);
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

  loadAttachments(rollTableId: number): void {
    const cid = this.store.activeCampaignId() || 1;
    this.merchantApi.listCampaignRollTables(cid).subscribe({
      next: (all) => {
        this.tableAttachments.set(all.filter((a) => a.rollTableId === rollTableId));
      },
    });
  }

  roll(): void {
    const t = this.table();
    if (!t || this.rolling() || t.rows.length === 0) return;

    const d = this.die();

    if (d) {
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
    } else {
      // For tables without single dice expression (e.g. creature sizes, custom rows)
      this.rolling.set(true);
      const randomIndex = Math.floor(Math.random() * t.rows.length);
      const row = t.rows[randomIndex];
      const rollNumber = randomIndex + 1;

      setTimeout(() => {
        this.rolling.set(false);
        this.lastTotal.set(rollNumber);
        this.matchedRow.set(row);
        this.modalOpen.set(true);
      }, 350);
    }
  }

  openAttachModal(targetType?: 'campaign' | 'encounter' | 'session' | 'merchant'): void {
    if (targetType) this.attachTargetType.set(targetType);
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
    let encounterId: string | undefined;
    let encounterTitle: string | undefined;
    let merchantId: number | undefined;
    let merchantName: string | undefined;

    if (targetType === 'encounter') {
      encounterId = this.selectedEncounterId();
      encounterTitle =
        this.customEncounterName().trim() ||
        this.campaignEncounters().find((e) => e.id === encounterId)?.name ||
        'Battle Encounter';
    } else if (targetType === 'session') {
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
        encounterId,
        encounterTitle,
        merchantId,
        merchantName,
        notes: this.attachNotes(),
      })
      .subscribe({
        next: () => {
          this.attachModalOpen.set(false);
          this.successMessage.set(`Successfully attached table to ${targetType}!`);
          this.loadAttachments(t.id);
          setTimeout(() => this.successMessage.set(''), 4000);
        },
        error: () => this.errorMessage.set('Could not attach roll table.'),
      });
  }

  removeAttachment(attId: number, event: Event): void {
    event.stopPropagation();
    const t = this.table();
    if (!t) return;
    const cid = this.store.activeCampaignId() || 1;
    this.merchantApi.removeRollTableAttachment(cid, attId).subscribe({
      next: () => this.loadAttachments(t.id),
      error: () => this.errorMessage.set('Could not remove attachment.'),
    });
  }

  awardLoot(row: LwRollTableRowVm): void {
    const lootText = row.cells.join(' — ');
    this.lootActionFeedback.set(`Loot awarded to campaign: "${lootText}"`);
    setTimeout(() => this.lootActionFeedback.set(''), 4000);
  }

  copyLootOutcome(row: LwRollTableRowVm): void {
    const lootText = `${row.rangeLabel}: ${row.cells.join(' — ')}`;
    void navigator.clipboard.writeText(lootText);
    this.lootActionFeedback.set('Loot copied to clipboard!');
    setTimeout(() => this.lootActionFeedback.set(''), 3000);
  }

  findRow(rows: readonly LwRollTableRowVm[], total: number): LwRollTableRowVm | null {
    return rows.find((r) => r.min != null && r.max != null && total >= r.min && total <= r.max) ?? null;
  }

  cellLabel(index: number): string {
    return this.table()?.colLabels[index] ?? '';
  }
}
