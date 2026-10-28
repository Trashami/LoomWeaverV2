import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { NgpInput } from 'ng-primitives/input';
import { LayerControlsComponent } from '@effectbuilder-controls';
import { BLEND_MODES, EffectLayer, VARIANTS } from '@effectbuilder/effect-definition';
import { parseLight } from '@effectbuilder/spell-light-settings';
import catalog from '@effectbuilder/core-layer-controls.json';
import { defaultParticularForLayer, parseParticular } from '@effectbuilder/particular-settings';
import { supportsParticular } from '@effectbuilder/layer-control-profile';
import { DICE_CORE_EFFECTS, diceCoreEffect, diceCritDefinition, DiceCritCustomization } from '../../../features/dice/engine/effects/dice-core-effects';

interface SettingField { key: string; label: string; min?: number; max?: number; values?: string[]; boolean?: boolean; color?: boolean; }
const label = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
@Component({ selector: 'lw-dice-crit-editor', standalone: true,
  imports: [FormsModule, NgpButton, NgpInput, LayerControlsComponent],
  templateUrl: './dice-crit-editor.component.html', styleUrl: './dice-crit-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush })
export class DiceCritEditorComponent {
  readonly title = input.required<string>();
  readonly presetId = input.required<string>();
  readonly customization = input<DiceCritCustomization>();
  readonly changed = output<DiceCritCustomization>();
  readonly preview = output<void>();
  readonly index = signal(0);
  readonly blendModes = BLEND_MODES;
  readonly groups = [...new Set(DICE_CORE_EFFECTS.map(e => e.group))].map(name => ({ name, effects: DICE_CORE_EFFECTS.filter(e => e.group === name) }));
  readonly selected = computed(() => diceCoreEffect(this.presetId()).id);
  readonly definition = computed(() => diceCritDefinition(this.presetId(), this.customization()));
  readonly layer = computed(() => this.definition().layers[Math.min(this.index(), this.definition().layers.length - 1)]);
  readonly variants = computed(() => VARIANTS[this.layer().kind]);
  readonly light = computed(() => parseLight(this.layer().lighting));
  readonly canUseParticles = computed(() => supportsParticular(this.layer()));
  readonly settings = computed(() => Object.entries(catalog.rendererSettings).flatMap(([key, schema]) => {
    const value = (this.layer() as unknown as Record<string, unknown>)[key];
    if (!value || key === 'lighting' || key === 'aura') return [];
    return [{ key, label: label(key), fields: Object.entries(schema.fields).map(([key, spec]) => ({ key, label: label(key), ...spec } as SettingField)) }];
  }));
  readonly lightFields = [
    { key: 'intensity', label: 'Light brightness', min: 0, max: 6, step: 0.05 },
    { key: 'radiusFeet', label: 'Light radius', min: 1, max: 60, step: 1 },
    { key: 'heightFeet', label: 'Light height', min: 0.25, max: 30, step: 0.25 },
    { key: 'softness', label: 'Light softness', min: 0.05, max: 1, step: 0.05 },
    { key: 'flicker', label: 'Light flicker', min: 0, max: 1, step: 0.01 },
  ];
  choose(id: string): void { this.index.set(0); this.changed.emit({ presetId: id, definition: diceCritDefinition(id) }); }
  patch(patch: Partial<EffectLayer>): void {
    const definition = this.definition();
    const index = definition.layers.indexOf(this.layer());
    this.changed.emit({ presetId: this.presetId(), definition: { ...definition,
      layers: definition.layers.map((layer, i) => i === index ? { ...layer, ...patch } : layer) } });
  }
  settingValue(group: string, key: string): any {
    return ((this.layer() as unknown as Record<string, unknown>)[group] as Record<string, unknown>)?.[key];
  }
  patchSetting(group: string, key: string, value: unknown): void {
    const current = (this.layer() as unknown as Record<string, unknown>)[group] as Record<string, unknown>;
    this.patch({ [group]: { ...current, [key]: value } });
  }
  patchLight(key: string, value: unknown): void { this.patch({ lighting: parseLight({ ...this.light(), [key]: value }) }); }
  toggleParticles(enabled: boolean): void {
    const l = this.layer();
    this.patch({ particular: parseParticular({ ...(l.particular ?? defaultParticularForLayer(l.kind, l.variant, l.color)), enabled }, l.kind, l.variant, l.color) });
  }
}
