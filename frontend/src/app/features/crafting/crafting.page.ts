import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../shared/ui/icon/icon.component';
import { LwPageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CraftingProjectsComponent } from './components/crafting-projects/crafting-projects.component';
import { CraftingWorkshopComponent } from './components/crafting-workshop/crafting-workshop.component';
import { ForagingStudioComponent } from './components/foraging-studio/foraging-studio.component';
import { RulesReferenceComponent } from './components/rules-reference/rules-reference.component';
import { CraftingService } from './services/crafting.service';

export type CraftingTab = 'workshop' | 'projects' | 'foraging' | 'rules';

@Component({
  selector: 'lw-crafting-page',
  standalone: true,
  imports: [
    LwPageHeaderComponent,
    LwIconComponent,
    CraftingWorkshopComponent,
    CraftingProjectsComponent,
    ForagingStudioComponent,
    RulesReferenceComponent,
  ],
  templateUrl: './crafting.page.html',
  styleUrl: './crafting.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CraftingPageComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly crafting = inject(CraftingService);

  readonly activeTab = this.crafting.activeTab;

  readonly pendingProjectsCount = computed(() => {
    return this.crafting.pendingProjectsForGm().length;
  });
}
