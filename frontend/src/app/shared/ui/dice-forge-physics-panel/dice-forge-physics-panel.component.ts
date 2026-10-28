import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { DiceCritEditorComponent } from '../dice-crit-editor/dice-crit-editor.component';
import { DiceCritCustomization } from '../../../features/dice/engine/effects/dice-core-effects';
import { DiceSoundProfile } from '../../../features/dice/engine/audio';
import {
  DEFAULT_DICE_PHYSICS_CONFIG,
  DiceForgeToolId,
  DicePhysicsConfig
} from '../../../features/dice/engine/dice-physics.types';
import { DiceCritEffectPreset } from '../../../features/dice/engine/effects';
import {
  DiceCustomRuntimeConfig,
  MarketplaceDicePreset,
  SavedUserDicePreset
} from '../../../features/dice/engine/skins';

@Component({
  selector: 'lw-dice-forge-physics-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, NgpButton, DiceCritEditorComponent],
  templateUrl: './dice-forge-physics-panel.component.html',
  styleUrl: '../dice-forge-inspector/dice-forge-inspector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LwDiceForgePhysicsPanelComponent {
  readonly activeToolId = input.required<DiceForgeToolId>();
  readonly customConfig = input.required<DiceCustomRuntimeConfig>();
  readonly nat20Effects = input<readonly DiceCritEffectPreset[]>([]);
  readonly critFailEffects = input<readonly DiceCritEffectPreset[]>([]);
  readonly soundProfiles = input<readonly DiceSoundProfile[]>([]);
  readonly soundVolume = input<number>(0.75);
  readonly soundMuted = input<boolean>(false);
  readonly savedPresets = input<readonly SavedUserDicePreset[]>([]);
  readonly marketPresets = input<readonly MarketplaceDicePreset[]>([]);

  readonly configPatched = output<Partial<DiceCustomRuntimeConfig>>();
  readonly physicsPatched = output<Partial<DicePhysicsConfig>>();
  readonly previewCritRequested = output<'nat20' | 'critfail'>();
  readonly testSoundRequested = output<string>();
  readonly volumeChanged = output<number>();
  readonly muteToggled = output<void>();
  readonly savePresetRequested = output<void>();
  readonly loadPresetRequested = output<SavedUserDicePreset>();
  readonly deletePresetRequested = output<string>();
  readonly publishMarketRequested = output<string>();
  readonly importMarketPresetRequested = output<MarketplaceDicePreset>();
  readonly previewRollCameraRequested = output<void>();

  readonly publishTagline = signal<string>('Custom polyhedral set forged in LoomWeaver Studio.');
  patchCrit(outcome: 'nat20' | 'critfail', value: DiceCritCustomization): void {
    this.configPatched.emit(outcome === 'nat20'
      ? { nat20EffectId: value.presetId, nat20Customization: value }
      : { critFailEffectId: value.presetId, critFailCustomization: value });
  }

  patch<K extends keyof DiceCustomRuntimeConfig>(key: K, value: DiceCustomRuntimeConfig[K]): void {
    this.configPatched.emit({ [key]: value });
  }

  patchNum<K extends keyof DiceCustomRuntimeConfig>(key: K, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(val)) {
      this.patch(key, val as DiceCustomRuntimeConfig[K]);
    }
  }

  patchPhysics<K extends keyof DicePhysicsConfig>(key: K, value: DicePhysicsConfig[K]): void {
    this.physicsPatched.emit({ [key]: value });
  }

  patchPhysicsNum<K extends keyof DicePhysicsConfig>(key: K, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(val)) {
      this.physicsPatched.emit({ [key]: val as DicePhysicsConfig[K] });
    }
  }

  resetPhysicsToDefaults(): void {
    this.physicsPatched.emit({ ...DEFAULT_DICE_PHYSICS_CONFIG });
  }
}
