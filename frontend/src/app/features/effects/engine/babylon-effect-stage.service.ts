import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  ArcRotateCamera,
  ArcRotateCameraPointersInput,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  MeshoptCompression,
  PointLight,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { EffectTimelinePresetVm, VttTokenVm } from './effect-timeline.contract';
import { TokenDragController, TokenPlacement, TokenRightClickEvent } from './token-drag-controller';
import { BabylonFogPlane } from './babylon-fog-plane';
import { BabylonVttMapSceneBuilder, VttMapSceneDataPayload } from './babylon-vtt-map-scene.builder';
import { BabylonTokenMeshBuilder } from './babylon-token-mesh.builder';
import { BabylonFxTrajectoryPlayer } from './babylon-fx-trajectory.player';
import { MapSceneGraphState } from '../../maps/engine/map-scene-contract';
import { SceneLightingController } from '../../maps/engine/lighting/scene-lighting.controller';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';
import { WallMeshBuilder } from '../../maps/engine/walls/wall-mesh.builder';
import { StampSceneBuilder } from '../../maps/engine/rendering/stamp-scene.builder';
import { setActiveBaseCellWorld } from '../../arcane-screen/engine/vtt-los-and-grid.engine';
import {
  animateBabylonSpellAndTetherPulse,
  BabylonSpellTemplateState,
  BabylonTargetTetherEndpoint,
  syncBabylonSpellAndTetherMeshes,
} from './babylon-spell-template.helper';
import {
  attach2dTopDownPanningObserver,
  clear3dMapSceneGraph,
  createFlatGridLineSystem,
  isMapSceneGraphStatePayload,
  pickTokenOrNearbyAtScreenPoint,
  restoreCameraAfterTokenDrag,
  sync3dMapSceneGraph,
} from './babylon-vtt-3d-scene-graph.helper';

if (typeof window !== 'undefined') {
  MeshoptCompression.Configuration = { decoder: { url: '/assets/object-library/meshopt_decoder.js' } };
}

@Injectable({ providedIn: 'root' })
export class BabylonEffectStageService {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private dragController: TokenDragController | null = null;
  private fogPlane: BabylonFogPlane | null = null;
  private readonly draggedSubject = new Subject<TokenPlacement>();
  private readonly droppedSubject = new Subject<TokenPlacement>();
  private readonly rightClickedSubject = new Subject<TokenRightClickEvent>();
  private cleanupHandlers: (() => void)[] = [];
  private ground: Mesh | null = null;
  private groundMat: StandardMaterial | null = null;
  private gridLines: Mesh | null = null;
  private backdropUrl = '';

  private latestSceneData: VttMapSceneDataPayload | MapSceneGraphState | string | null = null;
  private latestBackdropUrl = '';
  private last3dSceneState: MapSceneGraphState | null = null;
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private latestGridVisible = false;

  private latestTokens: readonly VttTokenVm[] = [];
  private latestAttackerKey?: string;
  private latestTargetKey?: string;
  private latestTargetedKeys: readonly string[] = [];
  private latestOpacityByKey: ReadonlyMap<string, number> = new Map();
  private latestGridScale = 1.0;
  private latestGridOffsetX = 0.0;
  private latestGridOffsetY = 0.0;
  private latestSpellTemplate: BabylonSpellTemplateState | null = null;
  private latestTetherTargets: readonly BabylonTargetTetherEndpoint[] = [];

  private readonly mapSceneBuilder = new BabylonVttMapSceneBuilder();
  private readonly tokenBuilder = new BabylonTokenMeshBuilder();
  private readonly fxPlayer = new BabylonFxTrajectoryPlayer();
  private isForcedTopDown = true;

  camera: ArcRotateCamera | null = null;
  readonly has3dSceneLoaded = signal<boolean>(false);
  readonly zoomPercent = signal<number>(100);
  readonly activeKeyframeLabel = signal<string>('Ready');
  readonly reducedMotion = signal<boolean>(false);
  readonly tokenDragged: Observable<TokenPlacement> = this.draggedSubject.asObservable();
  readonly tokenDropped: Observable<TokenPlacement> = this.droppedSubject.asObservable();
  readonly tokenRightClicked: Observable<TokenRightClickEvent> = this.rightClickedSubject.asObservable();

  resize(): void { this.engine?.resize(); }

  zoomCamera(delta: number): void {
    if (this.camera) {
      this.camera.radius = Math.max(this.camera.lowerRadiusLimit ?? 6, Math.min(this.camera.upperRadiusLimit ?? 58, this.camera.radius + delta));
      this.updateZoomPercent();
    }
  }

  resetCamera(): void {
    if (!this.camera) return;
    this.camera.radius = this.has3dSceneLoaded() ? 26 : 20;
    this.camera.target.set(0, 0, 0);
    this.setForcedTopDown(this.isForcedTopDown);
    this.updateZoomPercent();
  }

  private updateZoomPercent(): void {
    if (!this.camera) return;
    const minR = this.camera.lowerRadiusLimit ?? 6;
    const maxR = this.camera.upperRadiusLimit ?? 58;
    this.zoomPercent.set(Math.max(100, Math.min(350, Math.round(100 + ((maxR - this.camera.radius) / (maxR - minR)) * 250))));
  }

  setBackdrop(url: string): void {
    this.latestBackdropUrl = url || '';
    if (this.has3dSceneLoaded() || !this.scene || !this.ground || !this.groundMat || !url || url === this.backdropUrl) return;
    this.backdropUrl = url;
    const tex = new Texture(url, this.scene);
    const ground = this.ground;
    tex.onLoadObservable.addOnce(() => {
      const size = tex.getSize();
      if (size.width > 0 && size.height > 0) ground.scaling.z = size.height / size.width / (16 / 24);
    });
    this.groundMat.diffuseTexture = tex;
    this.groundMat.diffuseColor = Color3.White();
    this.groundMat.specularColor = Color3.Black();
    this.groundMat.emissiveColor = new Color3(0.24, 0.24, 0.24);
  }

  private schedule3dSceneResync(): void {
    if (this.resyncTimer !== null) return;
    this.resyncTimer = setTimeout(() => {
      this.resyncTimer = null;
      if (this.scene && this.last3dSceneState) this.sync3dSceneGraph(this.last3dSceneState);
    }, 150);
  }

  private sync3dSceneGraph(state: MapSceneGraphState): void {
    if (!this.scene) return;
    this.last3dSceneState = state;
    this.has3dSceneLoaded.set(true);
    setActiveBaseCellWorld(1.5);
    sync3dMapSceneGraph(this.scene, state, this.ground, this.latestGridVisible, () => this.schedule3dSceneResync(), this.latestGridScale, this.latestGridOffsetX, this.latestGridOffsetY);
    if (this.latestTokens.length > 0) this.refreshTokens();
  }

  private clear3dSceneGraph(): void {
    this.last3dSceneState = null;
    this.has3dSceneLoaded.set(false);
    setActiveBaseCellWorld(1.0);
    clear3dMapSceneGraph(this.scene, this.ground);
  }

  loadMapScene(sceneData?: VttMapSceneDataPayload | MapSceneGraphState | string | null, backdropUrl?: string): void {
    this.latestSceneData = sceneData ?? null;
    if (backdropUrl !== undefined) this.latestBackdropUrl = backdropUrl;
    if (!this.scene) return;

    let parsed: VttMapSceneDataPayload | MapSceneGraphState | null = null;
    if (sceneData) {
      if (typeof sceneData === 'string') { try { parsed = JSON.parse(sceneData); } catch {} }
      else parsed = sceneData;
    }

    if (parsed && isMapSceneGraphStatePayload(parsed)) {
      this.mapSceneBuilder.clear(this.scene);
      if (this.gridLines) { this.gridLines.dispose(); this.gridLines = null; }
      this.sync3dSceneGraph(parsed);
      return;
    }

    if (this.has3dSceneLoaded()) this.clear3dSceneGraph();
    if (this.latestBackdropUrl) this.setBackdrop(this.latestBackdropUrl);
    if (parsed) this.mapSceneBuilder.buildScene(this.scene, parsed as VttMapSceneDataPayload);
    else this.mapSceneBuilder.clear(this.scene);
    SceneLightingController.syncCelestialDirectionalLight(this.scene, { mode: 'sun', azimuthDeg: 135, altitudeDeg: 42, shadowDarkness: 72, showSkyOrb: false });
    SceneLightingController.refreshShadowCasters(this.scene);
  }

  setForcedTopDown(forced: boolean): void {
    const modeChanged = this.isForcedTopDown !== forced;
    this.isForcedTopDown = forced;
    if (!this.camera) return;
    this.camera.inertialAlphaOffset = 0;
    this.camera.inertialBetaOffset = 0;
    this.camera.inertialPanningX = 0;
    this.camera.inertialPanningY = 0;
    if (forced) {
      this.camera.lowerAlphaLimit = -Math.PI / 2;
      this.camera.upperAlphaLimit = -Math.PI / 2;
      this.camera.lowerBetaLimit = 0.0001;
      this.camera.upperBetaLimit = 0.0001;
      this.camera.alpha = -Math.PI / 2;
      this.camera.beta = 0.0001;
      this.camera.panningAxis = new Vector3(1, 1, 0);
      (this.camera as unknown as { _panningMouseButton: number })._panningMouseButton = 0;
    } else {
      this.camera.lowerAlphaLimit = null;
      this.camera.upperAlphaLimit = null;
      this.camera.lowerBetaLimit = 0.1;
      this.camera.upperBetaLimit = Math.PI / 2.05;
      if (modeChanged) {
        this.camera.alpha = -Math.PI / 2.2;
        this.camera.beta = 0.82;
      }
      this.camera.panningAxis = new Vector3(1, 1, 0);
      (this.camera as unknown as { _panningMouseButton: number })._panningMouseButton = 2;
    }
    if (modeChanged && this.scene && this.latestTokens.length > 0) this.refreshTokens();
  }

  setGridVisible(
    visible: boolean,
    gridScale: number = 1.0,
    gridOffsetX: number = 0.0,
    gridOffsetY: number = 0.0,
  ): void {
    this.latestGridVisible = visible;
    this.latestGridScale = gridScale;
    this.latestGridOffsetX = gridOffsetX;
    this.latestGridOffsetY = gridOffsetY;
    if (!this.scene) return;
    if (this.gridLines) {
      this.gridLines.dispose();
      this.gridLines = null;
    }
    if (this.has3dSceneLoaded()) {
      TerrainMeshBuilder.configureGrid(this.scene, {
        mode: visible ? '5 ft' : 'Off',
        scaleFactor: gridScale,
        offsetX: (gridOffsetX / 50) * 1.5,
        offsetZ: (gridOffsetY / 50) * 1.5,
      });
      const terrainGrid = this.scene.getMeshByName('lw-terrain-grid');
      if (terrainGrid) {
        terrainGrid.isVisible = visible;
        terrainGrid.isPickable = false;
      }
      return;
    }
    if (visible) {
      this.gridLines = createFlatGridLineSystem(this.scene, gridScale, gridOffsetX, gridOffsetY);
    }
  }

  setRotateHeld(_held: boolean): void {}

  pickGroundPoint(clientX: number, clientY: number): { x: number; z: number } | null {
    if (!this.scene || !this.engine) return null;
    const canvas = this.engine.getRenderingCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const pick = this.scene.pick(
      clientX - rect.left,
      clientY - rect.top,
      (m) => m === this.ground || m.name === 'lw-terrain-ground',
    );
    return pick?.hit && pick.pickedPoint ? { x: pick.pickedPoint.x, z: pick.pickedPoint.z } : null;
  }

  pickTokenAtScreenPoint(clientX: number, clientY: number): string | null {
    const canvas = this.engine?.getRenderingCanvas();
    if (!this.scene || !canvas) return null;
    return pickTokenOrNearbyAtScreenPoint(this.scene, canvas, this.ground, clientX, clientY, this.latestTokens, this.latestOpacityByKey, this.latestGridScale);
  }

  mountStage(
    canvas: HTMLCanvasElement,
    tokens: readonly VttTokenVm[],
    attackerKey?: string,
    targetKey?: string,
    onTokenClicked?: (tokenKey: string, shiftKey?: boolean) => void,
    onTokenRightClicked?: (event: TokenRightClickEvent) => void,
  ): void {
    this.dispose();
    try {
      this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
      this.scene = new Scene(this.engine);
      this.scene.clearColor = new Color4(0.02, 0.05, 0.04, 1);
      this.scene.shadowsEnabled = true;

      const onContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        const key = this.pickTokenAtScreenPoint(e.clientX, e.clientY);
        if (key) {
          const ev: TokenRightClickEvent = { key, clientX: e.clientX, clientY: e.clientY };
          this.rightClickedSubject.next(ev);
          onTokenRightClicked?.(ev);
        }
      };
      canvas.addEventListener('contextmenu', onContextMenu);
      this.cleanupHandlers.push(() => canvas.removeEventListener('contextmenu', onContextMenu));

      const camera = new ArcRotateCamera('lw-vtt-cam', -Math.PI / 2, 0.0001, 24, new Vector3(0, 0, 0), this.scene);
      camera.lowerRadiusLimit = 5;
      camera.upperRadiusLimit = 58;
      camera.panningSensibility = 65;
      camera.panningInertia = 0.15;
      camera.panningAxis = new Vector3(1, 1, 0);
      this.camera = camera;
      camera.attachControl(canvas, true);

      const pointers = camera.inputs.attached['pointers'] as ArcRotateCameraPointersInput | undefined;
      if (pointers) pointers.buttons = [0, 1, 2];
      camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
      camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
      this.setForcedTopDown(this.isForcedTopDown);
      this.updateZoomPercent();

      const hemi = new HemisphericLight('lw-vtt-hemi', new Vector3(0, 1, 0), this.scene);
      hemi.intensity = 0.68;
      hemi.diffuse = new Color3(0.94, 0.96, 0.94);
      hemi.groundColor = Color3.FromHexString('#091410');

      const pt = new PointLight('lw-vtt-pt', new Vector3(0, 8, 0), this.scene);
      pt.intensity = 0.65;
      pt.diffuse = Color3.FromHexString('#e4c283');

      const ground = MeshBuilder.CreateGround('lw-vtt-ground', { width: 24, height: 16, subdivisions: 16 }, this.scene);
      ground.receiveShadows = true;
      const gMat = new StandardMaterial('lw-vtt-gmat', this.scene);
      gMat.maxSimultaneousLights = 8;
      gMat.diffuseColor = Color3.FromHexString('#0d1914');
      gMat.specularColor = Color3.Black();
      ground.material = gMat;
      this.ground = ground;
      this.groundMat = gMat;

      this.backdropUrl = '';
      this.fogPlane = new BabylonFogPlane(this.scene);

      let savedAlpha = camera.alpha;
      let savedBeta = camera.beta;

      this.dragController = new TokenDragController(this.scene, ground, {
        onDragStart: () => {
          savedAlpha = camera.alpha;
          savedBeta = camera.beta;
          camera.inertialAlphaOffset = 0;
          camera.inertialBetaOffset = 0;
          camera.lowerAlphaLimit = savedAlpha;
          camera.upperAlphaLimit = savedAlpha;
          camera.lowerBetaLimit = savedBeta;
          camera.upperBetaLimit = savedBeta;
          camera.detachControl();
        },
        onDragEnd: () => {
          camera.alpha = savedAlpha;
          camera.beta = savedBeta;
          setTimeout(() => {
            if (this.camera === camera) {
              restoreCameraAfterTokenDrag(camera, canvas, savedAlpha, savedBeta, this.isForcedTopDown);
            }
          }, 0);
        },
        onTokenSelected: (key, shiftKey) => onTokenClicked?.(key, shiftKey),
        onTokenRightClicked: (event) => {
          this.rightClickedSubject.next(event);
          onTokenRightClicked?.(event);
        },
        onDragged: (placement) => this.draggedSubject.next(placement),
        onDropped: (placement) => this.droppedSubject.next(placement),
      });
      this.dragController.attach();

      this.cleanupHandlers.push(
        attach2dTopDownPanningObserver(this.scene, () => ({
          isForcedTopDown: this.isForcedTopDown,
          camera: this.camera,
          engine: this.engine,
          dragController: this.dragController,
        })),
      );

      if (this.latestSceneData || this.latestBackdropUrl) {
        this.loadMapScene(this.latestSceneData, this.latestBackdropUrl);
      }
      this.syncTokens(tokens, attackerKey, targetKey, targetKey ? [targetKey] : []);

      this.scene.registerBeforeRender(() => {
        if (!this.scene) return;
        if (this.camera) {
          const maxX = this.has3dSceneLoaded() ? 18 : 12;
          const maxZ = this.has3dSceneLoaded() ? 13.5 : 8;
          this.camera.target.x = Math.max(-maxX, Math.min(maxX, this.camera.target.x));
          this.camera.target.z = Math.max(-maxZ, Math.min(maxZ, this.camera.target.z));
          this.camera.target.y = 0;
          this.updateZoomPercent();
        }
        const nowMs = performance.now();
        this.mapSceneBuilder.updateLightFlicker(nowMs, this.reducedMotion());
        if (this.reducedMotion()) return;
        animateBabylonSpellAndTetherPulse(this.scene, nowMs);
        for (const m of this.scene.meshes) {
          if (m.name.startsWith('lw-target-reticle-root-')) m.rotation.y += 0.022;
        }
      });
      this.engine.runRenderLoop(() => this.scene?.render());
    } catch {
      // Headless fallback
    }
  }

  syncFog(layer: HTMLCanvasElement | null): void { this.fogPlane?.setLayer(layer); }

  syncTokens(
    tokens: readonly VttTokenVm[],
    attackerKey?: string,
    targetKey?: string,
    targetedKeys: readonly string[] = [],
    opacityByKey: ReadonlyMap<string, number> = new Map(),
    gridScale: number = 1.0,
  ): void {
    this.latestTokens = tokens;
    this.latestAttackerKey = attackerKey;
    this.latestTargetKey = targetKey;
    this.latestTargetedKeys = targetedKeys;
    this.latestOpacityByKey = opacityByKey;
    this.latestGridScale = gridScale;
    this.refreshTokens();
  }

  syncSpellTemplateAndTethers(
    attackerPos: { x: number; z: number } | null,
    tetherTargets: readonly BabylonTargetTetherEndpoint[],
    templateState: BabylonSpellTemplateState | null,
  ): void {
    this.latestTetherTargets = tetherTargets;
    this.latestSpellTemplate = templateState;
    if (!this.scene) return;
    syncBabylonSpellAndTetherMeshes(this.scene, attackerPos, tetherTargets, templateState);
  }

  private refreshTokens(): void {
    if (!this.scene) return;
    this.tokenBuilder.syncTokens(this.scene, this.latestTokens, this.isForcedTopDown, this.latestAttackerKey, this.latestTargetKey, this.latestTargetedKeys, this.latestOpacityByKey, this.latestGridScale, () => this.refreshTokens());
    const src = this.latestTokens.find((t) => t.key === this.latestAttackerKey);
    syncBabylonSpellAndTetherMeshes(this.scene, src ? { x: src.x, z: src.z } : null, this.latestTetherTargets, this.latestSpellTemplate);
    SceneLightingController.refreshShadowCasters(this.scene);
  }

  playTrajectoryEffect(preset: EffectTimelinePresetVm, startPos: { x: number; z: number } = { x: -5, z: 0 }, endPos: { x: number; z: number } = { x: 5, z: 0 }): void {
    if (!this.scene) return;
    this.fxPlayer.play(this.scene, preset, startPos, endPos, this.reducedMotion(), this.activeKeyframeLabel);
  }

  dispose(): void {
    if (this.resyncTimer !== null) {
      clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
    }
    for (const h of this.cleanupHandlers) h();
    this.cleanupHandlers = [];
    this.fxPlayer.stop();
    this.dragController?.detach();
    this.dragController = null;
    this.fogPlane?.dispose();
    this.fogPlane = null;
    this.tokenBuilder.clearCache();
    if (this.scene) {
      this.mapSceneBuilder.clear(this.scene);
      StampSceneBuilder.evictScene(this.scene);
      WallMeshBuilder.evictScene(this.scene);
    }
    this.last3dSceneState = null;
    this.has3dSceneLoaded.set(false);
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
    this.camera = null;
  }
}
