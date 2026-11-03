import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { TableRealtimeSyncService } from '../../../../core/services/table-realtime-sync.service';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { CraftingProjectVm } from '../../models/crafting.models';
import { CraftingService } from '../../services/crafting.service';

export interface ProjectTimerStats {
  readonly elapsedMs: number;
  readonly remainingMs: number;
  readonly percent: number;
  readonly remainingFormatted: string;
  readonly isFinished: boolean;
}

@Component({
  selector: 'lw-crafting-projects',
  standalone: true,
  imports: [NgpButton, LwIconComponent],
  templateUrl: './crafting-projects.component.html',
  styleUrl: './crafting-projects.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CraftingProjectsComponent implements OnInit {
  readonly crafting = inject(CraftingService);
  readonly tableSync = inject(TableRealtimeSyncService);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentTime = signal<number>(Date.now());
  readonly selectedCharFilter = signal<string>('all');
  private readonly triggeredAutoCompletes = new Set<string>();

  readonly activeProjects = computed(() => {
    const all = this.crafting.activeProjects();
    const isGm = this.crafting.isGm();
    const activeKey = this.crafting.focusedCharacterKey();

    if (!isGm) {
      return all.filter((p) => p.characterKey === activeKey);
    }

    const filter = this.selectedCharFilter();
    if (filter === 'all') return all;
    return all.filter((p) => p.characterKey === filter);
  });

  ngOnInit(): void {
    const timer = setInterval(() => {
      const now = Date.now();
      this.currentTime.set(now);
      this.checkProjectCompletions(now);
    }, 1000);

    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private checkProjectCompletions(now: number): void {
    const pending = this.crafting.activeProjects().filter((p) => p.status === 'pending');
    for (const proj of pending) {
      const completesAt = new Date(proj.completesAt).getTime();
      if (now >= completesAt && !this.triggeredAutoCompletes.has(proj.id)) {
        this.triggeredAutoCompletes.add(proj.id);
        this.crafting.completeProjectNow(proj);
      }
    }
  }

  getProjectTimer(project: CraftingProjectVm): ProjectTimerStats {
    const now = this.currentTime();
    const start = new Date(project.startedAt).getTime();
    const end = new Date(project.completesAt).getTime();
    const total = Math.max(1000, end - start);
    const elapsed = Math.max(0, now - start);
    const remaining = Math.max(0, end - now);
    const pct = Math.min(100, Math.max(0, Math.floor((elapsed / total) * 100)));
    const isFinished = remaining <= 0;

    let remainingFormatted: string;
    if (isFinished) {
      remainingFormatted = 'Finishing Craft...';
    } else if (remaining < 60000) {
      remainingFormatted = `${Math.ceil(remaining / 1000)}s remaining`;
    } else if (remaining < 3600000) {
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      remainingFormatted = `${mins}m ${secs}s remaining`;
    } else {
      const hrs = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      remainingFormatted = `${hrs}h ${mins}m remaining`;
    }

    return {
      elapsedMs: elapsed,
      remainingMs: remaining,
      percent: pct,
      remainingFormatted,
      isFinished,
    };
  }

  formatTime(isoString: string): string {
    if (!isoString) return 'Now';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }
}
