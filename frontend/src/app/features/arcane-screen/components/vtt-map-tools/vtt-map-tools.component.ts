import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VttCombatService } from '../../services/vtt-combat.service';
import { VttServerSyncService } from '../../services/vtt-server-sync.service';
import { SEED_VTT_WALL_SEGMENTS } from '../../services/vtt-battle.seed';

export type LeftMapTool =
  | 'select'
  | 'draw'
  | 'light'
  | 'tokens'
  | 'view'
  | 'measure';

@Component({
  selector: 'lw-vtt-map-tools',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent],
  templateUrl: './vtt-map-tools.component.html',
  styleUrl: './vtt-map-tools.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttMapToolsComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly battle = inject(VttBattleStateService);
  readonly vtt = inject(VttCombatService);
  readonly serverSync = inject(VttServerSyncService);

  readonly gridEnabled = model<boolean>(true);
  readonly railOpen = model<boolean>(false);
  readonly rollDice = output<void>();
  readonly openShortcuts = output<void>();

  readonly showMapTools = signal<boolean>(true);
  readonly activeLeftTool = signal<LeftMapTool | null>(null);

  readonly isGm = computed(() => this.store.viewerRole() === 'gm');
  readonly partyCount = computed(() => this.vtt.partyTokensInScene().length);
  readonly hostileCount = computed(() =>
    this.battle.visibleMapTokens().filter((t) => t.faction === 'hostile').length,
  );
  readonly totalTokensCount = computed(() => this.battle.visibleMapTokens().length);

  readonly fogTitle = computed(() => {
    const mode = this.battle.fogMode();
    return mode === 'los-only'
      ? 'LoS Only'
      : mode === 'explored-los'
        ? 'Traveled + LoS'
        : 'Fog Off';
  });

  toggleLeftTool(tool: LeftMapTool): void {
    if (this.activeLeftTool() === tool) {
      this.activeLeftTool.set(null);
    } else {
      this.activeLeftTool.set(tool);
    }
  }

  deselectAll(): void {
    this.battle.queuedTargetSequence.set([]);
    this.battle.cancelAllInteractiveModes();
    this.activeLeftTool.set(null);
  }

  toggleTargeting(): void {
    this.battle.targetSelectionMode.set(!this.battle.targetSelectionMode());
  }

  toggleFogMode(): void {
    const cur = this.battle.fogMode();
    if (cur === 'no-fog') {
      this.battle.fogMode.set('explored-los');
    } else if (cur === 'explored-los') {
      this.battle.fogMode.set('los-only');
    } else {
      this.battle.fogMode.set('no-fog');
    }
  }

  clearAllWalls(): void {
    (this.battle.walls as any).set([]);
  }

  resetDefaultWalls(): void {
    (this.battle.walls as any).set(SEED_VTT_WALL_SEGMENTS);
  }
}
