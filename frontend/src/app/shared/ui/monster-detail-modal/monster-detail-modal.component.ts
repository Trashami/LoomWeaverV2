import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { NgpTabButton, NgpTabList, NgpTabset } from 'ng-primitives/tabs';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwModalComponent } from '../modal/modal.component';
import { LwMonsterAssetPanelComponent, LwMonsterAssignmentDraft } from '../monster-asset-panel/monster-asset-panel.component';
import { LwMonsterCampaignPanelComponent } from '../monster-campaign-panel/monster-campaign-panel.component';
import {
  LW_MONSTER_PLACEHOLDER_IMAGE,
  LwMonsterAssignmentVm,
  LwMonsterCollectionVm,
  LwMonsterDetailVm,
  LwMonsterPickOptionVm,
  LwMonsterPlacementRequest,
  LwMonsterPlacementVm,
  LwMonsterSightingDraft,
  LwMonsterSightingVm,
  LwMonsterTokenOptionVm,
} from '../monster-card/monster-card.models';
import { LwMonsterLoomPanelComponent } from '../monster-loom-panel/monster-loom-panel.component';
import { LwMonsterStatblockComponent } from '../monster-statblock/monster-statblock.component';

type MonsterDetailTab = 'statblock' | 'loom' | 'prep' | 'assets';

/** Medium modal with a monster's complete details; DM-only tabs render only when `isGm` is true. */
@Component({
  selector: 'lw-monster-detail-modal',
  standalone: true,
  imports: [
    NgpButton,
    NgpTabset,
    NgpTabList,
    NgpTabButton,
    LwBadgeComponent,
    LwButtonComponent,
    LwModalComponent,
    LwMonsterStatblockComponent,
    LwMonsterCampaignPanelComponent,
    LwMonsterAssetPanelComponent,
    LwMonsterLoomPanelComponent,
  ],
  templateUrl: './monster-detail-modal.component.html',
  styleUrl: './monster-detail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterDetailModalComponent {
  readonly open = model<boolean>(false);
  readonly detail = input<LwMonsterDetailVm | null>(null);
  readonly loading = input<boolean>(false);
  readonly errorMessage = input<string>('');
  readonly campaignName = input<string>('Active Campaign');
  readonly isGm = input<boolean>(false);
  readonly busy = input<boolean>(false);
  readonly sessions = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly encounters = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly characters = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly placements = input<readonly LwMonsterPlacementVm[]>([]);
  readonly collections = input<readonly LwMonsterCollectionVm[]>([]);
  readonly assignment = input<LwMonsterAssignmentVm | null>(null);
  readonly tokenOptions = input<readonly LwMonsterTokenOptionVm[]>([]);
  readonly modelOptions = input<readonly LwMonsterTokenOptionVm[]>([]);
  readonly sightings = input<readonly LwMonsterSightingVm[]>([]);

  readonly closed = output<void>();
  readonly placementRequested = output<LwMonsterPlacementRequest>();
  readonly placementRemoved = output<string>();
  readonly collectionToggled = output<string>();
  readonly createCollectionRequested = output<void>();
  readonly assignmentSaved = output<LwMonsterAssignmentDraft>();
  readonly sightingRecorded = output<LwMonsterSightingDraft>();
  readonly publishRequested = output<string>();
  readonly editRequested = output<string>();

  readonly activeTab = signal<MonsterDetailTab>('statblock');
  private readonly failedImage = signal<string>('');

  readonly tabs = computed<readonly { id: MonsterDetailTab; label: string }[]>(() => {
    const base: { id: MonsterDetailTab; label: string }[] = [
      { id: 'statblock', label: 'Statblock' },
      { id: 'loom', label: `Loom (${this.sightings().length})` },
    ];
    return this.isGm()
      ? [...base, { id: 'prep', label: 'Campaign Prep' }, { id: 'assets', label: 'Tokens & 3D' }]
      : base;
  });

  readonly imageUrl = computed(() => {
    const d = this.detail();
    if (!d) return LW_MONSTER_PLACEHOLDER_IMAGE;
    const candidates = [this.assignment()?.primaryTokenUrl, d.summary.imageUrl, d.summary.tokenUrl];
    return candidates.find((u) => !!u && u !== this.failedImage()) ?? LW_MONSTER_PLACEHOLDER_IMAGE;
  });

  private readonly detailKey = computed(() => this.detail()?.summary.key ?? '');

  constructor() {
    effect(() => {
      // Reset to the statblock whenever a different monster opens, and never leave a player on a DM tab.
      this.detailKey();
      this.isGm();
      this.activeTab.set('statblock');
    });
  }

  onImageError(): void {
    this.failedImage.set(this.imageUrl());
  }

  close(): void {
    this.open.set(false);
    this.closed.emit();
  }
}
