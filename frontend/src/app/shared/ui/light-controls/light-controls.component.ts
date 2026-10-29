import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import {
  AOE_PRESETS,
  DEFAULT_LIGHT_SETTINGS,
  LightPreset,
  LightSettings,
  MapLightKind,
  POINT_LIGHT_PRESETS,
  SPOT_LIGHT_PRESETS,
  lightElevationStep,
} from '../../../features/maps/engine/lighting/light-settings';

type NumericKey = {
  [K in keyof LightSettings]: LightSettings[K] extends number ? K : never;
}[keyof LightSettings];

interface Field {
  readonly key: NumericKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit?: string;
}

interface Section {
  readonly title: string;
  readonly fields: readonly Field[];
}

const KIND_LABELS: Readonly<Record<MapLightKind, string>> = {
  point: 'Point',
  spot: 'Spot / area',
  aoe: 'Ambient effect',
};

const FALLOFF_HELP =
  'Linear fades evenly to the edge. Natural drops off sharply near the source like a real lamp.';

@Component({
  selector: 'lw-light-controls',
  standalone: true,
  imports: [NgpButton],
  templateUrl: './light-controls.component.html',
  styleUrl: './light-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwLightControlsComponent {
  readonly settings = input<LightSettings>(DEFAULT_LIGHT_SETTINGS);
  readonly snapToGrid = input<boolean>(true);
  readonly hasSelection = input<boolean>(false);
  readonly settingsChange = output<Partial<LightSettings>>();
  readonly remove = output<void>();

  readonly kinds = (Object.keys(KIND_LABELS) as MapLightKind[]).map((id) => ({ id, label: KIND_LABELS[id] }));
  readonly falloffHelp = FALLOFF_HELP;
  readonly elevationStep = computed(() => lightElevationStep(this.snapToGrid()));
  readonly presets = computed<readonly LightPreset[]>(() => {
    const kind = this.settings().kind;
    return kind === 'spot' ? SPOT_LIGHT_PRESETS : kind === 'aoe' ? AOE_PRESETS : POINT_LIGHT_PRESETS;
  });

  readonly lightFields: readonly Section[] = [
    {
      title: 'Primary light',
      fields: [
        { key: 'range', label: 'Radius', min: 1, max: 80, step: 1, unit: 'm' },
        { key: 'intensity', label: 'Intensity', min: 0, max: 4, step: 0.05 },
        { key: 'featherPct', label: 'Gradient / feathering', min: 0, max: 100, step: 5, unit: '%' },
      ],
    },
    {
      title: 'Core light',
      fields: [
        { key: 'coreIntensity', label: 'Core intensity', min: 0, max: 3, step: 0.05 },
        { key: 'coreRadiusPct', label: 'Core size', min: 5, max: 60, step: 1, unit: '%' },
      ],
    },
  ];

  readonly coneFields: readonly Field[] = [
    { key: 'coneAngleDeg', label: 'Beam width', min: 5, max: 180, step: 1, unit: 'deg' },
    { key: 'coneSoftnessPct', label: 'Beam edge softness', min: 0, max: 100, step: 5, unit: '%' },
    { key: 'aimYawDeg', label: 'Aim direction', min: -180, max: 180, step: 5, unit: 'deg' },
    { key: 'aimPitchDeg', label: 'Aim up / down', min: -90, max: 90, step: 5, unit: 'deg' },
  ];

  readonly shadowFields: readonly Field[] = [
    { key: 'shadowStrengthPct', label: 'Shadow strength', min: 0, max: 100, step: 5, unit: '%' },
  ];

  readonly effectFields: readonly Field[] = [
    { key: 'effectCount', label: 'Particle count', min: 1, max: 200, step: 1 },
    { key: 'effectSizeM', label: 'Particle size', min: 0.02, max: 1.5, step: 0.02, unit: 'm' },
    { key: 'effectSpeed', label: 'Speed', min: 0, max: 3, step: 0.05, unit: 'x' },
    { key: 'effectSpreadM', label: 'Spread', min: 0.2, max: 12, step: 0.1, unit: 'm' },
  ];

  readonly effects = [
    { id: 'glow', label: 'Soft glow' },
    { id: 'fireflies', label: 'Fireflies' },
    { id: 'sparkles', label: 'Sparkles' },
    { id: 'motes', label: 'Motes' },
    { id: 'firework', label: 'Firework' },
  ] as const;

  patch(change: Partial<LightSettings>): void {
    this.settingsChange.emit(change);
  }

  numeric(key: NumericKey): number {
    return this.settings()[key];
  }

  display(key: NumericKey): string {
    const v = this.numeric(key);
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  changeNumber(key: NumericKey, event: Event): void {
    this.patch({ [key]: Number((event.target as HTMLInputElement).value) });
  }

  changeText(key: 'colorHex' | 'coreColorHex' | 'effectColorHex', event: Event): void {
    this.patch({ [key]: (event.target as HTMLInputElement).value });
  }

  changeFalloff(event: Event): void {
    this.patch({ falloff: (event.target as HTMLSelectElement).value as LightSettings['falloff'] });
  }

  changeShadow(event: Event): void {
    this.patch({ shadowMode: (event.target as HTMLSelectElement).value as LightSettings['shadowMode'] });
  }
}
