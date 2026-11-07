import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../icon/icon.component';

export type LwModalSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Shared LoomWeaver dialog shell (backdrop, frame, movable/draggable header, scrollable body, footer).
 * Content projection slots:
 *  - `[modalHeader]`        identity / title block rendered left of the close button
 *  - `[modalHeaderActions]` optional controls rendered on the right side of the header before the close button
 *  - default                scrollable body
 *  - `[modalFooter]`        action row
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
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly ariaLabel = input<string>('Dialog');
  readonly closeLabel = input<string>('Close dialog');
  readonly closeOnBackdrop = input<boolean>(true);
  readonly draggable = input<boolean>(true);

  readonly closed = output<void>();

  readonly dragOffsetX = signal<number>(0);
  readonly dragOffsetY = signal<number>(0);
  readonly isDragging = signal<boolean>(false);

  private activePointerId: number | null = null;
  private dragStartPointerX = 0;
  private dragStartPointerY = 0;
  private dragStartOffsetX = 0;
  private dragStartOffsetY = 0;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.resetPosition();
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    if (this.closeOnBackdrop() && event.target === event.currentTarget) this.close();
  }

  onHeaderPointerDown(event: PointerEvent): void {
    if (!this.draggable()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [data-no-drag]')) {
      return;
    }
    this.activePointerId = event.pointerId;
    this.dragStartPointerX = event.clientX;
    this.dragStartPointerY = event.clientY;
    this.dragStartOffsetX = this.dragOffsetX();
    this.dragStartOffsetY = this.dragOffsetY();
    this.isDragging.set(true);
    try {
      (event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId);
    } catch {}
  }

  onHeaderPointerMove(event: PointerEvent): void {
    if (!this.isDragging() || event.pointerId !== this.activePointerId) return;
    const rawX = this.dragStartOffsetX + (event.clientX - this.dragStartPointerX);
    const rawY = this.dragStartOffsetY + (event.clientY - this.dragStartPointerY);
    const maxX = typeof window !== 'undefined' ? Math.max(80, window.innerWidth * 0.45) : 520;
    const maxY = typeof window !== 'undefined' ? Math.max(60, window.innerHeight * 0.42) : 420;
    this.dragOffsetX.set(Math.max(-maxX, Math.min(maxX, Math.round(rawX))));
    this.dragOffsetY.set(Math.max(-maxY, Math.min(maxY, Math.round(rawY))));
  }

  onHeaderPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    this.isDragging.set(false);
    this.activePointerId = null;
    try {
      (event.currentTarget as HTMLElement | null)?.releasePointerCapture(event.pointerId);
    } catch {}
  }

  resetPosition(): void {
    this.dragOffsetX.set(0);
    this.dragOffsetY.set(0);
    this.isDragging.set(false);
    this.activePointerId = null;
  }

  close(): void {
    this.resetPosition();
    this.open.set(false);
    this.closed.emit();
  }
}
