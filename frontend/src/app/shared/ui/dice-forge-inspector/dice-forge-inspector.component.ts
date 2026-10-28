import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { DiceSoundProfile } from '../../../features/dice/engine/audio';
import {
  DiceBlendMode,
  DiceForgeToolId,
  DicePhysicsConfig,
  DicePulseWaveform
} from '../../../features/dice/engine/dice-physics.types';
import { DiceCritEffectPreset } from '../../../features/dice/engine/effects';
import { DiceModelDefinition, DiceSizePreset } from '../../../features/dice/engine/models';
import {
  DiceCustomRuntimeConfig,
  DiceOverlayType,
  DiceSkinConfig,
  DiceSkinSurfaceStyle,
  MarketplaceDicePreset,
  SavedUserDicePreset
} from '../../../features/dice/engine/skins';
import { LwDiceForgePhysicsPanelComponent } from '../dice-forge-physics-panel/dice-forge-physics-panel.component';
import { DICE_FORGE_DOCK_TOOLS } from '../dice-tool-dock/dice-tool-dock.component';

@Component({
  selector: 'lw-dice-forge-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule, NgpButton, LwDiceForgePhysicsPanelComponent],
  templateUrl: './dice-forge-inspector.component.html',
  styleUrl: './dice-forge-inspector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LwDiceForgeInspectorComponent {
  readonly activeToolId = input.required<DiceForgeToolId>();
  readonly customConfig = input.required<DiceCustomRuntimeConfig>();
  readonly skins = input<readonly DiceSkinConfig[]>([]);
  readonly models = input<readonly DiceModelDefinition[]>([]);
  readonly nat20Effects = input<readonly DiceCritEffectPreset[]>([]);
  readonly critFailEffects = input<readonly DiceCritEffectPreset[]>([]);
  readonly soundProfiles = input<readonly DiceSoundProfile[]>([]);
  readonly soundVolume = input<number>(0.75);
  readonly soundMuted = input<boolean>(false);
  readonly savedPresets = input<readonly SavedUserDicePreset[]>([]);
  readonly marketPresets = input<readonly MarketplaceDicePreset[]>([]);

  readonly skinSelected = output<DiceSkinConfig>();
  readonly configPatched = output<Partial<DiceCustomRuntimeConfig>>();
  readonly physicsPatched = output<Partial<DicePhysicsConfig>>();
  readonly previewCritRequested = output<'nat20' | 'critfail'>();
  readonly testSoundRequested = output<string>();
  readonly volumeChanged = output<number>();
  readonly muteToggled = output<void>();
  readonly resetDefaultsRequested = output<void>();
  readonly savePresetRequested = output<void>();
  readonly loadPresetRequested = output<SavedUserDicePreset>();
  readonly deletePresetRequested = output<string>();
  readonly publishMarketRequested = output<string>();
  readonly importMarketPresetRequested = output<MarketplaceDicePreset>();
  readonly previewRollCameraRequested = output<void>();

  readonly activeToolMeta = computed(
    () => DICE_FORGE_DOCK_TOOLS.find(t => t.id === this.activeToolId()) ?? DICE_FORGE_DOCK_TOOLS[0]
  );

  readonly surfaceStyles: readonly DiceSkinSurfaceStyle[] = [
    'obsidian', 'stone', 'resin', 'metal', 'glass', 'wood', 'void', 'plastic'
  ];
  readonly sizePresets: readonly DiceSizePreset[] = ['small', 'medium', 'large'];
  readonly blendModes: readonly DiceBlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'additive'];
  readonly pulseWaveforms: readonly DicePulseWaveform[] = ['sine', 'heartbeat', 'sawtooth', 'flicker'];
  readonly overlayStyles: readonly DiceOverlayType[] = ['none', 'recessed-plate', 'celtic-cage', 'arcane-runes'];
  readonly fontFamilies: ReadonlyArray<{ label: string; value: string }> = [
    { label: 'Cinzel Royal Serif', value: 'Cinzel, Georgia, serif' },
    { label: 'Nordic Runic', value: '"Nordic Chance", Cinzel, serif' },
    { label: 'Georgia Classic', value: 'Georgia, serif' },
    { label: 'Palatino Chronicle', value: '"Palatino Linotype", serif' },
    { label: 'Trebuchet Guild Sans', value: '"Trebuchet MS", sans-serif' },
    { label: 'Courier Artificer Slab', value: '"Courier New", monospace' },
    { label: 'Impact Heavy', value: 'Impact, sans-serif' }
  ];
  readonly fontWeights: ReadonlyArray<{ label: string; value: string }> = [
    { label: 'Regular', value: '400' },
    { label: 'Semi-Bold', value: '600' },
    { label: 'Bold', value: '700' },
    { label: 'Black', value: '900' }
  ];
  readonly coreSwatches = ['#14131a', '#0f3828', '#2b2f36', '#1f090d', '#1b3f5e', '#2d2112', '#0b0718', '#303640'];
  readonly numberSwatches = ['#ffd978', '#49e892', '#63d2ff', '#ffffff', '#ff4769', '#ffb340', '#d08bff', '#f5e6c4'];

  patch<K extends keyof DiceCustomRuntimeConfig>(key: K, value: DiceCustomRuntimeConfig[K]): void {
    if (key === 'surfaceStyleOverride') {
      this.configPatched.emit({ surfaceStyleOverride: value as DiceSkinSurfaceStyle,
        coreGradientEnabled: false, coreInnerGlowEnabled: false, coreOuterGlowEnabled: false,
        faceOverlayStyle: 'none', reflectionMetallic: value === 'metal' ? 0.9 : 0,
        surfaceRoughness: value === 'stone' ? 0.85 : value === 'wood' ? 0.6 : 0.08 });
      return;
    }
    if (key === 'numberDepth') {
      const numVal = Number(value);
      this.configPatched.emit({
        [key]: value,
        recessedNumbers: numVal < -0.05,
        numberEngraving: numVal < -0.05 ? 'recessed' : numVal > 0.05 ? 'raised' : 'flush',
      });
      return;
    }
    this.configPatched.emit({ [key]: value });
  }

  patchNum<K extends keyof DiceCustomRuntimeConfig>(key: K, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(val)) {
      this.patch(key, val as DiceCustomRuntimeConfig[K]);
    }
  }
}
