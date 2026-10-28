import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwButtonComponent } from '../button/button.component';
import {
  LwMonsterCollectionVm,
  LwMonsterPickOptionVm,
  LwMonsterPlacementRequest,
  LwMonsterPlacementVm,
} from '../monster-card/monster-card.models';

/** DM-only prep panel: place a monster in the campaign, a session, or an encounter, and curate collections. */
@Component({
  selector: 'lw-monster-campaign-panel',
  standalone: true,
  imports: [FormsModule, NgpButton, LwButtonComponent],
  templateUrl: './monster-campaign-panel.component.html',
  styleUrl: './monster-campaign-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMonsterCampaignPanelComponent {
  readonly monsterKey = input.required<string>();
  readonly campaignName = input<string>('Active Campaign');
  readonly sessions = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly encounters = input<readonly LwMonsterPickOptionVm[]>([]);
  readonly placements = input<readonly LwMonsterPlacementVm[]>([]);
  readonly collections = input<readonly LwMonsterCollectionVm[]>([]);
  readonly busy = input<boolean>(false);

  readonly placementRequested = output<LwMonsterPlacementRequest>();
  readonly placementRemoved = output<string>();
  readonly collectionToggled = output<string>();
  readonly createCollectionRequested = output<void>();

  readonly sessionId = signal<string>('');
  readonly encounterId = signal<string>('');
  readonly encounterCount = signal<number>(1);

  readonly inCampaign = computed(() => this.placements().some((p) => p.scope === 'campaign'));

  addToCampaign(): void {
    this.placementRequested.emit({ scope: 'campaign', count: 1 });
  }

  addToSession(): void {
    const id = this.sessionId() || this.sessions()[0]?.id;
    if (id) this.placementRequested.emit({ scope: 'session', sessionId: id, count: 1 });
  }

  addToEncounter(): void {
    const id = this.encounterId() || this.encounters()[0]?.id;
    const count = Math.min(50, Math.max(1, Math.round(this.encounterCount() || 1)));
    if (id) this.placementRequested.emit({ scope: 'encounter', encounterId: id, count });
  }

  isInCollection(collection: LwMonsterCollectionVm): boolean {
    return collection.monsterKeys.includes(this.monsterKey());
  }

  placementLabel(p: LwMonsterPlacementVm): string {
    switch (p.scope) {
      case 'session':
        return `Session: ${p.sessionLabel ?? p.sessionId}`;
      case 'encounter':
        return `Encounter: ${p.encounterLabel ?? p.encounterId} (x${p.count})`;
      default:
        return 'Campaign bestiary';
    }
  }
}
