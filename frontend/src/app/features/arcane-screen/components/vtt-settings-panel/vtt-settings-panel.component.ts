import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { WebAudioAmbienceService } from '../../../assets/engine/web-audio-ambience.service';
import { VttBattleStateService } from '../../services/vtt-battle-state.service';
import { VTT_MAP_QUALITY_OPTIONS, VttDisplaySettingsService, VttMapQuality } from '../../services/vtt-display-settings.service';

@Component({
  selector: 'lw-vtt-settings-panel',
  standalone: true,
  templateUrl: './vtt-settings-panel.component.html',
  styleUrl: './vtt-settings-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttSettingsPanelComponent {
  readonly display = inject(VttDisplaySettingsService);
  readonly store = inject(LoomWeaverStoreService);
  readonly battle = inject(VttBattleStateService);
  readonly audio = inject(WebAudioAmbienceService);
  readonly enableGrid = output<void>();

  readonly qualityOptions = VTT_MAP_QUALITY_OPTIONS;
  readonly isGm = computed(() => this.store.viewerRole() === 'gm');
  readonly gridScalePercent = computed(() => Math.round(this.display.gridScale() * 100));
  readonly userVolumePercent = computed(() => Math.round(this.audio.effectiveVolume() * 100));

  onVolumeInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(val)) {
      this.audio.setMasterVolume(val / 100);
    }
  }

  select(value: VttMapQuality): void {
    this.display.setMapQuality(value);
  }

  onScaleInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.enableGrid.emit();
      this.display.setGridScale(val);
    }
  }

  stepScale(delta: number): void {
    this.enableGrid.emit();
    this.display.setGridScale(this.display.gridScale() + delta);
  }

  onOffsetXInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.enableGrid.emit();
      this.display.setGridOffset(val, this.display.gridOffsetY());
    }
  }

  onOffsetYInput(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.enableGrid.emit();
      this.display.setGridOffset(this.display.gridOffsetX(), val);
    }
  }

  toggleDrawSquare(): void {
    const next = !this.display.calibratingGrid();
    this.display.calibratingGrid.set(next);
    if (next) {
      this.enableGrid.emit();
      this.battle.mapMode3D.set(false);
    }
  }

  resetGrid(): void {
    this.display.resetGridCalibration();
  }
}
