import { inject, Injectable, NgZone, signal } from '@angular/core';
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  LinesMesh,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { DiceSoundService } from './audio';
import { DEFAULT_DICE_PHYSICS_CONFIG, DicePhysicsConfig } from './dice-physics.types';
import {
  createDieContactShadowDisc,
  createPhysicsBoxTrajectoryPlans,
  DiePhysicsTrajectoryPlan,
  evaluateDieTrajectoryStep,
} from './dice-physics-trajectory';
import { DiceCritEffectsRunner, resolveCritFailEffect, resolveNat20Effect } from './effects';
import {
  applyVeinPulseToDieMaterials,
  buildBabylonPolyhedralDie,
  BuiltBabylonDieInstance,
  disposeDieMaterials,
  hexToColor3,
  preloadDiceSurfaceAssets,
} from './materials';
import {
  DICE_SIZE_SCALE_MAP,
  DicePolyhedronType,
  FACE_VALUES,
  getRotationForTopValue,
  resolveDiceModel,
} from './models';
import {
  createDefaultRuntimeConfigFromSkin,
  DiceCustomRuntimeConfig,
  DiceSkinConfig,
  resolveDiceSkin,
} from './skins';

export interface DiceSkinPresetPayload {
  id: string;
  name: string;
  materialFamily: string;
  baseColorHex: string;
  accentColorHex: string;
  roughness: number;
  metalness: number;
  particleColorHex: string;
}

const SHOWCASE_DIE_TYPES: DicePolyhedronType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

@Injectable({ providedIn: 'root' })
export class BabylonDiceStageService {
  private readonly ngZone = inject(NgZone);
  private readonly soundService = inject(DiceSoundService);
  private readonly critEffectsRunner = new DiceCritEffectsRunner();

  readonly stageMode = signal<'showcase' | 'rolled'>('showcase');
  readonly cameraReadout = signal<{ pitchDeg: number; yawDeg: number; distance: number }>({
    pitchDeg: 58,
    yawDeg: -90,
    distance: 11.8,
  });

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
  private focusDieType: DicePolyhedronType | 'all' = 'all';
  private isRolling = false;
  private rollAnimationTimer: number | null = null;
  private resizeHandler = () => this.engine?.resize();

  mountStage(canvas: HTMLCanvasElement, initialSkinIdOrPreset?: string | DiceSkinPresetPayload): void {
    this.dispose();
    const skinId = typeof initialSkinIdOrPreset === 'string' ? initialSkinIdOrPreset : initialSkinIdOrPreset?.id;
    this.currentSkin = resolveDiceSkin(skinId);
    this.currentCustom = createDefaultRuntimeConfigFromSkin(this.currentSkin);

    this.ngZone.runOutsideAngular(() => {
      this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
      const scene = new Scene(this.engine);
      scene.clearColor = new Color4(0.02, 0.055, 0.042, 1.0);
      this.scene = scene;

      // Full 360-degree rotation + zoom + pan around the stationary dice (no floor plane mesh)
      const camera = new ArcRotateCamera('lw-dice-cam', -Math.PI / 2, Math.PI / 2.8, 10.5, Vector3.Zero(), scene);
      camera.lowerRadiusLimit = 3.2;
      camera.upperRadiusLimit = 32.0;
      camera.lowerBetaLimit = 0.02;
      camera.upperBetaLimit = Math.PI - 0.02;
      camera.wheelPrecision = 28;
      camera.panningSensibility = 75;
      camera.attachControl(canvas, true);
      this.camera = camera;

      const hemi = new HemisphericLight('lw-dice-hemi', new Vector3(0, 1, 0), scene);
      hemi.intensity = 0.88;
      hemi.groundColor = new Color3(0.06, 0.14, 0.1);
      this.hemiLight = hemi;

      const dirLight = new DirectionalLight('lw-dice-dir', new Vector3(-0.45, -1, 0.35), scene);
      dirLight.position = new Vector3(6, 12, -6);
      dirLight.intensity = 1.18;
      this.dirLight = dirLight;

      const pointLight = new PointLight('lw-dice-accent', new Vector3(0, 6.5, 0), scene);
      pointLight.intensity = 0.85;
      pointLight.diffuse = hexToColor3(this.currentCustom.glowColorHex);
      this.accentPointLight = pointLight;

      this.glowLayer = new GlowLayer('lw-dice-glow', scene, { mainTextureSamples: 4, blurKernelSize: 32 });
      this.glowLayer.intensity = 0.48 * this.currentCustom.glowIntensity;

      this.updateBoundaryWireframe();
      this.rebuildShowcaseDice();

      void preloadDiceSurfaceAssets().then(() => {
        if (this.scene && !this.isRolling && this.stageMode() === 'showcase') {
          this.rebuildShowcaseDice();
        }
      });

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
    return {
      ...this.currentCustom,
      physics: { ...(this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG) },
    };
  }

  applySkin(skinOrPreset: DiceSkinConfig | DiceSkinPresetPayload | string): DiceCustomRuntimeConfig {
    const id = typeof skinOrPreset === 'string' ? skinOrPreset : skinOrPreset.id;
    const prevPhysics = this.currentCustom?.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    this.currentSkin = resolveDiceSkin(id);
    this.currentCustom = {
      ...createDefaultRuntimeConfigFromSkin(this.currentSkin),
      physics: { ...prevPhysics },
    };
    this.syncStageLightingAndRebuild();
    return this.getCurrentCustomConfig();
  }

  applyCustomOverrides(overrides: Partial<DiceCustomRuntimeConfig>): DiceCustomRuntimeConfig {
    if (overrides.skinId && overrides.skinId !== this.currentSkin.id) {
      this.currentSkin = resolveDiceSkin(overrides.skinId);
    }
    const mergedPhysics: DicePhysicsConfig = {
      ...(this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG),
      ...(overrides.physics ?? {}),
    };
    this.currentCustom = {
      ...this.currentCustom,
      ...overrides,
      skinId: this.currentSkin.id,
      physics: mergedPhysics,
    };
    this.syncStageLightingAndRebuild();
    return this.getCurrentCustomConfig();
  }

  setShowcaseFocusDie(focus: DicePolyhedronType | 'all'): void {
    this.focusDieType = focus;
    this.stageMode.set('showcase');
    if (!this.isRolling) {
      this.resetCameraToShowcase();
      this.rebuildShowcaseDice();
    }
  }

  clearRollAndReturnToShowcase(): void {
    if (this.rollAnimationTimer !== null) {
      clearTimeout(this.rollAnimationTimer);
      this.rollAnimationTimer = null;
    }
    this.isRolling = false;
    this.stageMode.set('showcase');
    this.resetCameraToShowcase();
    this.rebuildShowcaseDice();
  }

  resetCameraToShowcase(): void {
    if (!this.camera) return;
    this.camera.target = Vector3.Zero();
    this.camera.alpha = -Math.PI / 2;
    this.camera.beta = Math.PI / 2.65;
    this.camera.radius = this.focusDieType === 'all' ? 11.8 : 7.4;
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
    if (!this.camera) return;
    this.camera.radius = Math.max(3.5, Math.min(30, this.camera.radius + deltaRadius));
  }

  previewCritOutcomeEffect(outcomeKind: 'nat20' | 'critfail'): void {
    if (!this.scene) return;
    const origin = this.activeDice[0]?.mesh.position.clone() ?? new Vector3(0, 0.35, 0);
    const scaleBoost = (this.currentCustom.critBurstIntensity ?? 1.0) * this.currentCustom.glowIntensity;
    if (outcomeKind === 'nat20') {
      const preset = resolveNat20Effect(this.currentCustom.nat20EffectId);
      this.soundService.playCriticalSuccessFanfare(this.currentCustom.soundProfileId);
      this.critEffectsRunner.triggerCritEffect(preset, origin, this.scene, this.glowLayer, 0.55 * scaleBoost);
    } else {
      const preset = resolveCritFailEffect(this.currentCustom.critFailEffectId);
      this.soundService.playCriticalFailureFracture();
      this.critEffectsRunner.triggerCritEffect(preset, origin, this.scene, this.glowLayer, 0.45 * scaleBoost);
    }
  }

  animatePoolRoll(
    entries: ReadonlyArray<{ dieType: DicePolyhedronType; value: number }>,
    isCriticalSuccess: boolean,
    isCriticalFailure: boolean,
  ): void {
    if (!this.scene) return;
    if (this.rollAnimationTimer !== null) {
      clearTimeout(this.rollAnimationTimer);
      this.rollAnimationTimer = null;
    }

    const phys = this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    if (phys.suspendSimulation) return;

    this.clearFloatingBadges();
    this.critEffectsRunner.clearActiveEffects();
    this.isRolling = true;
    this.stageMode.set('rolled');

    // Switch camera to top-down / user-configured roll angle & clear stationary showcase dice
    this.applyRollCameraView(phys.rollCameraPitchDeg, phys.rollCameraYawDeg, phys.rollCameraDistance);
    this.clearActiveDice();

    const model = resolveDiceModel(this.currentCustom.modelId);
    const physicsScale = (phys.scale ?? 5) / 5;
    const sizeScale = (DICE_SIZE_SCALE_MAP[this.currentCustom.sizePreset] ?? 1.0) * (model.scaleMultiplier ?? 1.0) * physicsScale;
    const camPos = this.camera?.position.clone() ?? new Vector3(0, 15.5, -1.2);

    const planEntries = entries.map((e) => ({ dieType: e.dieType, targetValue: e.value }));
    const plans: DiePhysicsTrajectoryPlan[] = createPhysicsBoxTrajectoryPlans(planEntries, sizeScale, phys, camPos);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const built = buildBabylonPolyhedralDie(`lw-roll-die-${i}`, entry.dieType, this.currentSkin, this.currentCustom, model, this.scene);
      built.mesh.position.copyFrom(plans[i].startPos);
      built.mesh.rotationQuaternion = plans[i].startQuat.clone();
      this.activeDice.push(built);

      if (phys.enableShadows) {
        const shadow = createDieContactShadowDisc(i, sizeScale, this.scene, phys.shadowTransparency ?? 0.8);
        shadow.position.x = plans[i].startPos.x;
        shadow.position.z = plans[i].startPos.z;
        this.activeShadows.push(shadow);
      }
    }

    this.soundService.playRollStartClatter(this.currentCustom.soundProfileId, entries.length);
    const startTime = performance.now();
    const baseDuration = plans[0]?.durationMs ?? 1050;
    const maxDelay = (entries.length - 1) * Math.max(0, phys.delay ?? 10);
    const totalDuration = Math.min(phys.settleTimeout ?? 5000, baseDuration + maxDelay);
    const floorY = 0.82 * sizeScale;

    const step = () => {
      if (!this.scene) return;
      const elapsed = performance.now() - startTime;

      for (let i = 0; i < this.activeDice.length; i++) {
        const dDelay = plans[i].delayMs ?? 0;
        const t = Math.min(1, Math.max(0, elapsed - dDelay) / baseDuration);
        const pose = evaluateDieTrajectoryStep(plans[i], t, sizeScale, (intensity) => {
          if (i <= 2) this.soundService.playBounceImpact(this.currentCustom.soundProfileId, intensity);
        });
        this.activeDice[i].mesh.position.copyFrom(pose.position);
        this.activeDice[i].mesh.rotationQuaternion = pose.rotationQuaternion;

        const shadow = this.activeShadows[i];
        if (shadow) {
          const h = Math.max(0, pose.position.y - floorY);
          shadow.position.x = pose.position.x + 0.1 + h * 0.06;
          shadow.position.z = pose.position.z - 0.1 - h * 0.06;
          const sc = 1 + h * 0.14;
          shadow.scaling.set(sc, 1, sc);
        }
      }

      if (elapsed < totalDuration) {
        this.rollAnimationTimer = window.setTimeout(step, 16);
      } else {
        this.isRolling = false;
        this.rollAnimationTimer = null;
        this.soundService.playSettleChime(this.currentCustom.soundProfileId);

        for (let i = 0; i < this.activeDice.length; i++) {
          const die = this.activeDice[i];
          const entry = entries[i];
          const toCam = camPos.subtract(die.mesh.position).normalize();
          die.mesh.rotationQuaternion = getRotationForTopValue(entry.dieType, entry.value, 0, toCam);

        }

        if (isCriticalSuccess) this.previewCritOutcomeEffect('nat20');
        else if (isCriticalFailure) this.previewCritOutcomeEffect('critfail');
      }
    };
    step();
  }

  animateRoll(expression: string, diceResults: number[], isCriticalSuccess: boolean, isCriticalFailure: boolean): void {
    const match = /d(100|20|12|10|8|6|4)\b/i.exec(expression || '1d20');
    const dieType: DicePolyhedronType = match ? (`d${match[1]}` as DicePolyhedronType) : 'd20';
    const vals = diceResults.length > 0 ? diceResults : [20];
    this.animatePoolRoll(vals.map((v) => ({ dieType, value: v })), isCriticalSuccess, isCriticalFailure);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.rollAnimationTimer !== null) clearTimeout(this.rollAnimationTimer);
    this.rollAnimationTimer = null;
    this.critEffectsRunner.clearActiveEffects();
    this.clearFloatingBadges();
    this.clearActiveDice();
    this.boundaryWireframe?.dispose();
    this.boundaryWireframe = null;
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
    this.camera = null;
  }

  private syncStageLightingAndRebuild(): void {
    if (!this.scene) return;
    const phys = this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    const lightMult = Math.max(0.2, Math.min(3.0, phys.lightIntensity ?? 1.0));
    const glowColor = hexToColor3(this.currentCustom.glowColorHex || this.currentSkin.emissiveColor);
    if (this.hemiLight) this.hemiLight.intensity = 0.88 * lightMult;
    if (this.dirLight) this.dirLight.intensity = 1.18 * lightMult;
    if (this.accentPointLight) {
      this.accentPointLight.diffuse = glowColor;
      this.accentPointLight.intensity = 0.85 * lightMult;
    }
    if (this.glowLayer) this.glowLayer.intensity = 0.48 * this.currentCustom.glowIntensity;
    this.updateBoundaryWireframe();
    if (!this.isRolling && this.stageMode() === 'showcase') {
      this.rebuildShowcaseDice();
    }
  }

  private updateBoundaryWireframe(): void {
    if (!this.scene) return;
    this.boundaryWireframe?.dispose();
    this.boundaryWireframe = null;
    const phys = this.currentCustom.physics ?? DEFAULT_DICE_PHYSICS_CONFIG;
    if (!phys.showBoundaryBox) return;

    const hw = Math.max(2, (phys.boundaryWidth ?? 14) * 0.5);
    const hd = Math.max(2, (phys.boundaryDepth ?? 10) * 0.5);
    const h = Math.max(2.5, (phys.startingHeight ?? 8) * 0.55);
    const lines = [
      [new Vector3(-hw, 0, -hd), new Vector3(hw, 0, -hd), new Vector3(hw, 0, hd), new Vector3(-hw, 0, hd), new Vector3(-hw, 0, -hd)],
      [new Vector3(-hw, h, -hd), new Vector3(hw, h, -hd), new Vector3(hw, h, hd), new Vector3(-hw, h, hd), new Vector3(-hw, 0, -hd)],
      [new Vector3(-hw, 0, -hd), new Vector3(-hw, h, -hd)],
      [new Vector3(hw, 0, -hd), new Vector3(hw, h, -hd)],
      [new Vector3(hw, 0, hd), new Vector3(hw, h, hd)],
      [new Vector3(-hw, 0, hd), new Vector3(-hw, h, hd)],
    ];
    const box = MeshBuilder.CreateLineSystem('lw-dice-boundary-box', { lines }, this.scene);
    box.color = new Color3(0.286, 0.91, 0.573);
    box.alpha = 0.65;
    this.boundaryWireframe = box;
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
    for (const d of this.activeDice) {
      disposeDieMaterials(d);
      d.mesh.dispose();
    }
    this.activeDice = [];
    for (const s of this.activeShadows) {
      s.material?.dispose();
      s.dispose();
    }
    this.activeShadows = [];
  }

  private clearFloatingBadges(): void {
    for (const badge of this.activeBadges) {
      badge.material?.dispose();
      badge.dispose();
    }
    this.activeBadges = [];
  }
}
