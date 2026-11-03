import {
  ChangeDetectionStrategy,
  Component,
  model,
  output,
} from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent, LwModalComponent } from '../../../../shared/ui/public-api';

@Component({
  selector: 'lw-merchant-choice-modal',
  standalone: true,
  imports: [NgpButton, LwIconComponent, LwModalComponent],
  templateUrl: './merchant-choice-modal.component.html',
  styleUrl: './merchant-choice-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MerchantChoiceModalComponent {
  readonly open = model.required<boolean>();

  readonly chooseRandom = output<void>();
  readonly chooseManual = output<void>();

  onSelectRandom(): void {
    this.open.set(false);
    this.chooseRandom.emit();
  }

  onSelectManual(): void {
    this.open.set(false);
    this.chooseManual.emit();
  }
}
