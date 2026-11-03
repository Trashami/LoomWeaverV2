import { NgZone } from '@angular/core';
import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, GlowLayer,
  HemisphericLight, Mesh, PointLight, Scene, Vector3,
} from '@babylonjs/core';
import { DiceSoundService } from './audio';
import { BabylonDiceStageService } from './babylon-dice-stage.service';
import {
  createDieContactShadowDisc, createPhysicsBoxTrajectoryPlans,
  DiePhysicsTrajectoryPlan, evaluateDieTrajectoryStep,
} from './dice-physics-trajectory';
import { viewportTray } from './dice-viewport-tray';
import { DiceCritEffectsRunner, resolveCritFailEffect, resolveNat20Effect } from './effects';
import type { FullscreenDiceRollRequest, FullscreenDieEntry } from './fullscreen-dice-overlay.service';
import {
  applyVeinPulseToDieMaterials, buildBabylonPolyhedralDie, BuiltBabylonDieInstance,
  disposeDieMaterials, hexToColor3, preloadDiceSurfaceAssets,
} from './materials';
import { diceHaloColor } from './materials/dice-light.plugin';
import { DICE_SIZE_SCALE_MAP, DicePolyhedronType, resolveDiceModel } from './models';
import { DiceCustomRuntimeConfig, DiceSkinConfig, resolveDiceSkin } from './skins';

const WARMUP_POOL_SPECS: ReadonlyArray<{ dieType: DicePolyhedronType; count: number }> = [
  { dieType: 'd20', count: 2 },
  { dieType: 'd6', count: 2 },
  { dieType: 'd8', count: 1 },
  { dieType: 'd10', count: 1 },
  { dieType: 'd12', count: 1 },
  { dieType: 'd4', count: 1 },
  { dieType: 'd100', count: 1 },
];

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
  private pooledDice = new Map<DicePolyhedronType, BuiltBabylonDieInstance[]>();
  private cachedConfigSignature = '';
  private rollStepTimer: number | null = null;
  private warmupTimer: number | null = null;
  private resizeHandler = () => this.engine?.resize();

  constructor(
    private readonly ngZone: NgZone,
    private readonly soundService: DiceSoundService,
    private readonly stageService: BabylonDiceStageService,
    private readonly isOverlayVisible: () => boolean,
  ) {}

  mountCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas && this.engine && this.scene) return;
    this.dispose();
    this.canvas = canvas;

    this.ngZone.runOutsideAngular(() => {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true, stencil: true, antialias: true, alpha: true,
      });
      const scene = new Scene(this.engine);
      scene.clearColor = new Color4(0, 0, 0, 0);
      this.scene = scene;

      const camera = new ArcRotateCamera('lw-fs-dice-cam', -Math.PI / 2, 0.24, 14.2, new Vector3(0, 0, 0), scene);
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

      this.glowLayer = new GlowLayer('lw-fs-dice-glow', scene, { mainTextureSamples: 1, blurKernelSize: 16 });
      this.glowLayer.customEmissiveColorSelector = (_mesh, _subMesh, material, result) => diceHaloColor(material, result);
      this.glowLayer.intensity = 0.45;

      void preloadDiceSurfaceAssets()
        .then(() => { this.assetsLoaded = true; this.warmUpDiceCache(); })
        .catch(() => { this.assetsLoaded = true; this.warmUpDiceCache(); });

      const startClock = performance.now();
      this.engine.runRenderLoop(() => {
        if (!this.scene || !this.isOverlayVisible()) return;
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

  warmUpDiceCache(): void {
    if (!this.scene || !this.engine) return;
    if (!this.assetsLoaded) {
      void preloadDiceSurfaceAssets()
        .then(() => { this.assetsLoaded = true; this.warmUpDiceCache(); })
        .catch(() => { this.assetsLoaded = true; });
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      if (!this.scene || !this.engine) return;
      const custom = this.stageService.getCurrentCustomConfig();
      const skin = resolveDiceSkin(custom.skinId);
      const model = resolveDiceModel(custom.modelId);
      const sig = this.computeVisualSignature(custom, skin);

      if (sig !== this.cachedConfigSignature) {
        this.disposePool();
        this.cachedConfigSignature = sig;
      }

      let builtAny = false;
      for (const spec of WARMUP_POOL_SPECS) {
        const list = this.pooledDice.get(spec.dieType) ?? [];
        while (list.length < spec.count) {
          const built = buildBabylonPolyhedralDie(
            `lw-pool-${spec.dieType}-${list.length}-${Date.now()}`,
            spec.dieType, skin, custom, model, this.scene,
          );
          built.mesh.position.set(0, -100, 0);
          built.mesh.setEnabled(false);
          list.push(built);
          builtAny = true;
        }
        this.pooledDice.set(spec.dieType, list);
      }

      if (builtAny && !this.isOverlayVisible()) {
        try {
          for (const list of this.pooledDice.values()) {
            if (list[0]) list[0].mesh.setEnabled(true);
          }
          this.scene.render();
          for (const list of this.pooledDice.values()) {
            if (list[0]) list[0].mesh.setEnabled(false);
          }
          this.engine.clear(new Color4(0, 0, 0, 0), true, true, true);
        } catch {
          // Ignore warmup frame errors
        }
      }
    });
  }

  private computeVisualSignature(custom: DiceCustomRuntimeConfig, skin: DiceSkinConfig): string {
    return JSON.stringify({
      ...custom,
      skinId: skin.id,
      physics: null,
      nat20Customization: null,
      critFailCustomization: null,
    });
  }

  private acquireDie(
    index: number,
    dieType: DicePolyhedronType,
    skin: DiceSkinConfig,
    custom: DiceCustomRuntimeConfig,
  ): BuiltBabylonDieInstance {
    const sig = this.computeVisualSignature(custom, skin);
    if (sig !== this.cachedConfigSignature) {
      this.disposePool();
      this.cachedConfigSignature = sig;
    }
    const bucket = this.pooledDice.get(dieType);
    if (bucket && bucket.length > 0) {
      const reused = bucket.pop()!;
      reused.mesh.setEnabled(true);
      reused.mesh.scaling.setAll(1);
      return reused;
    }
    const model = resolveDiceModel(custom.modelId);
    return buildBabylonPolyhedralDie(`lw-fs-die-${index}`, dieType, skin, custom, model, this.scene!);
  }

  private disposePool(): void {
    for (const list of this.pooledDice.values()) {
      for (const die of list) {
        disposeDieMaterials(die);
        die.mesh.dispose(false, false);
      }
    }
    this.pooledDice.clear();
  }

  runRoll(entries: FullscreenDieEntry[], req: FullscreenDiceRollRequest, onSettled: () => void): void {
    if (!this.scene || !this.engine) { onSettled(); return; }

    if (!this.assetsLoaded) {
      const scene = this.scene;
      void preloadDiceSurfaceAssets()
        .then(() => { this.assetsLoaded = true; if (scene === this.scene) this.runRoll(entries, req, onSettled); })
        .catch(() => { this.assetsLoaded = true; if (scene === this.scene) this.runRoll(entries, req, onSettled); });
      return;
    }

    if (this.rollStepTimer !== null) {
      cancelAnimationFrame(this.rollStepTimer);
      this.rollStepTimer = null;
    }

    const custom = this.stageService.getCurrentCustomConfig();
    const skin = resolveDiceSkin(custom.skinId);
    const model = resolveDiceModel(custom.modelId);
    const sizeScale = (DICE_SIZE_SCALE_MAP[custom.sizePreset] ?? 1.0) * (model.scaleMultiplier ?? 1.0) * 1.12;

    if (this.accentPointLight) this.accentPointLight.diffuse = hexToColor3(custom.glowColorHex || skin.emissiveColor);
    if (this.glowLayer) this.glowLayer.intensity = 0.22 * custom.glowIntensity;

    this.ngZone.runOutsideAngular(() => {
      try {
        this.engine?.resize();
        this.critEffectsRunner.clearActiveEffects();
        this.clearMeshes();

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const built = this.acquireDie(i, entry.dieType, skin, custom);
          const shadowDisc = createDieContactShadowDisc(i, sizeScale, this.scene!);
          this.activeDice.push(built);
          this.activeShadows.push(shadowDisc);
        }

        const aspect = Math.max(0.5, (this.engine!.getRenderWidth() || 1280) / Math.max(1, this.engine!.getRenderHeight() || 720));
        const plans: DiePhysicsTrajectoryPlan[] = createPhysicsBoxTrajectoryPlans(
          entries.map((entry, i) => ({
            dieType: entry.dieType,
            targetValue: entry.value,
            collisionVertices: Array.from(this.activeDice[i].builtGeometry.vertexData.positions!),
          })),
          sizeScale,
          viewportTray(custom.physics, this.scene!.activeCamera, aspect),
        );
        this.activeDice.forEach((die, i) => {
          die.mesh.position.copyFrom(plans[i].startPos);
          die.mesh.rotationQuaternion = plans[i].startQuat.clone();
        });
        this.soundService.playRollStartClatter(custom.soundProfileId, entries.length);
        let startTime: number | null = null;
        const totalDuration = Math.max(0, ...plans.map((plan) => (plan.durationMs ?? 2000) + (plan.delayMs ?? 0)));

        const step = (now: number) => {
          if (!this.scene) return;
          try {
            if (startTime === null) startTime = now;
            const elapsed = Math.max(0, now - startTime);

            for (let i = 0; i < this.activeDice.length; i++) {
              const t = Math.max(0, Math.min(1, (elapsed - (plans[i].delayMs ?? 0)) / (plans[i].durationMs ?? 2000)));
              const pose = evaluateDieTrajectoryStep(plans[i], t, sizeScale, (intensity) => {
                if (i <= 2) this.soundService.playBounceImpact(custom.soundProfileId, intensity);
              });
              const dieMesh = this.activeDice[i].mesh;
              if (i === 0 && t < 1) {
                const previous = dieMesh.rotationQuaternion;
                const q = pose.rotationQuaternion;
                const dot = previous ? Math.abs(previous.x * q.x + previous.y * q.y + previous.z * q.z + previous.w * q.w) : 1;
                this.soundService.playTumbleResonance(custom.soundProfileId, (2 * Math.acos(Math.min(1, dot))) / 0.016);
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
              this.rollStepTimer = window.requestAnimationFrame(step);
            } else {
              this.rollStepTimer = null;
              this.finalizeStop(entries, Boolean(req.isNat20), Boolean(req.isCritFail), onSettled);
            }
          } catch {
            this.rollStepTimer = null;
            onSettled();
          }
        };

        this.rollStepTimer = window.requestAnimationFrame(step);
      } catch {
        onSettled();
      }
    });
  }

  clearAll(): void {
    if (this.rollStepTimer !== null) {
      cancelAnimationFrame(this.rollStepTimer);
      this.rollStepTimer = null;
    }
    this.critEffectsRunner.clearActiveEffects();
    this.clearMeshes();
    if (this.warmupTimer !== null) clearTimeout(this.warmupTimer);
    this.warmupTimer = window.setTimeout(() => {
      this.warmupTimer = null;
      this.warmUpDiceCache();
    }, 80);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.warmupTimer !== null) { clearTimeout(this.warmupTimer); this.warmupTimer = null; }
    this.clearAll();
    this.disposePool();
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
  }

  private finalizeStop(
    _entries: FullscreenDieEntry[],
    isNat20: boolean,
    isCritFail: boolean,
    onSettled: () => void,
  ): void {
    const custom = this.stageService.getCurrentCustomConfig();
    this.soundService.playSettleChime(custom.soundProfileId);

    if (this.scene && (isNat20 || isCritFail)) {
      const targetPos = this.activeDice[0]?.mesh.position.clone() ?? new Vector3(0, 0.8, 0);
      if (isNat20) {
        this.soundService.playCriticalSuccessFanfare(custom.soundProfileId);
        this.critEffectsRunner.triggerCritEffect(
          resolveNat20Effect(custom.nat20EffectId), targetPos, this.scene,
          this.glowLayer, 0.55 * (custom.critBurstIntensity ?? 1), custom.nat20Customization,
        );
      } else if (isCritFail) {
        this.soundService.playCriticalFailureFracture();
        this.critEffectsRunner.triggerCritEffect(
          resolveCritFailEffect(custom.critFailEffectId), targetPos, this.scene,
          this.glowLayer, 0.45 * (custom.critBurstIntensity ?? 1), custom.critFailCustomization,
        );
      }
    }

    onSettled();
  }

  private clearMeshes(): void {
    for (const die of this.activeDice) { disposeDieMaterials(die); die.mesh.dispose(false, false); }
    this.activeDice = [];
    for (const shadow of this.activeShadows) { shadow.material?.dispose(true, true); shadow.dispose(); }
    this.activeShadows = [];

    if (this.scene && this.engine) {
      try {
        this.scene.render();
        this.engine.clear(new Color4(0, 0, 0, 0), true, true, true);
      } catch {
        // Ignore clear errors during teardown
      }
    }
  }
}
