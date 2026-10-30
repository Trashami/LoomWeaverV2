import { Injectable, computed, signal } from '@angular/core';

/** Encounter clock shown in the battle map bar. Starts once per page visit and is stopped by the page on destroy. */
@Injectable({ providedIn: 'root' })
export class VttEncounterTimerService {
  readonly seconds = signal<number>(872);
  readonly running = signal<boolean>(true);
  readonly formatted = computed(() => {
    const total = this.seconds();
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  });

  private handle: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.handle) return;
    this.handle = setInterval(() => {
      if (this.running()) this.seconds.update((s) => s + 1);
    }, 1000);
  }

  stop(): void {
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
  }

  toggle(): void {
    this.running.update((r) => !r);
  }
}
