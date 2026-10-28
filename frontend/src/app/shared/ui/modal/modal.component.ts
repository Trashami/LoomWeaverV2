import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  input,
  model,
  output,
} from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../icon/icon.component';

export type LwModalSize = 'sm' | 'md' | 'lg';

/**
 * Shared LoomWeaver dialog shell (backdrop, frame, header, scrollable body, footer).
 * Content projection slots:
 *  - `[modalHeader]`  identity / title block rendered left of the close button
 *  - default          scrollable body
 *  - `[modalFooter]`  action row
 */
@Component({
  selector: 'lw-modal',
  standalone: true,
  imports: [A11yModule, NgpButton, LwIconComponent],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwModalComponent {
  readonly open = model<boolean>(false);
  readonly size = input<LwModalSize>('md');
  readonly ariaLabel = input<string>('Dialog');
  readonly closeLabel = input<string>('Close dialog');
  readonly closeOnBackdrop = input<boolean>(true);

  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.closeOnBackdrop() && event.target === event.currentTarget) this.close();
  }

  close(): void {
    this.open.set(false);
    this.closed.emit();
  }
}
