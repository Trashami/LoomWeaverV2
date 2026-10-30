import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { TableRealtimeSyncService } from '../../../../core/services/table-realtime-sync.service';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VttCombatService } from '../../services/vtt-combat.service';
import { VttEncounterTimerService } from '../../services/vtt-encounter-timer.service';
import { VttHandoutService } from '../../services/vtt-handout.service';

/** Horizontal status strip above the battle map: live dot, encounter, turn, timer, and 2D/3D mode. */
@Component({
  selector: 'lw-vtt-battle-status-bar',
  standalone: true,
  imports: [FormsModule, NgpButton],
  templateUrl: './vtt-battle-status-bar.component.html',
  styleUrl: './vtt-battle-status-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttBattleStatusBarComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly vtt = inject(VttCombatService);
  readonly battle = inject(VttBattleStateService);
  readonly timer = inject(VttEncounterTimerService);
  readonly handouts = inject(VttHandoutService);
  readonly realtime = inject(TableRealtimeSyncService);

  readonly encounterChange = output<string>();
  readonly nextTurn = output<void>();
  readonly modeChange = output<boolean>();

  readonly isGm = computed(() => this.store.viewerRole() === 'gm');
  readonly isLive = computed(() => this.realtime.syncProtocolLabel() === 'Connected with SignalR');
  readonly liveLabel = computed(() => (this.isLive() ? 'Live' : 'Offline'));
}
