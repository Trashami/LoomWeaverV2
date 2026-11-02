import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwModalComponent } from '../../../../shared/ui/public-api';
import {
  LwCharacterInventoryItemVm,
  LwMerchantDetailVm,
  LwMerchantInventoryItemVm,
  LwWalletVm,
} from '../../merchants-api.service';

@Component({
  selector: 'lw-merchant-checkout-modals',
  standalone: true,
  imports: [DecimalPipe, FormsModule, NgpButton, LwModalComponent],
  templateUrl: './merchant-checkout-modals.component.html',
  styleUrl: './merchant-checkout-modals.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantCheckoutModalsComponent {
  readonly merchant = input.required<LwMerchantDetailVm>();
  readonly wallet = input.required<LwWalletVm>();
  readonly actionBusy = input<boolean>(false);
  readonly discountPercent = input<number>(0);

  // Buy modal
  readonly buyModalOpen = model<boolean>(false);
  readonly selectedBuyItem = model<LwMerchantInventoryItemVm | null>(null);
  readonly buyQuantity = signal(1);
  readonly buyWithPartyFunds = signal(false);
  readonly buyConfirmed = output<{
    item: LwMerchantInventoryItemVm;
    quantity: number;
    useParty: boolean;
  }>();

  // Sell modal
  readonly sellModalOpen = model<boolean>(false);
  readonly selectedSellItem = model<LwCharacterInventoryItemVm | null>(null);
  readonly sellQuantity = signal(1);
  readonly sellDepositParty = signal(false);
  readonly sellConfirmed = output<{
    item: LwCharacterInventoryItemVm;
    quantity: number;
    depositParty: boolean;
  }>();

  // Add custom item modal
  readonly addItemModalOpen = model<boolean>(false);
  readonly newItemName = signal('');
  readonly newItemType = signal('Adventuring Gear');
  readonly newItemRarity = signal('common');
  readonly newItemDesc = signal('');
  readonly newItemPrice = signal(25);
  readonly newItemQty = signal(2);
  readonly itemAdded = output<{
    name: string;
    itemType: string;
    rarity: string;
    description: string;
    price: number;
    quantity: number;
  }>();

  effectivePrice(base: number): number {
    const disc = this.discountPercent();
    if (disc <= 0) return base;
    return Math.max(1, Math.round(base * (1 - disc / 100)));
  }

  onConfirmBuy(): void {
    const item = this.selectedBuyItem();
    if (!item) return;
    this.buyConfirmed.emit({
      item,
      quantity: this.buyQuantity(),
      useParty: this.buyWithPartyFunds(),
    });
  }

  onConfirmSell(): void {
    const item = this.selectedSellItem();
    if (!item) return;
    this.sellConfirmed.emit({
      item,
      quantity: this.sellQuantity(),
      depositParty: this.sellDepositParty(),
    });
  }

  onSubmitAddItem(): void {
    if (!this.newItemName().trim()) return;
    this.itemAdded.emit({
      name: this.newItemName().trim(),
      itemType: this.newItemType(),
      rarity: this.newItemRarity(),
      description: this.newItemDesc().trim(),
      price: this.newItemPrice(),
      quantity: this.newItemQty(),
    });
  }
}
