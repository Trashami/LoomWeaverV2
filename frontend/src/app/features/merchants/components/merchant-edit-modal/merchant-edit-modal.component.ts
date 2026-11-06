import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent, LwModalComponent } from '../../../../shared/ui/public-api';
import { LwMerchantDetailVm, LwMerchantSummaryVm } from '../../merchants-api.service';
import {
  PRESET_MERCHANT_AVATARS,
  PresetMerchantAvatar,
  getMerchantTypeIcon,
} from '../../merchant-generator.helpers';
import { MERCHANT_TYPES_CATALOG } from '../../merchant-haggle.helpers';

@Component({
  selector: 'lw-merchant-edit-modal',
  standalone: true,
  imports: [FormsModule, NgpButton, LwModalComponent, LwIconComponent],
  templateUrl: './merchant-edit-modal.component.html',
  styleUrl: './merchant-edit-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantEditModalComponent {
  readonly open = model<boolean>(false);
  readonly merchant = input<LwMerchantSummaryVm | null>(null);
  readonly campaignLocations = input<readonly string[]>([]);
  readonly campaignNpcs = input<readonly string[]>([]);
  readonly campaignTables = input<readonly { id: number; name: string }[]>([]);
  readonly saving = input<boolean>(false);

  readonly saveMerchant = output<Partial<LwMerchantDetailVm>>();

  readonly merchantTypes = MERCHANT_TYPES_CATALOG;
  readonly presetAvatars = PRESET_MERCHANT_AVATARS;

  readonly storeName = signal('');
  readonly merchantType = signal('General Goods & Provisions');
  readonly merchantName = signal('');
  readonly locationName = signal('');
  readonly tagline = signal('');
  readonly description = signal('');
  readonly greeting = signal('');
  readonly imageUrl = signal('');
  readonly markupPercent = signal(100);
  readonly buyRatePercent = signal(50);
  readonly rollTableId = signal<number | null>(null);
  readonly rollTableName = signal('');

  constructor() {
    effect(() => {
      const m = this.merchant();
      if (!m) return;
      this.storeName.set(m.storeName || '');
      this.merchantType.set(m.merchantType || 'General Goods & Provisions');
      this.merchantName.set(m.merchantName || '');
      this.locationName.set(m.locationName || '');
      this.tagline.set(m.tagline || '');
      this.imageUrl.set(m.imageUrl || '');
      this.rollTableId.set(m.rollTableId ?? null);
      this.rollTableName.set(m.rollTableName || '');
      this.description.set(`A reputable ${m.merchantType || 'store'} in ${m.locationName || 'town'}.`);
      this.greeting.set(`Welcome to ${m.storeName}! How may I assist your expedition?`);
    });
  }

  selectPreset(preset: PresetMerchantAvatar): void {
    this.imageUrl.set(preset.imageUrl);
  }

  getTypeIcon(): string {
    return getMerchantTypeIcon(this.merchantType());
  }

  onTableChange(tableIdStr: string): void {
    const tid = Number(tableIdStr);
    if (!tid) {
      this.rollTableId.set(null);
      this.rollTableName.set('');
      return;
    }
    const found = this.campaignTables().find((t) => t.id === tid);
    this.rollTableId.set(tid);
    this.rollTableName.set(found ? found.name : '');
  }

  close(): void {
    this.open.set(false);
  }

  onSubmit(): void {
    if (!this.storeName().trim()) return;
    this.saveMerchant.emit({
      storeName: this.storeName().trim(),
      merchantType: this.merchantType(),
      merchantName: this.merchantName().trim(),
      locationName: this.locationName().trim(),
      tagline: this.tagline().trim(),
      description: this.description().trim(),
      greeting: this.greeting().trim(),
      imageUrl: this.imageUrl().trim(),
      markupPercent: this.markupPercent(),
      buyRatePercent: this.buyRatePercent(),
      rollTableId: this.rollTableId(),
      rollTableName: this.rollTableName(),
    });
  }
}
