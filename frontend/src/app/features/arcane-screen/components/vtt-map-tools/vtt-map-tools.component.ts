import { ChangeDetectionStrategy, Component, computed, inject, model, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { LwIconComponent } from '../../../../shared/ui/icon/icon.component';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VttServerSyncService } from '../../services/vtt-server-sync.service';

/** Map tools overlay: a collapsed pill that expands into transparent icon buttons. */
@Component({
  selector: 'lw-vtt-map-tools',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent, RouterLink],
  templateUrl: './vtt-map-tools.component.html',
  styleUrl: './vtt-map-tools.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttMapToolsComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly battle = inject(VttBattleStateService);
  readonly serverSync = inject(VttServerSyncService);

  readonly gridEnabled = model<boolean>(true);
  readonly railOpen = model<boolean>(true);
  readonly rollDice = output<void>();

  readonly expanded = signal<boolean>(false);
  readonly isGm = computed(() => this.store.viewerRole() === 'gm');
  readonly fogTitle = computed(() => {
    const mode = this.battle.fogMode();
    return mode === 'los-only' ? 'Fog: LoS Only' : mode === 'explored-los' ? 'Fog: Traveled + LoS' : 'Fog: Off';
  });
}
