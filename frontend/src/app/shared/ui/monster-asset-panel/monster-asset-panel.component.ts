import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LwButtonComponent } from '../button/button.component';
import {
  LW_MONSTER_PLACEHOLDER_IMAGE,
  LwMonsterAssignmentSlot,
  LwMonsterAssignmentVm,
  LwMonsterTokenOptionVm,
} from '../monster-card/monster-card.models';

export type LwMonsterAssignmentDraft = Record<LwMonsterAssignmentSlot, string>;

interface SlotView {
  readonly slot: LwMonsterAssignmentSlot;
  readonly label: string;
  readonly kind: '2d' | '3d';
}

/** DM-only, campaign-scoped primary/secondary token and 3D model assignment for one monster. */
@Component({
  selector: 'lw-monster-asset-panel',
  standalone: true,
  imports: [FormsModule, LwButtonComponent],
  templateUrl: './monster-asset-panel.component.html',
  styleUrl: './monster-asset-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterAssetPanelComponent {
  readonly campaignName = input<string>('Active Campaign');
  readonly assignment = input<LwMonsterAssignmentVm | null>(null);
  readonly tokenOptions = input<readonly LwMonsterTokenOptionVm[]>([]);
  readonly modelOptions = input<readonly LwMonsterTokenOptionVm[]>([]);
  readonly busy = input<boolean>(false);

  readonly assignmentSaved = output<LwMonsterAssignmentDraft>();

  readonly slots: readonly SlotView[] = [
    { slot: 'primaryTokenUrl', label: 'Primary token', kind: '2d' },
    { slot: 'secondaryTokenUrl', label: 'Secondary token', kind: '2d' },
    { slot: 'primaryModelUrl', label: 'Primary 3D model', kind: '3d' },
    { slot: 'secondaryModelUrl', label: 'Secondary 3D model', kind: '3d' },
  ];

  readonly draft = linkedSignal<LwMonsterAssignmentDraft>(() => {
    const a = this.assignment();
    return {
      primaryTokenUrl: a?.primaryTokenUrl ?? '',
      secondaryTokenUrl: a?.secondaryTokenUrl ?? '',
      primaryModelUrl: a?.primaryModelUrl ?? '',
      secondaryModelUrl: a?.secondaryModelUrl ?? '',
    };
  });

  readonly hasSuggestions = computed(
    () => this.tokenOptions().some((o) => o.matchScore > 0) || this.modelOptions().some((o) => o.matchScore > 0),
  );

  optionsFor(kind: '2d' | '3d'): readonly LwMonsterTokenOptionVm[] {
    return kind === '2d' ? this.tokenOptions() : this.modelOptions();
  }

  previewFor(slot: SlotView): string {
    const url = this.draft()[slot.slot];
    if (!url) return LW_MONSTER_PLACEHOLDER_IMAGE;
    const match = this.optionsFor(slot.kind).find((o) => o.assetUrl === url);
    return match?.previewUrl || (slot.kind === '2d' ? url : LW_MONSTER_PLACEHOLDER_IMAGE);
  }

  setSlot(slot: LwMonsterAssignmentSlot, value: string): void {
    this.draft.update((d) => ({ ...d, [slot]: value }));
  }

  applySuggestions(): void {
    const tokens = this.tokenOptions().filter((o) => o.matchScore > 0);
    const models = this.modelOptions().filter((o) => o.matchScore > 0);
    this.draft.update((d) => ({
      primaryTokenUrl: d.primaryTokenUrl || tokens[0]?.assetUrl || '',
      secondaryTokenUrl: d.secondaryTokenUrl || tokens[1]?.assetUrl || '',
      primaryModelUrl: d.primaryModelUrl || models[0]?.assetUrl || '',
      secondaryModelUrl: d.secondaryModelUrl || models[1]?.assetUrl || '',
    }));
  }

  save(): void {
    this.assignmentSaved.emit(this.draft());
  }

  onPreviewError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith(LW_MONSTER_PLACEHOLDER_IMAGE)) img.src = LW_MONSTER_PLACEHOLDER_IMAGE;
  }
}
