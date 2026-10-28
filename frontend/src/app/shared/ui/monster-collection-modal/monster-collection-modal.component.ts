import { ChangeDetectionStrategy, Component, effect, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwModalComponent } from '../modal/modal.component';
import {
  LwMonsterCollectionVm,
  LwMonsterPickOptionVm,
  LwMonsterSummaryVm,
  LwSaveMonsterCollectionDraft,
} from '../monster-card/monster-card.models';

/** DM collection editor: name, description, campaign assignment, and the monsters it contains. */
@Component({
  selector: 'lw-monster-collection-modal',
  standalone: true,
  imports: [FormsModule, NgpButton, LwBadgeComponent, LwButtonComponent, LwModalComponent],
  templateUrl: './monster-collection-modal.component.html',
  styleUrl: './monster-collection-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterCollectionModalComponent {
  readonly open = model<boolean>(false);
  readonly editing = input<LwMonsterCollectionVm | null>(null);
  /** Campaigns where the caller is DM; only these can receive the collection. */
  readonly campaigns = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly defaultCampaignId = input<number | null>(null);
  readonly pickerResults = input<readonly LwMonsterSummaryVm[]>([]);
  readonly monsterLabels = input<Readonly<Record<string, string>>>({});
  readonly busy = input<boolean>(false);
  readonly errorMessage = input<string>('');

  readonly pickerSearch = output<string>();
  readonly collectionSaved = output<LwSaveMonsterCollectionDraft>();
  readonly collectionDeleted = output<string>();

  readonly name = signal<string>('');
  readonly description = signal<string>('');
  readonly campaignIds = signal<readonly number[]>([]);
  readonly monsterKeys = signal<readonly string[]>([]);
  readonly query = signal<string>('');
  readonly localError = signal<string>('');
  private readonly addedLabels = signal<Record<string, string>>({});

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const e = this.editing();
      const fallbackCampaign = this.defaultCampaignId();
      this.name.set(e?.name ?? '');
      this.description.set(e?.description ?? '');
      this.campaignIds.set(e ? [...e.assignedCampaignIds] : fallbackCampaign ? [fallbackCampaign] : []);
      this.monsterKeys.set(e ? [...e.monsterKeys] : []);
      this.query.set('');
      this.localError.set('');
      this.pickerSearch.emit('');
    });
  }

  label(key: string): string {
    return this.addedLabels()[key] ?? this.monsterLabels()[key] ?? key;
  }

  isAssigned(id: string): boolean {
    return this.campaignIds().includes(Number(id));
  }

  toggleCampaign(id: string): void {
    const n = Number(id);
    this.campaignIds.update((list) => (list.includes(n) ? list.filter((x) => x !== n) : [...list, n]));
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.pickerSearch.emit(value);
  }

  toggleMonster(m: LwMonsterSummaryVm): void {
    this.addedLabels.update((l) => ({ ...l, [m.key]: m.name }));
    this.monsterKeys.update((list) => (list.includes(m.key) ? list.filter((k) => k !== m.key) : [...list, m.key]));
  }

  removeKey(key: string): void {
    this.monsterKeys.update((list) => list.filter((k) => k !== key));
  }

  save(): void {
    if (this.name().trim().length < 2) {
      this.localError.set('Name the collection (at least 2 characters).');
      return;
    }
    this.localError.set('');
    this.collectionSaved.emit({
      id: this.editing()?.id,
      name: this.name().trim(),
      description: this.description().trim(),
      assignedCampaignIds: this.campaignIds(),
      monsterKeys: this.monsterKeys(),
    });
  }
}
