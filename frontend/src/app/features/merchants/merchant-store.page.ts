import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../shared/ui/public-api';
import {
  LwCharacterInventoryItemVm,
  LwMerchantDetailVm,
  LwMerchantInventoryItemVm,
  LwMerchantTransactionVm,
  LwWalletVm,
  MerchantsApiService,
} from './merchants-api.service';
import { MerchantCheckoutModalsComponent } from './components/merchant-checkout-modals/merchant-checkout-modals.component';

type StoreTab = 'buy' | 'sell' | 'haggle' | 'ledger' | 'manage';
type ItemCategoryFilter = 'all' | 'weapon' | 'armor' | 'potion' | 'wondrous' | 'gear';

@Component({
  selector: 'lw-merchant-store-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    DatePipe,
    NgpButton,
    LwIconComponent,
    MerchantCheckoutModalsComponent,
  ],
  templateUrl: './merchant-store.page.html',
  styleUrl: './merchant-store.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantStorePageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(LoomWeaverStoreService);
  private readonly api = inject(MerchantsApiService);

  readonly merchant = signal<LwMerchantDetailVm | null>(null);
  readonly inventory = signal<readonly LwMerchantInventoryItemVm[]>([]);
  readonly transactions = signal<readonly LwMerchantTransactionVm[]>([]);
  readonly characterItems = signal<readonly LwCharacterInventoryItemVm[]>([]);
  readonly wallet = signal<LwWalletVm>({
    personalGoldGp: 150,
    personalSilverSp: 0,
    personalCopperCp: 0,
    partyGoldGp: 750,
    partySilverSp: 0,
    partyCopperCp: 0,
  });

  readonly loading = signal(false);
  readonly actionBusy = signal(false);
  readonly statusMessage = signal('');
  readonly errorMessage = signal('');
  readonly activeTab = signal<StoreTab>('buy');
  readonly categoryFilter = signal<ItemCategoryFilter>('all');
  readonly searchFilter = signal('');

  // Haggling
  readonly haggleDiscountPercent = signal(0);
  readonly haggleAttempted = signal(false);
  readonly haggleResultMessage = signal('');

  // Modals
  readonly buyModalOpen = signal(false);
  readonly selectedBuyItem = signal<LwMerchantInventoryItemVm | null>(null);
  readonly sellModalOpen = signal(false);
  readonly selectedSellItem = signal<LwCharacterInventoryItemVm | null>(null);
  readonly addItemModalOpen = signal(false);

  readonly isGmMode = signal(false);

  readonly activeCampaign = computed(() => this.store.activeCampaign());
  readonly isGm = computed(() => this.store.isGmForActiveCampaign() || this.store.viewerRole() === 'gm');
  readonly activeCharacterKey = computed(() => {
    const players = this.store.activeCampaignPlayers();
    return players.find((p) => p.assignedCharacterKey)?.assignedCharacterKey || 'char-dal';
  });

  readonly activeCharacterName = computed(() => {
    const key = this.activeCharacterKey();
    if (key.includes('fivi')) return 'Fivi';
    if (key.includes('kildrid')) return 'Kildrid';
    return 'Dallas (Dal)';
  });

  readonly filteredInventory = computed(() => {
    const list = this.inventory();
    const cat = this.categoryFilter();
    const q = this.searchFilter().toLowerCase().trim();

    return list.filter((i) => {
      if (cat !== 'all') {
        const type = i.itemType.toLowerCase();
        if (cat === 'weapon' && !type.includes('weapon')) return false;
        if (cat === 'armor' && !type.includes('armor') && !type.includes('shield')) return false;
        if (cat === 'potion' && !type.includes('potion')) return false;
        if (cat === 'wondrous' && !type.includes('wondrous') && !type.includes('ring')) return false;
        if (cat === 'gear' && !type.includes('gear') && !type.includes('tool')) return false;
      }
      if (q) {
        return (
          i.name.toLowerCase().includes(q) ||
          i.rarity.toLowerCase().includes(q) ||
          i.itemType.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  });

  constructor() {
    const merchantId = Number(this.route.snapshot.paramMap.get('id'));
    this.isGmMode.set(this.isGm());
    if (merchantId) this.loadStoreData(merchantId);
  }

  loadStoreData(merchantId: number): void {
    const cid = this.store.activeCampaignId() || 1;
    const ckey = this.activeCharacterKey();
    this.loading.set(true);

    this.api.getMerchant(cid, merchantId, ckey).subscribe({
      next: (m) => {
        this.merchant.set(m);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load merchant details.');
        this.loading.set(false);
      },
    });

    this.api.listInventory(cid, merchantId).subscribe({ next: (inv) => this.inventory.set(inv) });
    this.api.getWallet(cid, merchantId, ckey).subscribe({ next: (w) => this.wallet.set(w) });
    this.api.listTransactions(cid, merchantId).subscribe({ next: (txs) => this.transactions.set(txs) });
    this.api.getCharacterItems(cid, ckey).subscribe({ next: (items) => this.characterItems.set(items) });
  }

  setTab(tab: StoreTab): void {
    this.activeTab.set(tab);
    this.statusMessage.set('');
    this.errorMessage.set('');
  }

  effectivePrice(basePrice: number): number {
    const discount = this.haggleDiscountPercent();
    if (discount <= 0) return basePrice;
    return Math.max(1, Math.round(basePrice * (1 - discount / 100)));
  }

  openBuyModal(item: LwMerchantInventoryItemVm): void {
    this.selectedBuyItem.set(item);
    this.buyModalOpen.set(true);
  }

  onBuyConfirmed(payload: { item: LwMerchantInventoryItemVm; quantity: number; useParty: boolean }): void {
    const m = this.merchant();
    if (!m) return;

    this.actionBusy.set(true);
    const cid = this.store.activeCampaignId() || 1;

    this.api
      .buyItem(cid, m.id, {
        inventoryItemId: payload.item.id,
        quantity: payload.quantity,
        usePartyFunds: payload.useParty,
        characterKey: this.activeCharacterKey(),
        characterName: this.activeCharacterName(),
      })
      .subscribe({
        next: (res) => {
          this.actionBusy.set(false);
          this.buyModalOpen.set(false);
          this.statusMessage.set(res.message);
          if (res.wallet) this.wallet.set(res.wallet);
          this.loadStoreData(m.id);
        },
        error: (err) => {
          this.actionBusy.set(false);
          this.errorMessage.set(err.error?.message || 'Transaction could not be processed.');
        },
      });
  }

  openSellModal(item: LwCharacterInventoryItemVm): void {
    this.selectedSellItem.set(item);
    this.sellModalOpen.set(true);
  }

  onSellConfirmed(payload: { item: LwCharacterInventoryItemVm; quantity: number; depositParty: boolean }): void {
    const m = this.merchant();
    if (!m) return;

    this.actionBusy.set(true);
    const cid = this.store.activeCampaignId() || 1;

    this.api
      .sellItem(cid, m.id, {
        itemKey: payload.item.id,
        itemName: payload.item.name,
        itemType: payload.item.slot || 'Item',
        rarity: payload.item.rarity || 'common',
        description: payload.item.summary || '',
        baseValueGp: payload.item.valueGp || 20,
        quantity: payload.quantity,
        depositToParty: payload.depositParty,
        characterKey: this.activeCharacterKey(),
        characterName: this.activeCharacterName(),
      })
      .subscribe({
        next: (res) => {
          this.actionBusy.set(false);
          this.sellModalOpen.set(false);
          this.statusMessage.set(res.message);
          if (res.wallet) this.wallet.set(res.wallet);
          this.loadStoreData(m.id);
        },
        error: (err) => {
          this.actionBusy.set(false);
          this.errorMessage.set(err.error?.message || 'Could not sell item.');
        },
      });
  }

  attemptHaggle(): void {
    if (this.haggleAttempted()) return;

    const roll = Math.floor(Math.random() * 20) + 1;
    const bonus = 4;
    const total = roll + bonus;
    this.haggleAttempted.set(true);

    if (total >= 14) {
      this.haggleDiscountPercent.set(15);
      this.haggleResultMessage.set(
        `Persuasion check ${total} (d20:${roll} + 4). Success! The merchant is charmed and grants a 15% discount for this visit!`
      );
    } else if (total >= 10) {
      this.haggleDiscountPercent.set(10);
      this.haggleResultMessage.set(
        `Persuasion check ${total} (d20:${roll} + 4). Modest success! The merchant shaves 10% off your purchases.`
      );
    } else {
      this.haggleDiscountPercent.set(0);
      this.haggleResultMessage.set(
        `Persuasion check ${total} (d20:${roll} + 4). The merchant scoffs: "These prices are already rock-bottom, traveler!" No discount granted.`
      );
    }
  }

  restockStore(clear: boolean): void {
    const m = this.merchant();
    if (!m) return;

    this.actionBusy.set(true);
    const cid = this.store.activeCampaignId() || 1;

    this.api
      .restockFromTable(cid, m.id, { numberOfItems: 6, clearExisting: clear })
      .subscribe({
        next: (res) => {
          this.actionBusy.set(false);
          this.inventory.set(res.inventory);
          this.statusMessage.set(`Restocked ${res.itemsAdded} new items from ${m.rollTableName || '5e catalog'}!`);
        },
        error: () => {
          this.actionBusy.set(false);
          this.errorMessage.set('Could not restock store.');
        },
      });
  }

  openAddItemModal(): void {
    this.addItemModalOpen.set(true);
  }

  onItemAdded(payload: { name: string; itemType: string; rarity: string; description: string; price: number; quantity: number }): void {
    const m = this.merchant();
    if (!m) return;

    const cid = this.store.activeCampaignId() || 1;
    this.api
      .addInventoryItem(cid, m.id, {
        itemKey: `custom-${Guid()}`,
        name: payload.name,
        itemType: payload.itemType,
        rarity: payload.rarity,
        description: payload.description,
        baseValueGp: payload.price,
        priceGp: payload.price,
        quantity: payload.quantity,
        isFeatured: false,
      })
      .subscribe({
        next: () => {
          this.addItemModalOpen.set(false);
          this.loadStoreData(m.id);
        },
        error: () => this.errorMessage.set('Could not add item to store.'),
      });
  }

  deleteItem(item: LwMerchantInventoryItemVm): void {
    const m = this.merchant();
    if (!m || !confirm(`Remove ${item.name} from inventory?`)) return;

    const cid = this.store.activeCampaignId() || 1;
    this.api.deleteInventoryItem(cid, m.id, item.id).subscribe({
      next: () => this.loadStoreData(m.id),
      error: () => this.errorMessage.set('Could not remove item.'),
    });
  }
}

function Guid(): string {
  return Math.random().toString(36).substring(2, 10);
}
