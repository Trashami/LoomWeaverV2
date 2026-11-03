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
import {
  GeneratedMerchantPreview,
  generateRandomMerchantPreview,
} from '../../merchant-generator.helpers';

@Component({
  selector: 'lw-merchant-random-modal',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent, LwModalComponent],
  templateUrl: './merchant-random-modal.component.html',
  styleUrl: './merchant-random-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantRandomModalComponent {
  readonly open = model.required<boolean>();
  readonly campaignLocations = input<readonly string[]>([]);
  readonly currentLocation = input<string>('Vandia Harbor');
  readonly generating = input<boolean>(false);

  readonly confirmGeneration = output<{
    merchantType: string;
    storeName: string;
    merchantName: string;
    locationName: string;
    populateInventory: boolean;
  }>();

  readonly merchantTypes = MERCHANT_TYPES_CATALOG;
  readonly selectedType = signal<string>('random');
  readonly selectedLocation = signal<string>('');
  readonly populateInventory = signal<boolean>(true);

  readonly preview = signal<GeneratedMerchantPreview>(generateRandomMerchantPreview());

  ngOnInit(): void {
    const loc = this.currentLocation() || 'Vandia Harbor';
    this.selectedLocation.set(loc);
    this.rollNewPreview();
  }

  rollNewPreview(): void {
    const type = this.selectedType();
    const loc = this.selectedLocation() || this.currentLocation();
    this.preview.set(generateRandomMerchantPreview(type, loc));
  }

  onTypeChange(type: string): void {
    this.selectedType.set(type);
    this.rollNewPreview();
  }

  onLocationChange(loc: string): void {
    this.selectedLocation.set(loc);
    const curr = this.preview();
    this.preview.set({ ...curr, locationName: loc });
  }

  onConfirm(): void {
    const p = this.preview();
    this.confirmGeneration.emit({
      merchantType: p.merchantType,
      storeName: p.storeName,
      merchantName: p.npcName,
      locationName: p.locationName,
      populateInventory: this.populateInventory(),
    });
  }

  close(): void {
    this.open.set(false);
  }
}
