import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../../../../shared/ui/public-api';
import {
  LwMerchantDetailVm,
  LwMerchantInventoryItemVm,
  LwMerchantNpcVm,
} from '../../merchants-api.service';

@Component({
  selector: 'lw-merchant-dm-panel',
  standalone: true,
  imports: [FormsModule, DecimalPipe, NgpButton, LwIconComponent],
  templateUrl: './merchant-dm-panel.component.html',
  styleUrl: './merchant-dm-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantDmPanelComponent {
  readonly merchant = input.required<LwMerchantDetailVm>();
  readonly parsedNpc = input<LwMerchantNpcVm | null>(null);
  readonly inventory = input.required<readonly LwMerchantInventoryItemVm[]>();
  readonly campaignTables = input.required<readonly { id: number; name: string }[]>();
  readonly merchantTypes = input.required<readonly string[]>();
  readonly actionBusy = input(false);

  readonly saveLocation = output<string>();
  readonly saveMerchantType = output<string>();
  readonly generateNpc = output<void>();
  readonly applyRollTable = output<{ tableId: number; clearExisting: boolean }>();
  readonly restockFromTable = output<boolean>();
  readonly openAddItemModal = output<void>();
  readonly deleteItem = output<LwMerchantInventoryItemVm>();

  readonly localLocation = signal('');
  readonly localType = signal('');
  readonly selectedTableId = signal<number | null>(null);
  readonly clearExisting = signal(false);

  ngOnInit(): void {
    this.localLocation.set(this.merchant().locationName);
    this.localType.set(this.merchant().merchantType || 'General Goods & Provisions');
    const tables = this.campaignTables();
    if (tables.length > 0) {
      this.selectedTableId.set(tables[0].id);
    }
  }

  onSaveLocation(): void {
    const val = this.localLocation().trim();
    if (val) this.saveLocation.emit(val);
  }

  onSaveType(): void {
    const val = this.localType().trim();
    if (val) this.saveMerchantType.emit(val);
  }

  onApplyTable(): void {
    const id = this.selectedTableId();
    if (id) {
      this.applyRollTable.emit({ tableId: id, clearExisting: this.clearExisting() });
    }
  }
}
