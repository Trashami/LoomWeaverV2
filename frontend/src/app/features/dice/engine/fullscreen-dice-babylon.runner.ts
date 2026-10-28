import { diceHaloColor } from './materials/dice-light.plugin';
import { viewportTray } from './dice-viewport-tray';
import { NgZone } from '@angular/core';
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  PointLight,
  Scene,
  Vector3
} from '@babylonjs/core';
import { DiceSoundService } from './audio';
import { BabylonDiceStageService } from './babylon-dice-stage.service';
import {
  createDieContactShadowDisc,
  createPhysicsBoxTrajectoryPlans,
  DiePhysicsTrajectoryPlan,
  evaluateDieTrajectoryStep
} from './dice-physics-trajectory';
import { DiceCritEffectsRunner, resolveCritFailEffect, resolveNat20Effect } from './effects';
import type { FullscreenDiceRollRequest, FullscreenDieEntry } from './fullscreen-dice-overlay.service';
import {
  applyVeinPulseToDieMaterials,
  buildBabylonPolyhedralDie,
  BuiltBabylonDieInstance,
  disposeDieMaterials,
  hexToColor3,
  preloadDiceSurfaceAssets
} from './materials';
import {
  DICE_SIZE_SCALE_MAP,
  resolveDiceModel
} from './models';
import { resolveDiceSkin } from './skins';

export class FullscreenDiceBabylonRunner {
  private readonly critEffectsRunner = new DiceCritEffectsRunner();
  private assetsLoaded = false;
  private canvas: HTMLCanvasElement | null = null;
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private glowLayer: GlowLayer | null = null;
  private accentPointLight: PointLight | null = null;

  private activeDice: BuiltBabylonDieInstance[] = [];
  private activeShadows: Mesh[] = [];
  private rollStepTimer: number | null = null;
  private resizeHandler = () => this.engine?.resize();

  constructor(
    private readonly ngZone: NgZone,
    private readonly soundService: DiceSoundService,
    private readonly stageService: BabylonDiceStageService,
    private readonly isOverlayVisible: () => boolean
  ) {}

  mountCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas && this.engine && this.scene) {
      return;
    }
    this.dispose();
    this.canvas = canvas;

    this.ngZone.runOutsideAngular(() => {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true,
        alpha: true
      });
      const scene = new Scene(this.engine);
      scene.clearColor = new Color4(0, 0, 0, 0);
      this.scene = scene;

      const camera = new ArcRotateCamera(
        'lw-fs-dice-cam',
        -Math.PI / 2,
        0.05,
        14.2,
        new Vector3(0, 0, 0),
        scene
      );
      camera.inputs.clear();

      const hemi = new HemisphericLight('lw-fs-dice-hemi', new Vector3(0, 1, 0), scene);
      hemi.intensity = 0.95;
      hemi.groundColor = new Color3(0.08, 0.1, 0.12);

      const dirLight = new DirectionalLight('lw-fs-dice-dir', new Vector3(-0.35, -1, 0.28), scene);
      dirLight.position = new Vector3(5, 14, -5);
      dirLight.intensity = 1.25;

      const pointLight = new PointLight('lw-fs-dice-accent', new Vector3(0, 8, 0), scene);
      pointLight.intensity = 0.9;
      this.accentPointLight = pointLight;

      this.glowLayer = new GlowLayer('lw-fs-dice-glow', scene, {
        mainTextureSamples: 1,
        blurKernelSize: 16
      });
      this.glowLayer.customEmissiveColorSelector = (_mesh, _subMesh, material, result) => diceHaloColor(material, result);
      this.glowLayer.intensity = 0.45;

      void preloadDiceSurfaceAssets().then(() => { this.assetsLoaded = true; });

      const startClock = performance.now();
      this.engine.runRenderLoop(() => {
        if (!this.scene || !this.isOverlayVisible()) {
          return;
        }
        const elapsedSec = (performance.now() - startClock) * 0.001;
        const custom = this.stageService.getCurrentCustomConfig();
        const skin = resolveDiceSkin(custom.skinId);
        for (let i = 0; i < this.activeDice.length; i++) {
          applyVeinPulseToDieMaterials(this.activeDice[i].faceMaterials, skin, custom, elapsedSec);
        }
        this.scene.render();
      });

      window.addEventListener('resize', this.resizeHandler);
    });
  }

  runRoll(
    entries: FullscreenDieEntry[],
    req: FullscreenDiceRollRequest,
    onSettled: () => void
  ): void {
    if (!this.scene || !this.engine) {
      onSettled();
      return;
    }

    if (!this.assetsLoaded) {
      const scene = this.scene;
      void preloadDiceSurfaceAssets().then(() => {
        this.assetsLoaded = true;
        if (scene === this.scene) this.runRoll(entries, req, onSettled);
      });
      return;
    }

    if (this.rollStepTimer !== null) {
      clearTimeout(this.rollStepTimer);
      this.rollStepTimer = null;
    }

    const custom = this.stageService.getCurrentCustomConfig();
    const skin = resolveDiceSkin(custom.skinId);
    const model = resolveDiceModel(custom.modelId);
    const sizeScale = (DICE_SIZE_SCALE_MAP[custom.sizePreset] ?? 1.0) * (model.scaleMultiplier ?? 1.0) * 1.12;

    if (this.accentPointLight) {
      this.accentPointLight.diffuse = hexToColor3(custom.glowColorHex || skin.emissiveColor);
    }
    if (this.glowLayer) {
      this.glowLayer.intensity = 0.22 * custom.glowIntensity;
    }

    this.ngZone.runOutsideAngular(() => {
      this.engine?.resize();
      this.critEffectsRunner.clearActiveEffects();
      this.clearMeshes();

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const built = buildBabylonPolyhedralDie(
          `lw-fs-die-${i}`,
          entry.dieType,
          skin,
          custom,
          model,
          this.scene!
        );

        const shadowDisc = createDieContactShadowDisc(i, sizeScale, this.scene!);

        this.activeDice.push(built);
        this.activeShadows.push(shadowDisc);
      }

      const plans: DiePhysicsTrajectoryPlan[] = createPhysicsBoxTrajectoryPlans(entries.map((entry, i) => ({
        dieType: entry.dieType, targetValue: entry.value,
        collisionVertices: Array.from(this.activeDice[i].builtGeometry.vertexData.positions!),
      })), sizeScale, viewportTray(custom.physics, this.scene!.activeCamera, this.engine!.getRenderWidth() / this.engine!.getRenderHeight()));
      this.activeDice.forEach((die, i) => {
        die.mesh.position.copyFrom(plans[i].startPos); die.mesh.rotationQuaternion = plans[i].startQuat.clone();
      });
      this.soundService.playRollStartClatter(custom.soundProfileId, entries.length);
      const startTime = performance.now();
      const totalDuration = Math.max(0, ...plans.map(plan => (plan.durationMs ?? 2000) + (plan.delayMs ?? 0)));

      const step = () => {
        if (!this.scene) {
          return;
        }
        const elapsed = performance.now() - startTime;

        for (let i = 0; i < this.activeDice.length; i++) {
          const t = Math.max(0, Math.min(1, (elapsed - (plans[i].delayMs ?? 0)) / (plans[i].durationMs ?? 2000)));
          const pose = evaluateDieTrajectoryStep(plans[i], t, sizeScale, intensity => {
            if (i <= 2) {
              this.soundService.playBounceImpact(custom.soundProfileId, intensity);
            }
          });
          const dieMesh = this.activeDice[i].mesh;
          if (i === 0 && t < 1) {
            const previous = dieMesh.rotationQuaternion, q = pose.rotationQuaternion;
            const dot = previous ? Math.abs(previous.x*q.x + previous.y*q.y + previous.z*q.z + previous.w*q.w) : 1;
            this.soundService.playTumbleResonance(custom.soundProfileId, 2 * Math.acos(Math.min(1, dot)) / 0.016);
          }
          dieMesh.position.copyFrom(pose.position);
          dieMesh.rotationQuaternion = pose.rotationQuaternion;

          const shadow = this.activeShadows[i];
          if (shadow) {
            const heightAboveFloor = Math.max(0, pose.position.y - plans[i].endPos.y);
            shadow.position.x = pose.position.x + 0.12 + heightAboveFloor * 0.08;
            shadow.position.z = pose.position.z - 0.12 - heightAboveFloor * 0.08;
            const shadowScale = 1 + heightAboveFloor * 0.18;
            shadow.scaling.set(shadowScale, 1, shadowScale);
          }
        }

        if (elapsed < totalDuration) {
          this.rollStepTimer = window.setTimeout(step, 16);
        } else {
          this.rollStepTimer = null;
          this.finalizeStop(entries, Boolean(req.isNat20), Boolean(req.isCritFail), onSettled);
        }
      };

      step();
    });
  }

  clearAll(): void {
    if (this.rollStepTimer !== null) {
      clearTimeout(this.rollStepTimer);
      this.rollStepTimer = null;
    }
    this.critEffectsRunner.clearActiveEffects();
    this.clearMeshes();
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.clearAll();
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
  }

  private finalizeStop(
    entries: FullscreenDieEntry[],
    isNat20: boolean,
    isCritFail: boolean,
    onSettled: () => void
  ): void {
    const custom = this.stageService.getCurrentCustomConfig();
    this.soundService.playSettleChime(custom.soundProfileId);

    const cameraPos = new Vector3(0, 14.2, -0.7);
    if (this.scene && (isNat20 || isCritFail)) {
      const targetPos = this.activeDice[0]?.mesh.position.clone() ?? new Vector3(0, 0.8, 0);
      if (isNat20) {
        this.soundService.playCriticalSuccessFanfare(custom.soundProfileId);
        this.critEffectsRunner.triggerCritEffect(
          resolveNat20Effect(custom.nat20EffectId),
          targetPos,
          this.scene,
          this.glowLayer,
          0.55 * (custom.critBurstIntensity ?? 1)
        );
      } else if (isCritFail) {
        this.soundService.playCriticalFailureFracture();
        this.critEffectsRunner.triggerCritEffect(
          resolveCritFailEffect(custom.critFailEffectId),
          targetPos,
          this.scene,
          this.glowLayer,
          0.45 * (custom.critBurstIntensity ?? 1)
        );
      }
    }

    onSettled();
  }

  private clearMeshes(): void {
    for (const die of this.activeDice) {
      disposeDieMaterials(die);
      die.mesh.dispose(false, false);
    }
    this.activeDice = [];

    for (const shadow of this.activeShadows) {
      shadow.material?.dispose(true, true);
      shadow.dispose();
    }
    this.activeShadows = [];
  }
}
