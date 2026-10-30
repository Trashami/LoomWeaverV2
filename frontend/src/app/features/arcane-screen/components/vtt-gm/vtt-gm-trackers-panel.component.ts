import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { VttCombatService } from '../../services/vtt-combat.service';

export type VttGmTrackerSection = 'npcs' | 'traps' | 'monsters';

@Component({
  selector: 'lw-vtt-gm-trackers',
  standalone: true,
  imports: [NgpButton],
  templateUrl: './vtt-gm-trackers-panel.component.html',
  styleUrl: './vtt-gm-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttGmTrackersPanelComponent {
  readonly vtt = inject(VttCombatService);
  readonly store = inject(LoomWeaverStoreService);

  readonly section = signal<VttGmTrackerSection>('npcs');
  readonly encounter = computed(() => this.vtt.activeLiveEncounter());

  toggleTrap(trapId: string): void {
    const enc = this.encounter();
    if (enc) this.vtt.toggleTrapArmed(enc.id, trapId);
  }
}
