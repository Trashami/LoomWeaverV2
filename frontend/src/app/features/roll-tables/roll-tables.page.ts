import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwBadgeComponent, LwIconComponent, LwModalComponent, LwPageHeaderComponent } from '../../shared/ui/public-api';
import { LwRollTableSummaryVm, RollTablesApiService } from './roll-tables-api.service';
import { LwCampaignRollTableVm, LwMerchantSummaryVm, MerchantsApiService } from '../merchants/merchants-api.service';

const PAGE_SIZE = 60;
type TableTab = 'all' | 'encounters' | 'sessions' | 'campaign' | 'merchants';

@Component({
  selector: 'lw-roll-tables-page',
  standalone: true,
  imports: [FormsModule, RouterLink, NgpButton, LwPageHeaderComponent, LwIconComponent, LwModalComponent],
  templateUrl: './roll-tables.page.html',
  styleUrl: './roll-tables.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RollTablesPageComponent {
  private readonly api = inject(RollTablesApiService);
  private readonly merchantApi = inject(MerchantsApiService);
  readonly store = inject(LoomWeaverStoreService);

  readonly search = signal('');
  readonly source = signal('');
  readonly tables = signal<readonly LwRollTableSummaryVm[]>([]);
  readonly campaignTables = signal<readonly LwCampaignRollTableVm[]>([]);
  readonly merchants = signal<readonly LwMerchantSummaryVm[]>([]);
  readonly activeTab = signal<TableTab>('all');
  readonly hasMore = signal(false);
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  // Attach modal state
  readonly attachModalOpen = signal(false);
  readonly selectedTableForAttach = signal<LwRollTableSummaryVm | null>(null);
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

  readonly activeCampaign = computed(() => this.store.activeCampaign());
  readonly isGm = computed(() => this.store.isGmForActiveCampaign() || this.store.viewerRole() === 'gm');
  readonly campaignSessions = computed(() => this.store.sessions());

  constructor() {
    this.load(true);
    this.loadCampaignAttachments();
  }

  load(reset: boolean): void {
    const offset = reset ? 0 : this.tables().length;
    this.loading.set(true);
    this.errorMessage.set('');
    this.api
      .listTables({
        search: this.search(),
        source: this.source(),
        limit: PAGE_SIZE,
        offset,
      })
      .subscribe({
        next: (res) => {
          this.tables.set(reset ? res.tables : [...this.tables(), ...res.tables]);
          this.hasMore.set(res.hasMore);
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set('Could not load roll tables.');
          this.loading.set(false);
        },
      });
  }

  loadCampaignAttachments(): void {
    const cid = this.store.activeCampaignId() || 1;
    this.merchantApi.listCampaignRollTables(cid).subscribe({
      next: (data) => this.campaignTables.set(data),
    });
    this.merchantApi.listMerchants(cid).subscribe({
      next: (data) => this.merchants.set(data),
    });
  }

  setTab(tab: TableTab): void {
    this.activeTab.set(tab);
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    this.load(true);
  }

  onSourceChange(value: string): void {
    this.source.set(value);
    this.load(true);
  }

  dieLabel(table: LwRollTableSummaryVm): string {
    return table.die?.expression ?? 'No die';
  }

  openAttachModal(table: LwRollTableSummaryVm, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedTableForAttach.set(table);
    this.attachTargetType.set('campaign');
    this.selectedSessionId.set(this.campaignSessions()[0]?.sessionId || '');
    this.selectedMerchantId.set(this.merchants()[0]?.id || null);
    this.attachNotes.set('');
    this.attachModalOpen.set(true);
  }

  confirmAttach(): void {
    const table = this.selectedTableForAttach();
    if (!table) return;

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
      encounterTitle = this.customEncounterName().trim() ||
        this.campaignEncounters().find((e) => e.id === encounterId)?.name || 'Battle Encounter';
    } else if (targetType === 'session') {
      sessionId = this.selectedSessionId();
      sessionTitle = this.campaignSessions().find((s) => s.sessionId === sessionId)?.title || 'Campaign Session';
    } else if (targetType === 'merchant') {
      merchantId = this.selectedMerchantId() ?? undefined;
      merchantName = this.merchants().find((m) => m.id === merchantId)?.storeName || 'Merchant Store';
    }

    this.merchantApi
      .attachRollTable(cid, {
        rollTableId: table.id,
        tableName: table.name,
        sourceBook: table.sourceBook ?? undefined,
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
          this.successMessage.set(`Attached "${table.name}" successfully!`);
          this.loadCampaignAttachments();
          setTimeout(() => this.successMessage.set(''), 4000);
        },
        error: () => {
          this.errorMessage.set('Could not attach roll table.');
        },
      });
  }

  removeAttachment(att: LwCampaignRollTableVm, event: Event): void {
    event.stopPropagation();
    const cid = this.store.activeCampaignId() || 1;
    this.merchantApi.removeRollTableAttachment(cid, att.id).subscribe({
      next: () => this.loadCampaignAttachments(),
      error: () => this.errorMessage.set('Could not remove attachment.'),
    });
  }
}
