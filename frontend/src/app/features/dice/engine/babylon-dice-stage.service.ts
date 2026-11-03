import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, NgZone, signal } from '@angular/core';
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, GlowLayer,
  HemisphericLight, LinesMesh, Mesh, PointLight, Scene, Vector3,
} from '@babylonjs/core';
import { EffectDefinition } from '@effectbuilder/effect-definition';
import { AuthSessionService } from '../../../core/services/auth-session.service';
import { DiceSoundService } from './audio';
import { DEFAULT_DICE_PHYSICS_CONFIG, DicePhysicsConfig } from './dice-physics.types';
import {
  createDieContactShadowDisc, createPhysicsBoxTrajectoryPlans,
  DiePhysicsTrajectoryPlan, evaluateDieTrajectoryStep,
} from './dice-physics-trajectory';
import {
  buildServerLoadoutPayload, createDiceBoundaryWireframe,
  normalizeCustomRuntimeConfig, readStoredActiveDiceConfig, writeStoredActiveDiceConfig,
} from './dice-user-preferences.helper';
import { viewportTray } from './dice-viewport-tray';
import { DiceCritEffectsRunner, resolveCritFailEffect, resolveNat20Effect } from './effects';
import { loadLocalEffectBuilderDraft, registerSavedEffectBuilderEffects } from './effects/dice-core-effects';
import {
  applyVeinPulseToDieMaterials, buildBabylonPolyhedralDie, BuiltBabylonDieInstance,
  disposeDieMaterials, hexToColor3, preloadDiceSurfaceAssets,
} from './materials';
import { diceHaloColor } from './materials/dice-light.plugin';
import {
  DICE_SIZE_SCALE_MAP, DicePolyhedronType, FACE_VALUES, getRotationForTopValue, resolveDiceModel,
} from './models';
import {
  createDefaultRuntimeConfigFromSkin, DiceCustomRuntimeConfig, DiceSkinConfig, resolveDiceSkin,
} from './skins';

export interface DiceSkinPresetPayload {
  id: string; name: string; materialFamily: string; baseColorHex: string;
  accentColorHex: string; roughness: number; metalness: number; particleColorHex: string;
}

export interface CritScreenVignetteState {
  readonly outcome: 'nat20' | 'critfail' | null;
  readonly intensity: number;
  readonly spread: number;
}

const SHOWCASE_DIE_TYPES: DicePolyhedronType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

@Injectable({ providedIn: 'root' })
export class BabylonDiceStageService {
  private readonly ngZone = inject(NgZone);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthSessionService);
  private readonly soundService = inject(DiceSoundService);
  private readonly critEffectsRunner = new DiceCritEffectsRunner();

  readonly stageMode = signal<'showcase' | 'rolled'>('showcase');
  readonly cameraReadout = signal<{ pitchDeg: number; yawDeg: number; distance: number }>({
    pitchDeg: 58, yawDeg: -90, distance: 11.8,
  });
  readonly critVignetteState = signal<CritScreenVignetteState>({ outcome: null, intensity: 0.78, spread: 0.45 });

  private pendingRebuild = false;
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private glowLayer: GlowLayer | null = null;
  private hemiLight: HemisphericLight | null = null;
  private dirLight: DirectionalLight | null = null;
  private accentPointLight: PointLight | null = null;
  private boundaryWireframe: LinesMesh | null = null;

  private activeDice: BuiltBabylonDieInstance[] = [];
  private activeShadows: Mesh[] = [];
  private activeBadges: Mesh[] = [];
  private currentSkin: DiceSkinConfig = resolveDiceSkin('skin-obsidian-gold');
  private currentCustom: DiceCustomRuntimeConfig = createDefaultRuntimeConfigFromSkin(this.currentSkin);
  private hasLoadedUserConfig = false;
  private focusDieType: DicePolyhedronType | 'all' = 'all';
  private isRolling = false;
  private rollAnimationTimer: number | null = null;
  private rebuildTimer: number | null = null;
  private vignetteTimer: number | null = null;
  private configListeners: Array<(custom: DiceCustomRuntimeConfig, skin: DiceSkinConfig) => void> = [];
  private resizeHandler = () => this.engine?.resize();

  constructor() {
    this.hydrateFromLocalPreference();
    loadLocalEffectBuilderDraft();
    effect(() => {
      const userId = this.resolveCurrentUserId();
      this.hydrateFromLocalPreference(userId);
      if (this.auth.isAuthenticated()) {
        this.syncUserPreferencesFromServer(1, userId);
        this.syncEffectBuilderLibraryFromServer();
      }
    });
  }

  private resolveCurrentUserId(): string | null {
    const profile = this.auth.activeProfile();
    return profile?.accountId || profile?.username || null;
  }

  onActiveConfigChanged(listener: (custom: DiceCustomRuntimeConfig, skin: DiceSkinConfig) => void): void {
    this.configListeners.push(listener);
    listener(this.getCurrentCustomConfig(), this.currentSkin);
  }

  private notifyConfigListeners(): void {
    const snap = this.getCurrentCustomConfig();
    for (const listener of this.configListeners) listener(snap, this.currentSkin);
  }

  hydrateFromLocalPreference(userId?: number | string | null): void {
    const uid = userId ?? this.resolveCurrentUserId();
    const stored = readStoredActiveDiceConfig(uid);
    if (stored) {
      this.currentSkin = resolveDiceSkin(stored.skinId);
      this.currentCustom = stored;
      this.hasLoadedUserConfig = true;
      this.syncStageLightingAndRebuild();
      this.notifyConfigListeners();
    }
  }

  syncUserPreferencesFromServer(campaignId = 1, userId?: number | string | null): void {
    const uid = userId ?? this.resolveCurrentUserId();
    this.http
      .get<{ activeLoadout?: Record<string, unknown> & { skinId?: string; customConfig?: unknown }; activeCustomConfig?: unknown }>(
        `/api/v2/campaigns/${campaignId}/dice-forge/state`
      )
      .subscribe({
        next: state => {
          const raw = state?.activeCustomConfig ?? state?.activeLoadout?.customConfig ??
            (!this.hasLoadedUserConfig && state?.activeLoadout?.skinId
              ? { ...createDefaultRuntimeConfigFromSkin(resolveDiceSkin(state.activeLoadout.skinId)), ...state.activeLoadout }
              : null);
          const resolved = normalizeCustomRuntimeConfig(raw);
          if (resolved) {
            this.currentSkin = resolveDiceSkin(resolved.skinId);
            this.currentCustom = resolved;
            this.hasLoadedUserConfig = true;
            writeStoredActiveDiceConfig(resolved, uid);
            this.syncStageLightingAndRebuild();
            this.notifyConfigListeners();
          }
        },
        error: () => {},
      });
  }

  syncEffectBuilderLibraryFromServer(): void {
    this.http.get<EffectDefinition[]>('/api/v2/effects/library').subscribe({
      next: library => {
        if (Array.isArray(library) && library.length > 0) {
          registerSavedEffectBuilderEffects(library);
          loadLocalEffectBuilderDraft();
        }
      },
      error: () => {},
    });
  }

  persistActiveUserDicePreference(config?: DiceCustomRuntimeConfig, campaignId = 1): void {
    const next = normalizeCustomRuntimeConfig(config ?? this.currentCustom) ?? this.currentCustom;
    this.currentSkin = resolveDiceSkin(next.skinId);
    this.currentCustom = next;
    this.hasLoadedUserConfig = true;
    writeStoredActiveDiceConfig(next, this.resolveCurrentUserId());
    this.notifyConfigListeners();
    this.http.put(`/api/v2/campaigns/${campaignId}/dice-forge/loadout`, buildServerLoadoutPayload(next)).subscribe({ error: () => {} });
  }

  triggerCritScreenVignette(outcome: 'nat20' | 'critfail'): void {
    if (!(this.currentCustom.critVignetteEnabled ?? true)) return;
    if (this.vignetteTimer !== null) clearTimeout(this.vignetteTimer);
    this.critVignetteState.set({
      outcome,
      intensity: Math.max(0.15, Math.min(1, this.currentCustom.critVignetteIntensity ?? 0.78)),
      spread: Math.max(0.2, Math.min(0.85, this.currentCustom.critVignetteSpread ?? 0.45)),
    });
    this.vignetteTimer = window.setTimeout(() => {
      this.vignetteTimer = null;
      this.critVignetteState.update(s => ({ ...s, outcome: null }));
    }, 2400);
  }

  mountStage(canvas: HTMLCanvasElement, initialSkinIdOrPreset?: string | DiceSkinPresetPayload): void {
    this.dispose();
    if (!this.hasLoadedUserConfig) this.hydrateFromLocalPreference();
    if (!this.hasLoadedUserConfig && initialSkinIdOrPreset) {
      const skinId = typeof initialSkinIdOrPreset === 'string' ? initialSkinIdOrPreset : initialSkinIdOrPreset?.id;
      this.currentSkin = resolveDiceSkin(skinId);
      this.currentCustom = createDefaultRuntimeConfigFromSkin(this.currentSkin);
    }

    this.ngZone.runOutsideAngular(() => {
      this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
      const scene = new Scene(this.engine);
      scene.clearColor = new Color4(0.02, 0.055, 0.042, 1.0);
      this.scene = scene;

      const camera = new ArcRotateCamera('lw-dice-cam', -Math.PI / 2, Math.PI / 2.8, 10.5, Vector3.Zero(), scene);
      camera.lowerRadiusLimit = 3.2; camera.upperRadiusLimit = 32.0;
      camera.lowerBetaLimit = 0.02; camera.upperBetaLimit = Math.PI - 0.02;
      camera.wheelPrecision = 28; camera.panningSensibility = 75;
      camera.attachControl(canvas, true);
      this.camera = camera;

      const hemi = new HemisphericLight('lw-dice-hemi', new Vector3(0, 1, 0), scene);
      hemi.intensity = 0.88; hemi.groundColor = new Color3(0.06, 0.14, 0.1);
      this.hemiLight = hemi;

      const dirLight = new DirectionalLight('lw-dice-dir', new Vector3(-0.45, -1, 0.35), scene);
      dirLight.position = new Vector3(6, 12, -6); dirLight.intensity = 1.18;
      this.dirLight = dirLight;

      const pointLight = new PointLight('lw-dice-accent', new Vector3(0, 6.5, 0), scene);
      pointLight.intensity = 0.85; pointLight.diffuse = hexToColor3(this.currentCustom.glowColorHex);
      this.accentPointLight = pointLight;

      this.glowLayer = new GlowLayer('lw-dice-glow', scene, { mainTextureSamples: 1, blurKernelSize: 16 });
      this.glowLayer.customEmissiveColorSelector = (_mesh, _subMesh, material, result) => diceHaloColor(material, result);
      this.glowLayer.intensity = 0.22 * this.currentCustom.glowIntensity;

      this.updateBoundaryWireframe();
      this.rebuildShowcaseDice();
      void preloadDiceSurfaceAssets().then(() => { if (this.scene) this.syncStageLightingAndRebuild(); });

      const startClock = performance.now();
      this.engine.runRenderLoop(() => {
        if (!this.scene) return;
        const elapsedSec = (performance.now() - startClock) * 0.001;
        for (let i = 0; i < this.activeDice.length; i++) {
          applyVeinPulseToDieMaterials(this.activeDice[i].faceMaterials, this.currentSkin, this.currentCustom, elapsedSec);
        }
        this.scene.render();
      });
      window.addEventListener('resize', this.resizeHandler);
    });
  }

  getCurrentCustomConfig(): DiceCustomRuntimeConfig {
    return { ...this.currentCustom, physics: { ...(this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG) } };
  }

  applySkin(skinOrPreset: DiceSkinConfig | DiceSkinPresetPayload | string): DiceCustomRuntimeConfig {
    const id = typeof skinOrPreset === 'string' ? skinOrPreset : skinOrPreset.id;
    const prevPhysics = this.currentCustom?.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    this.currentSkin = resolveDiceSkin(id);
    this.currentCustom = { ...createDefaultRuntimeConfigFromSkin(this.currentSkin), physics: { ...prevPhysics } };
    this.hasLoadedUserConfig = true;
    writeStoredActiveDiceConfig(this.currentCustom, this.resolveCurrentUserId());
    this.syncStageLightingAndRebuild();
    this.notifyConfigListeners();
    return this.getCurrentCustomConfig();
  }

  applyCustomOverrides(overrides: Partial<DiceCustomRuntimeConfig>): DiceCustomRuntimeConfig {
    const nonVisual = new Set([
      'nat20EffectId', 'critFailEffectId', 'nat20Customization', 'critFailCustomization',
      'critBurstIntensity', 'critRingScale', 'critVignetteEnabled', 'critVignetteIntensity',
      'critVignetteSpread', 'soundProfileId', 'customName',
    ]);
    const needsRebuild = Object.keys(overrides).some(key => !nonVisual.has(key));
    if (overrides.skinId && overrides.skinId !== this.currentSkin.id) this.currentSkin = resolveDiceSkin(overrides.skinId);
    const mergedPhysics: DicePhysicsConfig = { ...(this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG), ...(overrides.physics ?? {}) };
    this.currentCustom = { ...this.currentCustom, ...overrides, skinId: this.currentSkin.id, physics: mergedPhysics };
    this.hasLoadedUserConfig = true;
    writeStoredActiveDiceConfig(this.currentCustom, this.resolveCurrentUserId());
    this.notifyConfigListeners();
    if (needsRebuild) {
      if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => { this.rebuildTimer = null; this.syncStageLightingAndRebuild(); }, 80);
    }
    return this.getCurrentCustomConfig();
  }

  setShowcaseFocusDie(focus: DicePolyhedronType | 'all'): void {
    this.focusDieType = focus; this.stageMode.set('showcase');
    if (!this.isRolling) { this.resetCameraToShowcase(); this.rebuildShowcaseDice(); }
  }

  clearRollAndReturnToShowcase(): void {
    if (this.rollAnimationTimer !== null) { cancelAnimationFrame(this.rollAnimationTimer); this.rollAnimationTimer = null; }
    this.isRolling = false; this.stageMode.set('showcase');
    this.resetCameraToShowcase(); this.rebuildShowcaseDice();
  }

  resetCameraToShowcase(): void {
    if (!this.camera) return;
    this.camera.target = Vector3.Zero(); this.camera.alpha = -Math.PI / 2;
    this.camera.beta = Math.PI / 2.65; this.camera.radius = this.focusDieType === 'all' ? 11.8 : 7.4;
  }

  applyRollCameraView(pitchDeg?: number, yawDeg?: number, distance?: number): void {
    if (!this.camera) return;
    const phys = this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    const pitch = Math.max(5, Math.min(89, pitchDeg ?? phys.rollCameraPitchDeg ?? 84));
    const yaw = yawDeg ?? phys.rollCameraYawDeg ?? -90;
    const dist = Math.max(6, Math.min(30, distance ?? phys.rollCameraDistance ?? 15.5));
    this.camera.target = Vector3.Zero();
    this.camera.beta = Math.max(0.04, ((90 - pitch) * Math.PI) / 180);
    this.camera.alpha = (yaw * Math.PI) / 180;
    this.camera.radius = dist;
    this.cameraReadout.set({ pitchDeg: pitch, yawDeg: yaw, distance: dist });
  }

  zoomCamera(deltaRadius: number): void {
    if (this.camera) this.camera.radius = Math.max(3.5, Math.min(30, this.camera.radius + deltaRadius));
  }

  previewCritOutcomeEffect(outcomeKind: 'nat20' | 'critfail'): void {
    this.triggerCritScreenVignette(outcomeKind);
    if (!this.scene) return;
    const origin = this.activeDice[0]?.mesh.position.clone() ?? new Vector3(0, 0.35, 0);
    const scaleBoost = this.currentCustom.critBurstIntensity ?? 1.0;
    const preset = outcomeKind === 'nat20' ? resolveNat20Effect(this.currentCustom.nat20EffectId) : resolveCritFailEffect(this.currentCustom.critFailEffectId);
    const cust = outcomeKind === 'nat20' ? this.currentCustom.nat20Customization : this.currentCustom.critFailCustomization;
    this.critEffectsRunner.triggerCritEffect(preset, origin, this.scene, this.glowLayer, (outcomeKind === 'nat20' ? 0.55 : 0.45) * scaleBoost, cust);
  }

  animatePoolRoll(
    entries: ReadonlyArray<{ dieType: DicePolyhedronType; value: number }>,
    isCriticalSuccess: boolean,
    isCriticalFailure: boolean,
    onSettled?: () => void
  ): void {
    if (!this.scene || !entries.length) { onSettled?.(); return; }
    if (this.rollAnimationTimer !== null) { cancelAnimationFrame(this.rollAnimationTimer); this.rollAnimationTimer = null; }
    const phys = this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    if (phys.suspendSimulation) { onSettled?.(); return; }

    this.clearFloatingBadges();
    this.critEffectsRunner.clearActiveEffects();
    this.isRolling = true;
    this.stageMode.set('rolled');
    this.applyRollCameraView(phys.rollCameraPitchDeg, phys.rollCameraYawDeg, phys.rollCameraDistance);
    this.clearActiveDice();

    const model = resolveDiceModel(this.currentCustom.modelId);
    const physicsScale = (phys.scale ?? 5) / 5;
    const sizeScale = (DICE_SIZE_SCALE_MAP[this.currentCustom.sizePreset] ?? 1.0) * (model.scaleMultiplier ?? 1.0) * physicsScale;
    const planEntries = entries.map(e => ({ dieType: e.dieType, targetValue: e.value }));

    for (let i = 0; i < entries.length; i++) {
      const built = buildBabylonPolyhedralDie(`lw-roll-die-${i}`, entries[i].dieType, this.currentSkin, this.currentCustom, model, this.scene);
      this.activeDice.push(built);
      if (phys.enableShadows) this.activeShadows.push(createDieContactShadowDisc(i, sizeScale, this.scene, phys.shadowTransparency ?? 0.8));
    }

    const plans: DiePhysicsTrajectoryPlan[] = createPhysicsBoxTrajectoryPlans(
      planEntries.map((entry, i) => ({ ...entry, collisionVertices: Array.from(this.activeDice[i].builtGeometry.vertexData.positions!) })),
      sizeScale,
      viewportTray(phys, this.scene.activeCamera, this.engine!.getRenderWidth() / this.engine!.getRenderHeight())
    );
    this.activeDice.forEach((die, i) => {
      die.mesh.position.copyFrom(plans[i].startPos);
      die.mesh.rotationQuaternion = plans[i].startQuat.clone();
    });
    this.soundService.playRollStartClatter(this.currentCustom.soundProfileId, entries.length);
    let startTime: number | null = null;
    const baseDuration = plans[0]?.durationMs ?? 1050;
    const totalDuration = Math.max(...plans.map(plan => (plan.durationMs ?? baseDuration) + (plan.delayMs ?? 0)));

    const step = (now: number) => {
      if (!this.scene) return;
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;

      for (let i = 0; i < this.activeDice.length; i++) {
        const dDelay = plans[i].delayMs ?? 0;
        const t = Math.min(1, Math.max(0, elapsed - dDelay) / (plans[i].durationMs ?? baseDuration));
        const pose = evaluateDieTrajectoryStep(plans[i], t, sizeScale, intensity => {
          if (i <= 2) this.soundService.playBounceImpact(this.currentCustom.soundProfileId, intensity);
        });
        if (i === 0 && t < 1) {
          const previous = this.activeDice[i].mesh.rotationQuaternion;
          const q = pose.rotationQuaternion;
          const dot = previous ? Math.abs(previous.x * q.x + previous.y * q.y + previous.z * q.z + previous.w * q.w) : 1;
          this.soundService.playTumbleResonance(this.currentCustom.soundProfileId, (2 * Math.acos(Math.min(1, dot))) / 0.016);
        }
        this.activeDice[i].mesh.position.copyFrom(pose.position);
        this.activeDice[i].mesh.rotationQuaternion = pose.rotationQuaternion;

        const shadow = this.activeShadows[i];
        if (shadow) {
          const h = Math.max(0, pose.position.y - plans[i].endPos.y);
          shadow.position.x = pose.position.x + 0.1 + h * 0.06;
          shadow.position.z = pose.position.z - 0.1 - h * 0.06;
          const sc = 1 + h * 0.14;
          shadow.scaling.set(sc, 1, sc);
        }
      }

      if (elapsed < totalDuration) {
        this.rollAnimationTimer = window.requestAnimationFrame(step);
      } else {
        this.isRolling = false;
        this.rollAnimationTimer = null;
        this.soundService.playSettleChime(this.currentCustom.soundProfileId);
        if (this.pendingRebuild) this.syncStageLightingAndRebuild();
        if (isCriticalSuccess) this.previewCritOutcomeEffect('nat20');
        else if (isCriticalFailure) this.previewCritOutcomeEffect('critfail');
        onSettled?.();
      }
    };
    this.rollAnimationTimer = window.requestAnimationFrame(step);
  }

  animateRoll(expression: string, diceResults: number[], isCriticalSuccess: boolean, isCriticalFailure: boolean): void {
    const match = /d(100|20|12|10|8|6|4)\b/i.exec(expression || '1d20');
    const dieType: DicePolyhedronType = match ? (`d${match[1]}` as DicePolyhedronType) : 'd20';
    const vals = diceResults.length > 0 ? diceResults : [20];
    this.animatePoolRoll(vals.map(v => ({ dieType, value: v })), isCriticalSuccess, isCriticalFailure);
  }

  dispose(): void {
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
    window.removeEventListener('resize', this.resizeHandler);
    if (this.rollAnimationTimer !== null) cancelAnimationFrame(this.rollAnimationTimer);
    this.rollAnimationTimer = null;
    this.critEffectsRunner.clearActiveEffects();
    this.clearFloatingBadges();
    this.clearActiveDice();
    this.boundaryWireframe?.dispose(); this.boundaryWireframe = null;
    this.scene?.dispose(); this.engine?.dispose();
    this.scene = null; this.engine = null; this.camera = null;
  }

  private syncStageLightingAndRebuild(): void {
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
    if (!this.scene) return;
    const phys = this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    const lightMult = Math.max(0.2, Math.min(3.0, phys.lightIntensity ?? 1.0));
    const glowColor = hexToColor3(this.currentCustom.glowColorHex || this.currentSkin.emissiveColor);
    if (this.hemiLight) this.hemiLight.intensity = 0.88 * lightMult;
    if (this.dirLight) this.dirLight.intensity = 1.18 * lightMult;
    if (this.accentPointLight) { this.accentPointLight.diffuse = glowColor; this.accentPointLight.intensity = 0.85 * lightMult; }
    if (this.glowLayer) this.glowLayer.intensity = 0.22 * this.currentCustom.glowIntensity;
    this.updateBoundaryWireframe();
    if (this.isRolling) { this.pendingRebuild = true; return; }
    this.pendingRebuild = false;
    if (this.stageMode() === 'showcase') this.rebuildShowcaseDice();
    else {
      const model = resolveDiceModel(this.currentCustom.modelId);
      this.activeDice = this.activeDice.map(previous => {
        const next = buildBabylonPolyhedralDie(previous.mesh.name, previous.dieType, this.currentSkin, this.currentCustom, model, this.scene!);
        next.mesh.position.copyFrom(previous.mesh.position);
        next.mesh.rotation.copyFrom(previous.mesh.rotation);
        next.mesh.rotationQuaternion = previous.mesh.rotationQuaternion?.clone() ?? null;
        next.mesh.scaling.copyFrom(previous.mesh.scaling);
        disposeDieMaterials(previous);
        previous.mesh.dispose();
        return next;
      });
    }
  }

  private updateBoundaryWireframe(): void {
    if (!this.scene) return;
    this.boundaryWireframe?.dispose();
    this.boundaryWireframe = createDiceBoundaryWireframe(this.scene, this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG);
  }

  private rebuildShowcaseDice(): void {
    if (!this.scene) return;
    this.clearFloatingBadges();
    this.clearActiveDice();
    const model = resolveDiceModel(this.currentCustom.modelId);
    const types = this.focusDieType === 'all' ? SHOWCASE_DIE_TYPES : [this.focusDieType];
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const built = buildBabylonPolyhedralDie(`lw-showcase-${type}`, type, this.currentSkin, this.currentCustom, model, this.scene);
      if (types.length === 1) {
        built.mesh.position = Vector3.Zero();
        built.mesh.scaling.setAll(1.48);
      } else {
        const angle = (i / types.length) * Math.PI * 2 - Math.PI / 2;
        built.mesh.position = new Vector3(Math.cos(angle) * 3.15, 0, Math.sin(angle) * 3.15);
      }
      const topQuat = getRotationForTopValue(type, Math.max(...FACE_VALUES[type]));
      built.mesh.rotation = topQuat.toEulerAngles();
      built.mesh.rotationQuaternion = null;
      this.activeDice.push(built);
    }
  }

  private clearActiveDice(): void {
    for (const d of this.activeDice) { disposeDieMaterials(d); d.mesh.dispose(); }
    for (const s of this.activeShadows) { s.material?.dispose(); s.dispose(); }
    this.activeDice = []; this.activeShadows = [];
  }

  private clearFloatingBadges(): void {
    for (const badge of this.activeBadges) { badge.material?.dispose(); badge.dispose(); }
    this.activeBadges = [];
  }
}
