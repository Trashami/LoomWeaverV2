import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../icon/icon.component';

export type LwMapCameraView = 'top-down' | 'isometric' | 'first-person' | 'real-2d' | 'split-2d-3d';
export type LwMapQualityPreset = 'Auto' | 'Cinematic 3D' | 'Balanced 3D' | 'Performance 3D' | 'Classic 2D';

@Component({
  selector: 'lw-map-viewport-bar',
  imports: [NgpButton, LwIconComponent],
  templateUrl: './map-viewport-bar.component.html',
  styleUrl: './map-viewport-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapViewportBarComponent {
  readonly activeView = input<LwMapCameraView>('isometric');
  readonly activeTheme = input<string>('');
  readonly themes = input<readonly string[]>([]);
  readonly activeQuality = input<LwMapQualityPreset>('Balanced 3D');
  readonly qualityPresets = input<readonly LwMapQualityPreset[]>([
    'Auto',
    'Cinematic 3D',
    'Balanced 3D',
    'Performance 3D',
    'Classic 2D',
  ]);
  readonly gridSize = input<string>('5 ft');
  readonly snapEnabled = input<boolean>(true);
  readonly showPlayerSafeOnly = input<boolean>(false);
  readonly fps = input<number>(60);

  readonly viewChange = output<LwMapCameraView>();
  readonly themeChange = output<string>();
  readonly qualityChange = output<LwMapQualityPreset>();
  readonly gridSizeChange = output<string>();
  readonly snapToggle = output<void>();
  readonly playerSafeToggle = output<void>();

  selectView(view: LwMapCameraView): void {
    this.viewChange.emit(view);
  }

  onThemeSelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (select?.value) {
      this.themeChange.emit(select.value);
    }
  }

  onQualitySelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (select?.value) {
      this.qualityChange.emit(select.value as LwMapQualityPreset);
    }
  }

  onGridSizeSelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (select?.value) {
      this.gridSizeChange.emit(select.value);
    }
  }
}
