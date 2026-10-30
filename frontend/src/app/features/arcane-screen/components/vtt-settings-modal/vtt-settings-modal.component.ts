import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwButtonComponent } from '../../../../shared/ui/public-api';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { ACTION_BAR_SKINS } from '../vtt-action-bar/action-bar-skins';

@Component({
  selector: 'lw-vtt-settings-modal',
  standalone: true,
  imports: [FormsModule, NgpButton, LwButtonComponent],
  templateUrl: './vtt-settings-modal.component.html',
  styleUrl: './vtt-settings-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttSettingsModalComponent {
  readonly battle = inject(VttBattleStateService);
  readonly actionBarSkins = ACTION_BAR_SKINS;

  close(): void {
    this.battle.settingsModalOpen.set(false);
  }

  resetDefaults(): void {
    this.battle.actionBarSettings.set({
      skin: 'loom-emerald',
      opacity: 95,
      compactMode: false,
      snapSensitivityFeet: 10,
      showHotbarKeybinds: true,
      showMapRangeLabels: true,
      autoCenterActiveTurn: true,
    });
  }
}
