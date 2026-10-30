import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VttCombatService } from '../../services/vtt-combat.service';

@Component({
  selector: 'lw-vtt-gm-rail',
  standalone: true,
  imports: [NgpButton],
  templateUrl: './vtt-gm-rail.component.html',
  styleUrl: './vtt-gm-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttGmRailComponent {
  readonly vtt = inject(VttCombatService);
  readonly battle = inject(VttBattleStateService);
  readonly store = inject(LoomWeaverStoreService);

  readonly nextTurn = output<void>();
  readonly collapse = output<void>();

  readonly activeKey = computed(() => this.battle.activeInitiativeToken().key);

  readonly initiativeOrder = computed(() =>
    [...this.vtt.tokens()].sort((a, b) => b.initiative - a.initiative),
  );

  readonly hostileMonitor = computed(() =>
    this.battle.visibleMapTokens().filter((t) => t.faction === 'hostile'),
  );

  hpPercent(current: number, max: number): number {
    return max > 0 ? Math.round((current / max) * 100) : 0;
  }

  adjustHp(key: string, delta: number): void {
    this.vtt.adjustCombatantHp(key, delta);
  }
}
