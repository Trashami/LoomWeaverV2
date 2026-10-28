import { Injectable, signal } from '@angular/core';

export interface LwAlertifyToastVm {
  readonly id: string;
  readonly kind: 'roll' | 'status';
  readonly tone: 'emerald' | 'gold' | 'crimson';
  readonly whoRolled: string;
  readonly rollType: string;
  readonly formula: string;
  readonly naturalRollLabel: string;
  readonly modifiersBreakdown: string;
  readonly adjustedTotal: number | null;
  readonly isNat20?: boolean;
  readonly isCritFail?: boolean;
  readonly outcomeSubtext?: string;
  readonly durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class LwAlertifyService {
  readonly toasts = signal<readonly LwAlertifyToastVm[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  notifyRoll(params: {
    readonly whoRolled: string;
    readonly rollType: string;
    readonly formula: string;
    readonly naturalDie: number;
    readonly rawRolls?: readonly number[];
    readonly modifier: number;
    readonly modifiersBreakdown?: string;
    readonly adjustedTotal: number;
    readonly isNat20?: boolean;
    readonly isCritFail?: boolean;
    readonly outcomeSubtext?: string;
    readonly durationMs?: number;
  }): void {
    const id = `ajs-roll-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const durationMs = params.durationMs ?? 4500;
    const modSign = params.modifier >= 0 ? `+${params.modifier}` : `${params.modifier}`;
    const breakdown = params.modifiersBreakdown?.trim()
      ? `${modSign} (${params.modifiersBreakdown.trim()})`
      : `${modSign} Character Modifier`;
    const multiDice =
      params.rawRolls && params.rawRolls.length > 1
        ? `[${params.rawRolls.join(', ')}]`
        : `${params.naturalDie}`;
    const naturalLabel = params.isNat20
      ? `Natural 20 (CRIT!)`
      : params.isCritFail
        ? `Natural 1 (CRIT FAIL)`
        : `Roll: ${multiDice}`;

    const tone: 'emerald' | 'gold' | 'crimson' = params.isNat20
      ? 'gold'
      : params.isCritFail
        ? 'crimson'
        : 'emerald';

    const toast: LwAlertifyToastVm = {
      id,
      kind: 'roll',
      tone,
      whoRolled: params.whoRolled,
      rollType: params.rollType,
      formula: params.formula,
      naturalRollLabel: naturalLabel,
      modifiersBreakdown: breakdown,
      adjustedTotal: params.adjustedTotal,
      isNat20: params.isNat20,
      isCritFail: params.isCritFail,
      outcomeSubtext: params.outcomeSubtext,
      durationMs,
    };

    this.pushToast(toast);
  }

  notifyStatus(
    whoRolled: string,
    rollType: string,
    detail: string,
    tone: 'emerald' | 'gold' | 'crimson' = 'emerald',
    durationMs = 3000,
  ): void {
    const id = `ajs-status-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.pushToast({
      id,
      kind: 'status',
      tone,
      whoRolled,
      rollType,
      formula: '',
      naturalRollLabel: detail,
      modifiersBreakdown: '',
      adjustedTotal: null,
      durationMs,
    });
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private pushToast(toast: LwAlertifyToastVm): void {
    this.toasts.update((list) => [...list.slice(-1), toast]);
    if (typeof window !== 'undefined') {
      const timer = setTimeout(() => this.dismiss(toast.id), toast.durationMs);
      this.timers.set(toast.id, timer);
    }
  }
}
