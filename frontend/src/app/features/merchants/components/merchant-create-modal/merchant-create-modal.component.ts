import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent, LwModalComponent } from '../../../../shared/ui/public-api';
import { MERCHANT_TYPES_CATALOG } from '../../merchant-haggle.helpers';

@Component({
  selector: 'lw-merchant-create-modal',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent, LwModalComponent],
  templateUrl: './merchant-create-modal.component.html',
  styleUrl: './merchant-create-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantCreateModalComponent {
  readonly open = model.required<boolean>();
  readonly campaignLocations = input<readonly string[]>([]);
  readonly campaignNpcs = input<readonly string[]>([]);
  readonly currentLocation = input<string>('Vandia Harbor');
  readonly creating = input<boolean>(false);

  readonly createMerchant = output<{
    storeName: string;
    merchantName: string;
    merchantType: string;
    locationName: string;
    tagline: string;
    description: string;
    greeting: string;
    buyRatePercent: number;
    markupPercent: number;
  }>();

  readonly merchantTypes = MERCHANT_TYPES_CATALOG;

  readonly storeName = signal('');
  readonly merchantType = signal('General Goods & Provisions');
  readonly locationName = signal('');
  readonly merchantName = signal('');
  readonly tagline = signal('');
  readonly description = signal('');
  readonly greeting = signal('Welcome! Look around, tell me what catches your eye.');
  readonly buyRate = signal(50);
  readonly markup = signal(100);

  ngOnInit(): void {
    this.resetForm();
  }

  resetForm(): void {
    this.storeName.set('');
    this.merchantType.set('General Goods & Provisions');
    this.locationName.set(this.currentLocation() || 'Vandia Harbor');
    this.merchantName.set(this.campaignNpcs()[0] || 'Shopkeeper');
    this.tagline.set('');
    this.description.set('');
    this.greeting.set('Welcome! Look around, tell me what catches your eye.');
    this.buyRate.set(50);
    this.markup.set(100);
  }

  onSubmit(): void {
    if (!this.storeName().trim()) return;

    this.createMerchant.emit({
      storeName: this.storeName().trim(),
      merchantName: this.merchantName().trim() || 'Shopkeeper',
      merchantType: this.merchantType(),
      locationName: this.locationName().trim() || this.currentLocation(),
      tagline: this.tagline().trim(),
      description: this.description().trim(),
      greeting: this.greeting().trim(),
      buyRatePercent: this.buyRate(),
      markupPercent: this.markup(),
    });
  }

  close(): void {
    this.open.set(false);
  }
}
