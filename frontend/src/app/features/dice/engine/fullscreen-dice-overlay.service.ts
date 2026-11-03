import { effect, inject, Injectable, Injector, NgZone, runInInjectionContext, signal } from '@angular/core';
import { LwAlertifyService, type LwRollNotifyParams } from '../../../core/services/lw-alertify.service';
import type { BabylonDiceStageService, CritScreenVignetteState } from './babylon-dice-stage.service';
import type { FullscreenDiceBabylonRunner } from './fullscreen-dice-babylon.runner';
import type { DicePolyhedronType } from './models';

export type FullscreenDiceOverlayPhase =
  | 'hidden'
  | 'rolling'
  | 'settled'
  | 'bg-fading'
  | 'dice-hold'
  | 'dice-fading'
  | 'alert-hold'
  | 'alert-fading';

export interface FullscreenDieEntry {
  dieType: DicePolyhedronType;
  value: number;
}

export interface FullscreenDiceRollRequest {
  label: string;
  actorName?: string;
  expression: string;
  diceValues: number[];
  diceEntries?: FullscreenDieEntry[];
  modifier?: number;
  total: number;
  outcomeBadge?: string;
  isNat20?: boolean;
  isCritFail?: boolean;
  /** Bottom-right result toast, shown once the dice have settled. */
  alert?: LwRollNotifyParams;
  /** Runs once the 3D dice settle or clear from the screen. */
  onComplete?: () => void;
}

@Injectable({ providedIn: 'root' })
export class FullscreenDiceOverlayService {
  private readonly ngZone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly alertify = inject(LwAlertifyService);

  readonly overlayPhase = signal<FullscreenDiceOverlayPhase>('hidden');
  readonly critVignetteState = signal<CritScreenVignetteState>({
    outcome: null,
    intensity: 0.78,
    spread: 0.45,
  });

  private canvas: HTMLCanvasElement | null = null;
  private runner: FullscreenDiceBabylonRunner | null = null;
  private stageService: BabylonDiceStageService | null = null;
  private runnerPromise: Promise<FullscreenDiceBabylonRunner> | null = null;
  private stageTimers: number[] = [];

  registerOverlayCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    if (this.runner) {
      this.runner.mountCanvas(canvas);
    }
    this.warmUpUserDice();
  }

  /**
   * Lazily loads the Babylon runner in the background and pre-builds the authenticated
   * user's custom dice meshes, dynamic textures, and shaders in memory so rolls outside
   * the Dice Forge start smoothly at frame 0 with zero lag.
   */
  warmUpUserDice(): void {
    if (typeof window === 'undefined') return;
    this.ngZone.runOutsideAngular(() => {
      window.setTimeout(() => {
        void this.ensureRunner().then((runner) => {
          if (this.canvas) {
            runner.mountCanvas(this.canvas);
            runner.warmUpDiceCache();
          }
        });
      }, 120);
    });
  }

  /**
   * Triggers a 3D fullscreen dice roll and resolves the returned Promise once the
   * 3D dice have settled AND completely faded out from the screen (`hidden` phase),
   * so sequential combat steps (Attack Roll -> Hit/Miss Modal -> Damage Roll -> EffectBuilder FX)
   * never overlap or stutter.
   */
  triggerFullScreenRollAndWait(req: FullscreenDiceRollRequest): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      this.triggerFullScreenRoll({
        ...req,
        onComplete: () => {
          req.onComplete?.();
          this.schedule(1850, done);
        },
      });
      this.schedule(4200, done);
    });
  }

  triggerFullScreenRoll(req: FullscreenDiceRollRequest): void {
    this.clearTimers();

    const entries = this.resolveDieEntries(req);

    // Step 1: Semi-opaque background and 3D dice appear immediately
    this.overlayPhase.set('rolling');

    // Hard failsafe timer so dice can never get stuck on screen even if WebGL or asset load stalls
    this.schedule(6500, () => {
      if (this.overlayPhase() !== 'hidden') {
        req.onComplete?.();
        this.clearResultsNow();
      }
    });

    void this.ensureRunner()
      .then((runner) => {
        if (this.canvas) {
          runner.mountCanvas(this.canvas);
        }
        let settledHandled = false;
        runner.runRoll(entries, req, () => {
          if (settledHandled) return;
          settledHandled = true;

          // Step 2: Dice have stopped — show the bottom-right result toast, screen edge vignette, and invoke table highlight
          this.ngZone.run(() => {
            this.overlayPhase.set('settled');
            if (req.isNat20) {
              this.stageService?.triggerCritScreenVignette('nat20');
            } else if (req.isCritFail) {
              this.stageService?.triggerCritScreenVignette('critfail');
            }
            if (req.alert) {
              this.alertify.notifyRoll(req.alert);
            }
            req.onComplete?.();
          });

          // Step 3: Hold settled dice briefly (900ms), then fade backdrop
          this.schedule(900, () => {
            this.overlayPhase.set('bg-fading');
          });

          // Step 4: Fade out the 3D dice (at 1800ms)
          this.schedule(1800, () => {
            this.overlayPhase.set('dice-fading');
          });

          // Step 5: Clear 3D dice meshes completely and reset overlay to hidden (at 2800ms)
          this.schedule(2800, () => {
            this.clearResultsNow();
          });
        });
      })
      .catch(() => {
        req.onComplete?.();
        this.clearResultsNow();
      });
  }

  clearResultsNow(): void {
    this.clearTimers();
    this.runner?.clearAll();
    this.overlayPhase.set('hidden');
  }

  private schedule(delayMs: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.ngZone.run(fn);
    }, delayMs);
    this.stageTimers.push(id);
  }

  private async ensureRunner(): Promise<FullscreenDiceBabylonRunner> {
    if (this.runner) {
      return this.runner;
    }
    if (!this.runnerPromise) {
      this.runnerPromise = Promise.all([
        import('./fullscreen-dice-babylon.runner'),
        import('./audio'),
        import('./babylon-dice-stage.service'),
      ]).then(([runnerMod, audioMod, stageMod]) => {
        const soundService = this.injector.get(audioMod.DiceSoundService);
        const stageService = this.injector.get(stageMod.BabylonDiceStageService);
        this.stageService = stageService;

        runInInjectionContext(this.injector, () => {
          effect(() => {
            this.critVignetteState.set(stageService.critVignetteState());
          });
        });

        stageService.onActiveConfigChanged(() => {
          this.runner?.warmUpDiceCache();
        });

        const instance = new runnerMod.FullscreenDiceBabylonRunner(
          this.ngZone,
          soundService,
          stageService,
          () => {
            const p = this.overlayPhase();
            return (
              p === 'rolling' ||
              p === 'settled' ||
              p === 'bg-fading' ||
              p === 'dice-hold' ||
              p === 'dice-fading'
            );
          },
        );
        if (this.canvas) {
          instance.mountCanvas(this.canvas);
        }
        this.runner = instance;
        return instance;
      });
    }
    return this.runnerPromise;
  }

  private resolveDieEntries(req: FullscreenDiceRollRequest): FullscreenDieEntry[] {
    if (req.diceEntries && req.diceEntries.length > 0) {
      return req.diceEntries;
    }

    const expr = (req.expression || '1d20').trim();
    if (/d(100|%)/i.test(expr)) {
      const pctVal = Math.max(1, Math.min(100, req.diceValues[0] ?? req.total ?? 100));
      const tensVal = pctVal === 100 ? 0 : Math.floor(pctVal / 10) * 10;
      const onesVal = pctVal % 10 === 0 ? 10 : pctVal % 10;
      return [
        { dieType: 'd100', value: tensVal },
        { dieType: 'd10', value: onesVal },
      ];
    }

    const termRegex = /(\d*)d(20|12|10|8|6|4)\b/gi;
    const expandedTypes: DicePolyhedronType[] = [];
    let match: RegExpExecArray | null;
    while ((match = termRegex.exec(expr)) !== null) {
      const count = match[1] ? Math.max(1, Math.min(12, parseInt(match[1], 10))) : 1;
      const dt = `d${match[2]}` as DicePolyhedronType;
      for (let i = 0; i < count; i++) {
        expandedTypes.push(dt);
      }
    }

    const fallbackType = this.parseDieType(expr);
    const values =
      req.diceValues.length > 0
        ? req.diceValues
        : [Math.max(1, req.total - (req.modifier ?? 0))];

    if (expandedTypes.length > 0) {
      return expandedTypes.map((dieType, idx) => ({
        dieType,
        value: values[idx] ?? values[0] ?? 1,
      }));
    }

    return values.map((v) => ({ dieType: fallbackType, value: v }));
  }

  private parseDieType(expression: string): DicePolyhedronType {
    if (/d(100|%)/i.test(expression || '')) {
      return 'd100';
    }
    const match = /d(20|12|10|8|6|4)\b/i.exec(expression || '1d20');
    if (!match) {
      return 'd20';
    }
    return `d${match[1]}` as DicePolyhedronType;
  }

  private clearTimers(): void {
    for (const id of this.stageTimers) {
      clearTimeout(id);
    }
    this.stageTimers = [];
  }
}
