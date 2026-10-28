import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import { LwIconComponent } from '../icon/icon.component';

@Component({
  selector: 'lw-alertify-toast-stack',
  standalone: true,
  imports: [LwIconComponent],
  template: `
    @if (alertify.toasts().length > 0) {
      <div class="ajs-notifier ajs-bottom ajs-right lw-alertify-stack" role="region" aria-label="Dice Roll & Table Notifications">
        @for (toast of alertify.toasts(); track toast.id) {
          <article
            class="ajs-message ajs-visible lw-alertify-card"
            [class.lw-alertify-card--gold]="toast.tone === 'gold'"
            [class.lw-alertify-card--crimson]="toast.tone === 'crimson'"
            (click)="alertify.dismiss(toast.id)"
            title="Click to dismiss notification"
          >
            <div class="lw-alertify-card__main">
              <div class="lw-alertify-card__left">
                <div class="lw-alertify-card__head">
                  <span class="lw-alertify-card__who">
                    <lw-icon name="casino" [size]="14" />
                    {{ toast.whoRolled }}
                  </span>
                  <span class="lw-alertify-card__type">{{ toast.rollType }}</span>
                </div>

                @if (toast.kind === 'roll') {
                  <div class="lw-alertify-card__breakdown">
                    <span class="lw-alertify-pill lw-alertify-pill--natural" [class.is-crit]="toast.isNat20" [class.is-fail]="toast.isCritFail">
                      {{ toast.naturalRollLabel }}
                    </span>
                    @if (toast.modifiersBreakdown && !toast.modifiersBreakdown.startsWith('+0')) {
                    <span class="lw-alertify-pill lw-alertify-pill--mods">
                      Modifiers: <strong>{{ toast.modifiersBreakdown }}</strong>
                    </span>
                    }
                  </div>
                  <div class="lw-alertify-card__equation">
                    <span>Formula: <strong>{{ toast.formula }}</strong></span>
                    @if (toast.outcomeSubtext) {
                      <span class="lw-alertify-card__outcome">{{ toast.outcomeSubtext }}</span>
                    }
                  </div>
                } @else {
                  <p class="lw-alertify-card__status-text">{{ toast.naturalRollLabel }}</p>
                }
              </div>

              @if (toast.adjustedTotal !== null) {
                <div class="lw-alertify-card__total-box" [class.is-crit]="toast.isNat20" [class.is-fail]="toast.isCritFail">
                  <span class="lw-alertify-card__total-lbl">ADJUSTED</span>
                  <strong class="lw-alertify-card__total-val">{{ toast.adjustedTotal }}</strong>
                  <span class="lw-alertify-card__total-sub">TOTAL</span>
                </div>
              }

              <button
                type="button"
                class="lw-alertify-card__close"
                (click)="$event.stopPropagation(); alertify.dismiss(toast.id)"
                aria-label="Close Roll Notification"
              >
                <lw-icon name="close" [size]="13" />
              </button>
            </div>
            <div class="lw-alertify-card__timer" [style.animation-duration.ms]="toast.durationMs"></div>
          </article>
        }
      </div>
    }
  `,
  styles: [
    `
      .lw-alertify-stack {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 100001;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        width: min(320px, calc(100vw - 2rem));
        pointer-events: none;
      }

      .lw-alertify-card {
        pointer-events: auto;
        position: relative;
        overflow: hidden;
        background: linear-gradient(145deg, rgba(6, 22, 16, 0.97), rgba(4, 13, 10, 0.98));
        border: 1px solid rgba(73, 232, 146, 0.45);
        border-left: 4px solid #49e892;
        border-radius: 0.7rem;
        box-shadow:
          0 16px 38px rgba(0, 0, 0, 0.78),
          0 0 22px rgba(73, 232, 146, 0.16);
        padding: 0.5rem 0.6rem;
        color: #ecfdf5;
        cursor: pointer;
        animation: lwAlertifyPopIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .lw-alertify-card--gold {
        border-color: rgba(217, 183, 122, 0.65);
        border-left-color: #f3d28f;
        box-shadow:
          0 16px 38px rgba(0, 0, 0, 0.82),
          0 0 26px rgba(217, 183, 122, 0.28);
      }

      .lw-alertify-card--crimson {
        border-color: rgba(248, 113, 113, 0.6);
        border-left-color: #f87171;
      }

      .lw-alertify-card__main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.65rem;
      }

      .lw-alertify-card__left {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.32rem;
      }

      .lw-alertify-card__head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.42rem;
      }

      .lw-alertify-card__who {
        display: inline-flex;
        align-items: center;
        gap: 0.28rem;
        font-family: 'Cinzel', serif;
        font-size: 0.84rem;
        font-weight: 700;
        color: #f3d28f;
        letter-spacing: 0.03em;
      }

      .lw-alertify-card__type {
        padding: 0.1rem 0.46rem;
        border-radius: 999px;
        background: rgba(73, 232, 146, 0.14);
        border: 1px solid rgba(73, 232, 146, 0.35);
        color: #6ef7ac;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.03em;
      }

      .lw-alertify-card__breakdown {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem;
      }

      .lw-alertify-pill {
        padding: 0.14rem 0.46rem;
        border-radius: 0.35rem;
        font-size: 0.72rem;
        background: rgba(11, 33, 24, 0.88);
        border: 1px solid rgba(73, 232, 146, 0.24);
        color: #d1fae5;
      }

      .lw-alertify-pill--natural {
        font-weight: 700;
        color: #49e892;
      }

      .lw-alertify-pill--natural.is-crit {
        background: rgba(217, 183, 122, 0.22);
        border-color: rgba(243, 210, 143, 0.65);
        color: #fde68a;
      }

      .lw-alertify-pill--natural.is-fail {
        background: rgba(185, 28, 28, 0.25);
        border-color: rgba(248, 113, 113, 0.6);
        color: #fca5a5;
      }

      .lw-alertify-pill--mods strong {
        color: #f3d28f;
      }

      .lw-alertify-card__equation {
        display: flex;
        flex-direction: column;
        gap: 0.12rem;
        font-size: 0.7rem;
        color: #9ec5b2;
      }

      .lw-alertify-card__equation strong {
        color: #ecfdf5;
      }

      .lw-alertify-card__outcome {
        color: #6ef7ac;
        font-weight: 600;
      }

      .lw-alertify-card__status-text {
        margin: 0;
        font-size: 0.76rem;
        color: #d1fae5;
        line-height: 1.35;
      }

      .lw-alertify-card__total-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 42px;
        padding: 0.32rem 0.5rem;
        border-radius: 0.55rem;
        background: rgba(73, 232, 146, 0.14);
        border: 1px solid rgba(73, 232, 146, 0.48);
        text-align: center;
      }

      .lw-alertify-card__total-box.is-crit {
        background: rgba(217, 183, 122, 0.22);
        border-color: #f3d28f;
      }

      .lw-alertify-card__total-box.is-fail {
        background: rgba(185, 28, 28, 0.24);
        border-color: #f87171;
      }

      .lw-alertify-card__total-lbl,
      .lw-alertify-card__total-sub {
        font-size: 0.54rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: #9ec5b2;
      }

      .lw-alertify-card__total-val {
        font-family: 'Cinzel', serif;
        font-size: 1.32rem;
        font-weight: 800;
        line-height: 1.05;
        color: #49e892;
      }

      .lw-alertify-card__total-box.is-crit .lw-alertify-card__total-val {
        color: #fde68a;
      }

      .lw-alertify-card__total-box.is-fail .lw-alertify-card__total-val {
        color: #fca5a5;
      }

      .lw-alertify-card__close {
        align-self: flex-start;
        width: 22px;
        height: 22px;
        border-radius: 0.35rem;
        border: 1px solid rgba(73, 232, 146, 0.25);
        background: rgba(7, 24, 18, 0.85);
        color: #9ec5b2;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .lw-alertify-card__close:hover {
        border-color: #f3d28f;
        color: #f3d28f;
      }

      .lw-alertify-card__timer {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 3px;
        width: 100%;
        background: linear-gradient(90deg, #49e892, #d9b77a);
        transform-origin: left center;
        animation: lwAlertifyCountdown linear forwards;
      }

      @keyframes lwAlertifyPopIn {
        from {
          opacity: 0;
          transform: translateX(28px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }

      @keyframes lwAlertifyCountdown {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwAlertifyToastStackComponent {
  readonly alertify = inject(LwAlertifyService);
}
