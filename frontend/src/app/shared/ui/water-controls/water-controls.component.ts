import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import type { WaterSplineNode } from '../../../features/maps/engine/map-scene-contract';
import {
  DEFAULT_WATER,
  WATER_PRESETS,
  WaterPresetItem,
  WaterSettings,
} from '../../../features/maps/engine/water/water-settings';

type NumericKey = Exclude<keyof WaterSettings, 'mode' | 'shallowColor' | 'deepColor'>;

interface Field {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

@Component({
  selector: 'lw-water-controls',
  standalone: true,
  imports: [NgpButton],
  templateUrl: './water-controls.component.html',
  styleUrl: './water-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwWaterControlsComponent {
  readonly settings = input<WaterSettings>(DEFAULT_WATER);
  readonly bodies = input<readonly WaterSplineNode[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly settingsChange = output<WaterSettings>();
  readonly selected = output<string>();
  readonly remove = output<void>();
  readonly clear = output<void>();
  readonly presets = WATER_PRESETS;
  readonly sections: readonly { title: string; fields: readonly Field[] }[] = [
    {
      title: 'Channel & banks',
      fields: [
        { key: 'width', label: 'Brush size / channel width', min: 1, max: 14, step: 0.25, unit: 'm' },
        { key: 'depth', label: 'Channel / basin depth', min: 0.15, max: 4, step: 0.05, unit: 'm' },
        { key: 'bankWidth', label: 'Bank blend distance', min: 0.2, max: 4, step: 0.1, unit: 'm' },
        { key: 'bankFeathering', label: 'Bank feathering', min: 0, max: 100, step: 5, unit: '%' },
      ],
    },
    {
      title: 'Flow & surface',
      fields: [
        { key: 'flowSpeed', label: 'Flow speed', min: 0, max: 5, step: 0.1, unit: 'x' },
        { key: 'intensity', label: 'Turbulence intensity', min: 0, max: 2, step: 0.05 },
        { key: 'waveHeight', label: 'Wave height', min: 0, max: 0.18, step: 0.005, unit: 'm' },
        { key: 'waveScale', label: 'Ripple detail', min: 0.5, max: 8, step: 0.1 },
        { key: 'foam', label: 'Shore & rapid foam', min: 0, max: 1, step: 0.05 },
      ],
    },
    {
      title: 'Water appearance',
      fields: [
        { key: 'opacity', label: 'Opacity', min: 0.2, max: 1, step: 0.05 },
        { key: 'reflectivity', label: 'Reflectivity', min: 0, max: 1, step: 0.05 },
        { key: 'refraction', label: 'Refraction distortion', min: 0, max: 0.3, step: 0.01 },
      ],
    },
    {
      title: 'Waterfalls',
      fields: [
        { key: 'waterfallSlope', label: 'Fall slope threshold', min: 0.2, max: 2, step: 0.05 },
        { key: 'spray', label: 'Splash & mist', min: 0, max: 1, step: 0.05 },
      ],
    },
  ];

  patch(change: Partial<WaterSettings>): void {
    this.settingsChange.emit({ ...this.settings(), ...change });
  }

  applyPreset(preset: WaterPresetItem): void {
    const cur = this.settings();
    this.settingsChange.emit({
      ...preset.settings,
      width: cur.width,
      bankWidth: cur.bankWidth,
      bankFeathering: cur.bankFeathering,
    });
  }

  isPresetActive(preset: WaterPresetItem): boolean {
    const cur = this.settings();
    const p = preset.settings;
    return (
      cur.mode === p.mode &&
      cur.shallowColor.toLowerCase() === p.shallowColor.toLowerCase() &&
      cur.deepColor.toLowerCase() === p.deepColor.toLowerCase() &&
      Math.abs(cur.flowSpeed - p.flowSpeed) < 0.15 &&
      Math.abs(cur.foam - p.foam) < 0.12
    );
  }

  numeric(key: NumericKey): number {
    return this.settings()[key];
  }

  changeNumber(key: NumericKey, event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    if (key === 'flowSpeed' && val > 0 && this.settings().mode === 'pond') {
      this.patch({ mode: 'river', flowSpeed: val });
      return;
    }
    this.patch({ [key]: val });
  }

  changeColor(key: 'shallowColor' | 'deepColor', event: Event): void {
    this.patch({ [key]: (event.target as HTMLInputElement).value });
  }

  selectBody(event: Event): void {
    this.selected.emit((event.target as HTMLSelectElement).value);
  }
}
