import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { CraftingService } from '../../services/crafting.service';

@Component({
  selector: 'lw-crafting-projects',
  standalone: true,
  imports: [NgpButton, LwIconComponent],
  templateUrl: './crafting-projects.component.html',
  styleUrl: './crafting-projects.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CraftingProjectsComponent {
  readonly crafting = inject(CraftingService);

  readonly activeProjects = computed(() => {
    return this.crafting.activeProjects();
  });

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
