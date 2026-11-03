import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { FullscreenDiceOverlayService } from '../../../features/dice/engine/fullscreen-dice-overlay.service';

@Component({
  selector: 'lw-fullscreen-dice-overlay',
  standalone: true,
  templateUrl: './fullscreen-dice-overlay.component.html',
  styleUrl: './fullscreen-dice-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwFullscreenDiceOverlayComponent implements AfterViewInit {
  readonly overlay = inject(FullscreenDiceOverlayService);
  private readonly diceCanvas = viewChild<ElementRef<HTMLCanvasElement>>('fullscreenDiceCanvas');

  constructor() {
    effect(() => {
      if (this.overlay.overlayPhase() === 'hidden' && typeof document !== 'undefined') {
        const canvasEl = this.diceCanvas()?.nativeElement;
        const active = document.activeElement as HTMLElement | null;
        if (active && (active === canvasEl || canvasEl?.parentElement?.contains(active))) {
          active.blur();
        }
      }
    });
  }

  ngAfterViewInit(): void {
    const canvasEl = this.diceCanvas()?.nativeElement;
    if (canvasEl) {
      this.overlay.registerOverlayCanvas(canvasEl);
    }
  }

  onBackdropClick(): void {
    const phase = this.overlay.overlayPhase();
    if (phase !== 'hidden') {
      this.overlay.clearResultsNow();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.overlay.overlayPhase() !== 'hidden') {
      this.overlay.clearResultsNow();
    }
  }
}
