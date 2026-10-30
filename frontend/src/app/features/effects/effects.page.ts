import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwAssetCardComponent,
  LwBadgeComponent,
  LwButtonComponent,
  LwPanelComponent,
  LwRulesOptionSelectorComponent,
  RulesOptionItem,
} from '../../shared/ui/public-api';
import { VttCombatService } from '../arcane-screen/services/vtt-combat.service';
import { BabylonEffectStageService } from './engine/babylon-effect-stage.service';
import {
  ActionRuleVm,
  EffectTimelinePresetVm,
} from './engine/effect-timeline.contract';

export interface ParticleEmitterCurveVm {
  readonly id: string;
  readonly name: string;
  readonly emissionRatePerSec: number;
  readonly particleLifetimeMs: number;
  readonly gravityY: number;
  readonly coneAngleDegrees: number;
  readonly startScale: number;
  readonly endScale: number;
  readonly blendMode: string;
  readonly colorStartHex: string;
  readonly colorEndHex: string;
}

const DEFAULT_EMITTER_PRESETS: readonly ParticleEmitterCurveVm[] = [
  {
    id: 'emit-solar-supernova',
    name: 'Radiant Supernova',
    emissionRatePerSec: 420,
    particleLifetimeMs: 1150,
    gravityY: -1.2,
    coneAngleDegrees: 38.0,
    startScale: 0.35,
    endScale: 2.4,
    blendMode: 'Additive',
    colorStartHex: '#ffe299',
    colorEndHex: '#ff6b4a',
  },
  {
    id: 'emit-crimson-mist',
    name: 'Crimson Blood-Mist',
    emissionRatePerSec: 280,
    particleLifetimeMs: 1600,
    gravityY: 0.4,
    coneAngleDegrees: 65.0,
    startScale: 0.5,
    endScale: 1.85,
    blendMode: 'AlphaBlend',
    colorStartHex: '#ff4d6d',
    colorEndHex: '#2b0912',
  },
  {
    id: 'emit-artificer-aether',
    name: 'Phosphor Spark',
    emissionRatePerSec: 520,
    particleLifetimeMs: 780,
    gravityY: -3.8,
    coneAngleDegrees: 24.0,
    startScale: 0.22,
    endScale: 1.15,
    blendMode: 'Additive',
    colorStartHex: '#70d6ff',
    colorEndHex: '#e5b85c',
  },
];

@Component({
  selector: 'lw-effects-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwAssetCardComponent,
    LwRulesOptionSelectorComponent,
  ],
  templateUrl: './effects.page.html',
  styleUrl: './effects.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EffectsPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('effectCanvas') private effectCanvasRef?: ElementRef<HTMLCanvasElement>;

  private readonly http = inject(HttpClient);
  readonly store = inject(LoomWeaverStoreService);
  readonly vtt = inject(VttCombatService);
  readonly stage = inject(BabylonEffectStageService);

  readonly emitterPresets = signal<readonly ParticleEmitterCurveVm[]>(DEFAULT_EMITTER_PRESETS);
  readonly customEmitterName = signal<string>('Aether Spiral');
  readonly customEmissionRate = signal<number>(480);
  readonly customLifetimeMs = signal<number>(1100);
  readonly customGravityY = signal<number>(-1.5);
  readonly customConeAngle = signal<number>(35);
  readonly customBlendMode = signal<string>('Additive');

  readonly selectedEffectId = signal<string>('fx-projectile-arc');
  readonly newActionName = signal<string>('Clockwork Arc Discharge');
  readonly newActionCost = signal<ActionRuleVm['actionCost']>('1 Action');
  readonly newActionRange = signal<number>(45);
  readonly newActionWhen = signal<string>('WHEN: Capacitor Overcharge Activated');
  readonly newActionIf = signal<string>('IF: Target within 45ft & Attack Roll >= AC');
  readonly newActionThen = signal<string>('THEN: Deal 3d10 + 4 Lightning & Apply Shocked');
  readonly newActionFormula = signal<string>('3d10 + 4');

  readonly trajectoryOptions = computed<readonly RulesOptionItem[]>(() =>
    this.vtt.effectPresets().map((p) => ({
      id: p.id,
      label: p.name,
      subtitle: `Trajectory: ${p.trajectoryType.toUpperCase()} · ${p.particleCount} Particles · ${p.durationMs}ms`,
      badge: p.trajectoryType.toUpperCase(),
      badgeTone: 'gold' as const,
    })),
  );

  readonly activeEffectPreset = computed<EffectTimelinePresetVm>(
    () =>
      this.vtt.effectPresets().find((p) => p.id === this.selectedEffectId()) ??
      this.vtt.effectPresets()[0],
  );

  readonly spellAssets = computed(() =>
    this.store.assets().filter((a) => a.category === 'Spell FX'),
  );

  ngAfterViewInit(): void {
    const canvas = this.effectCanvasRef?.nativeElement;
    if (canvas) {
      this.stage.mountStage(
        canvas,
        this.vtt.tokens().slice(0, 3),
        '1:Character:char-fivi',
        '1:Encounter:vamp-1',
      );
      this.previewEffect(this.activeEffectPreset());
    }
  }

  ngOnDestroy(): void {
    this.stage.dispose();
  }

  onSelectEffect(effectId: string): void {
    this.selectedEffectId.set(effectId);
    const found = this.vtt.effectPresets().find((p) => p.id === effectId);
    if (found) {
      this.previewEffect(found);
    }
  }

  previewEffect(preset: EffectTimelinePresetVm): void {
    this.stage.playTrajectoryEffect(preset, { x: -4, z: -5 }, { x: 5, z: 2 });
  }

  previewRule(rule: ActionRuleVm): void {
    this.selectedEffectId.set(rule.linkedEffectPresetId);
    this.previewEffect(this.activeEffectPreset());
  }

  toggleReducedMotion(): void {
    this.stage.reducedMotion.update((v) => !v);
  }

  saveNewActionRule(): void {
    this.vtt.addCustomActionRule(
      this.newActionName(),
      'Homebrew Action / Spell',
      this.newActionCost(),
      this.newActionRange(),
      this.newActionWhen(),
      this.newActionIf(),
      this.newActionThen(),
      this.newActionFormula(),
      this.selectedEffectId(),
      this.store.viewerRole() === 'gm',
    );
    this.previewEffect(this.activeEffectPreset());
  }

  constructor() {
    this.http
      .get<readonly ParticleEmitterCurveVm[]>(`/api/v2/campaigns/${this.store.activeCampaignId()}/effects/emitter-presets`)
      .subscribe({
        next: (res) => {
          if (res?.length) this.emitterPresets.set(res);
        },
        error: () => {},
      });
  }

  saveEmitterCurvePreset(): void {
    const payload: ParticleEmitterCurveVm = {
      id: `emit-${Date.now()}`,
      name: this.customEmitterName().trim() || 'Custom Emitter Curve',
      emissionRatePerSec: this.customEmissionRate(),
      particleLifetimeMs: this.customLifetimeMs(),
      gravityY: this.customGravityY(),
      coneAngleDegrees: this.customConeAngle(),
      startScale: 0.3,
      endScale: 2.1,
      blendMode: this.customBlendMode(),
      colorStartHex: '#ffe299',
      colorEndHex: '#70d6ff',
    };

    this.http
      .post<ParticleEmitterCurveVm>(`/api/v2/campaigns/${this.store.activeCampaignId()}/effects/emitter-presets`, payload)
      .subscribe({
        next: (created) => {
          this.emitterPresets.update((prev) => [created, ...prev]);
          this.previewEffect(this.activeEffectPreset());
        },
        error: () => {
          this.emitterPresets.update((prev) => [payload, ...prev]);
          this.previewEffect(this.activeEffectPreset());
        },
      });
  }
}
