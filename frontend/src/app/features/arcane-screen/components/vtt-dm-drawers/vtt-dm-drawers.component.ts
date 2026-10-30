import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { VttCombatService } from '../../services/vtt-combat.service';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';

@Component({
  selector: 'lw-vtt-dm-drawers',
  standalone: true,
  imports: [FormsModule, NgpButton],
  templateUrl: './vtt-dm-drawers.component.html',
  styleUrl: './vtt-dm-drawers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttDmDrawersComponent {
  readonly battle = inject(VttBattleStateService);
  readonly vtt = inject(VttCombatService);
  readonly store = inject(LoomWeaverStoreService);
}
