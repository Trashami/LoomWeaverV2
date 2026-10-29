import { MapCameraViews } from './map-camera-views';
import { WaterChannelTerrain } from '../water/water-channel-terrain';
import { WallBrushController } from '../walls/wall-brush-controller';
import { Injectable, signal } from '@angular/core';
import {
  ArcRotateCamera,
  ArcRotateCameraPointersInput,
  Color3,
  Color4,
  Engine,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import {
  CelestialLightConfig,
  SceneLightingController,
} from '../lighting/scene-lighting.controller';
import {
  MapFloorPaintDab,
  MapObjectPlacementMode,
  MapObjectSurfaceFinish,
  MapRenderMode,
  MapSceneGraphState,
  MapStampNode,
  WallDrawMode,
} from '../map-scene-contract';
import { PathRibbonEngine } from '../paths/path-ribbon.engine';
import { SeededScatterEngine } from '../scatter/seeded-scatter.engine';
import { FloorBumpAndColorConfig, TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { WallMeshBuilder } from '../walls/wall-mesh.builder';
import { WaterSplineBuilder } from '../water/water-spline.builder';
import { lodTierForQualityPreset } from './glb-lod';
import { GlbCloneMetadata, GlbModelCache } from './glb-model-cache';
import { LightDragController } from './light-drag.controller';
import { LightFixtureBuilder } from '../lighting/light-fixture.builder';

export interface PickedSceneEntityMeta {
  readonly lwNodeName?: string;
  readonly lwKind?: 'wall' | 'door' | 'object' | 'light';
  readonly lwEntityId?: string;
  readonly lwWallId?: string;
}

export interface GhostAssetConfig {
  readonly enabled: boolean;
  readonly label: string;
  readonly kind:
    | 'prop'
    | 'wall'
    | 'door'
    | 'light'
    | 'terrain'
    | 'decal'
    | 'water'
    | 'scatter'
    | 'floor-paint';
  readonly modelUrl?: string;
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly thumbnailUrl?: string;
  readonly scale: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly scaleZ?: number;
  readonly placementMode?: MapObjectPlacementMode;
  readonly offsetY?: number;
  readonly rotationRad: number;
  readonly heightMeters: number;
  readonly thicknessMeters: number;
  readonly waterBankWidth?: number;
  readonly wallDrawMode: WallDrawMode;
  readonly wallStampScale?: number;
  readonly wallOffsetY?: number;
  readonly wallRotationOffsetDeg?: number;
  readonly freehandPoints?: readonly (readonly [number, number])[];
  readonly colorHex?: string;
  readonly surfaceFinish?: MapObjectSurfaceFinish;
  readonly brushSharpness?: number;
  readonly terrainFeathering?: number;
}

@Injectable({ providedIn: 'root' })
export class BabylonMapStageService {
  readonly wallBrush = new WallBrushController();
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private cameraViews: MapCameraViews | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private wheelAbortController: AbortController | null = null;
  private selectedPosition: Vector3 | null = null;
  private selectedGizmoRadius = 1.1;
  readonly lightDrag = new LightDragController();
  private hideGmSecrets = false;
  private snapToGrid = true;
  private surfaceLockEnabled = false;
  private lastState: MapSceneGraphState | null = null;
  private pointerDownClientX = 0;
  private pointerDownClientY = 0;
  private isLeftPointerDown = false;
  private isCameraOrbiting = false;
  private isSpaceKeyHeld = false;
  private lastWallHoverAngleY = 0;
  private lastFpsUpdateMs = 0;
  private holdTimer: ReturnType<typeof setInterval> | null = null;
  private holdTicks = 0;

  private ghostConfig: GhostAssetConfig = {
    enabled: false,
    label: 'Stone Wall Segment',
    kind: 'wall',
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    placementMode: 'floor',
    offsetY: 0,
    rotationRad: 0,
    heightMeters: 3.0,
    thicknessMeters: 0.45,
    wallDrawMode: 'line',
  };
  private wallStartAnchor: { x: number; z: number } | null = null;

  readonly fps = signal<number>(60);
  readonly activeInstanceCount = signal<number>(0);
  readonly lastPickedCoords = signal<{ x: number; z: number }>({ x: 0, z: 0 });
  readonly hoverCoords = signal<{ x: number; z: number }>({ x: 0, z: 0 });

  mountCanvas(
    canvas: HTMLCanvasElement,
    initialState: MapSceneGraphState,
    onGroundClicked: (x: number, z: number, pickedMeta?: PickedSceneEntityMeta) => void,
    onGroundHovered?: (x: number, z: number) => void,
    onSurfaceDrag?: (x: number, z: number, holdTicks: number) => void,
    onSurfaceRelease?: (x: number, z: number) => void,
    onSurfaceStart?: () => void,
  ): void {
    this.dispose();

    try {
      this.engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      this.scene = new Scene(this.engine);
      this.scene.clearColor = new Color4(0.02, 0.06, 0.04, 1);
      this.scene.shadowsEnabled = true;
      GlbModelCache.ensureScene(this.scene);

      this.camera = new ArcRotateCamera(
        'lw-map-cam',
        -Math.PI / 2.25,
        0.78,
        26,
        Vector3.Zero(),
        this.scene,
      );
      this.camera.lowerRadiusLimit = 4;
      this.camera.upperRadiusLimit = 68;
      this.camera.wheelPrecision = 18;
      this.camera.attachControl(canvas, true);
      this.cameraViews = new MapCameraViews(this.scene, this.camera, canvas);
      this.applyCameraPointerButtons();
      this.lightDrag.attach(this.scene, canvas, {
        pickLightId: () => {
          const meta = this.pickSceneEntityMeta();
          return meta?.lwKind === 'light' ? (meta.lwEntityId ?? null) : null;
        },
        pickGround: () => this.pickGroundCoordinates('cell-center'),
        getLight: (id) => this.lastState?.lights.find((l) => l.id === id),
        isCameraOverride: () => this.isSpaceKeyHeld,
      });

      // Intercept laptop trackpad pinch-to-zoom (ctrlKey + wheel) so the browser never zooms the page
      this.wheelAbortController = new AbortController();
      for (const type of ['pointerdown', 'pointermove', 'wheel']) {
        canvas.addEventListener(type, (event) => {
          this.cameraViews?.pointerAt((event as MouseEvent).clientX);
          this.applyCameraPointerButtons();
        }, { capture: true, signal: this.wheelAbortController.signal });
      }
      canvas.addEventListener(
        'wheel',
        (evt: WheelEvent) => {
          evt.preventDefault();
          evt.stopPropagation();
          const zoomCamera = (this.scene?.cameraToUseForPointers ?? this.camera) as ArcRotateCamera | null;
          if (evt.ctrlKey && zoomCamera) {
            const zoomDelta = evt.deltaY * 0.045;
            const minR = zoomCamera.lowerRadiusLimit ?? 4;
            const maxR = zoomCamera.upperRadiusLimit ?? 68;
            zoomCamera.radius = Math.max(minR, Math.min(maxR, zoomCamera.radius + zoomDelta));
          }
        },
        { passive: false, signal: this.wheelAbortController.signal },
      );

      // Prevent browser context menu on right-click so right-click hold & drag always orbits/pans camera smoothly
      canvas.addEventListener(
        'contextmenu',
        (evt: MouseEvent) => {
          evt.preventDefault();
        },
        { signal: this.wheelAbortController.signal },
      );

      if (typeof window !== 'undefined') {
        window.addEventListener(
          'keydown',
          (evt: KeyboardEvent) => {
            if (evt.code === 'Space' && !this.isSpaceKeyHeld) {
              this.isSpaceKeyHeld = true;
              this.applyCameraPointerButtons();
            }
          },
          { signal: this.wheelAbortController.signal },
        );
        window.addEventListener(
          'keyup',
          (evt: KeyboardEvent) => {
            if (evt.code === 'Space') {
              this.isSpaceKeyHeld = false;
              this.applyCameraPointerButtons();
            }
          },
          { signal: this.wheelAbortController.signal },
        );
      }

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.engine?.resize();
        });
        this.resizeObserver.observe(canvas);
      }

      const cancelSurfaceStroke=() => {
        if(this.isLeftPointerDown) {
          this.isLeftPointerDown=false;this.stopHoldTimer();
          const h=this.hoverCoords();onSurfaceRelease?.(h.x,h.z);
        }
        this.wallBrush.finish();
      };
      canvas.addEventListener('pointercancel',cancelSurfaceStroke,{signal:this.wheelAbortController.signal});
      window.addEventListener('blur',cancelSurfaceStroke,{signal:this.wheelAbortController.signal});

      this.scene.onPointerObservable.add((pointerInfo) => {
        if (!this.scene) return;
        const evt = pointerInfo.event as PointerEvent;

        if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
          this.pointerDownClientX = evt.clientX;
          this.pointerDownClientY = evt.clientY;
          const isTempCameraOverride =
            evt.button === 1 || evt.button === 2 || evt.altKey || this.isSpaceKeyHeld;

          if (isTempCameraOverride) {
            this.isCameraOrbiting = true;
            this.isLeftPointerDown = false;
            this.stopHoldTimer();
            this.applyCameraPointerButtons(true);
            this.clearGhostMeshes();
            return;
          }

          if (this.wallBrush.handle(this.scene, pointerInfo.type, evt)) return;

          if (evt.button === 0) {
            this.isLeftPointerDown = true;
            try { canvas.setPointerCapture(evt.pointerId); } catch { /* Pointer already released. */ }
            this.holdTicks = 0;
            const groundPt = this.pickGroundCoordinates();
            if (groundPt && this.surfaceLockEnabled && onSurfaceDrag) {
              this.hoverCoords.set(groundPt);
              onSurfaceStart?.();
              onSurfaceDrag(groundPt.x, groundPt.z, 0);
              this.startHoldTimer(onSurfaceDrag);
            }
          }
          return;
        }

        if (pointerInfo.type === PointerEventTypes.POINTERUP) {
          if (!this.isCameraOrbiting && this.wallBrush.handle(this.scene, pointerInfo.type, evt)) return;
          const wasLeftDown = this.isLeftPointerDown;
          const wasCameraOrbiting = this.isCameraOrbiting;
          this.isLeftPointerDown = false;
          this.isCameraOrbiting = false;
          this.stopHoldTimer();
          this.applyCameraPointerButtons(false);

          const groundPt = this.pickGroundCoordinates();
          if (groundPt) {
            this.hoverCoords.set(groundPt);
            this.updateGhostMeshAt(groundPt.x, groundPt.z);
          }

          if (wasCameraOrbiting || evt.button !== 0 || !wasLeftDown) {
            return;
          }
          const dragDist = Math.hypot(
            evt.clientX - this.pointerDownClientX,
            evt.clientY - this.pointerDownClientY,
          );
          if (this.surfaceLockEnabled && onSurfaceRelease) {
            const release=groundPt ?? this.hoverCoords();
            onSurfaceRelease(release.x,release.z);
          }
          if (dragDist > 7 && !this.surfaceLockEnabled) {
            return;
          }
          if (!groundPt) return;

          const pickedMeta = this.pickSceneEntityMeta();
          this.lastPickedCoords.set(groundPt);
          onGroundClicked(groundPt.x, groundPt.z, pickedMeta);
          return;
        }

        if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
          if (!this.isCameraOrbiting && this.wallBrush.handle(this.scene, pointerInfo.type, evt)) return;
          if (this.isCameraOrbiting) {
            return;
          }

          if (this.isLeftPointerDown && !this.surfaceLockEnabled) {
            const dragDist = Math.hypot(
              evt.clientX - this.pointerDownClientX,
              evt.clientY - this.pointerDownClientY,
            );
            if (dragDist > 7) {
              // Temporarily hide placement ghost while holding & dragging mouse to adjust camera
              this.clearGhostMeshes();
              return;
            }
          }

          const groundPt = this.pickGroundCoordinates();
          if (!groundPt) return;

          this.hoverCoords.set(groundPt);
          this.updateGhostMeshAt(groundPt.x, groundPt.z);
          if (onGroundHovered) {
            onGroundHovered(groundPt.x, groundPt.z);
          }
          if (this.isLeftPointerDown && this.surfaceLockEnabled && onSurfaceDrag) {
            onSurfaceDrag(groundPt.x, groundPt.z, this.holdTicks);
          }
        }
      });

      this.syncSceneGraph(initialState);

      this.engine.runRenderLoop(() => {
        if (this.scene && this.engine) {
          this.cameraViews?.update();
          this.scene.render();
          const now = performance.now();
          if (now - this.lastFpsUpdateMs >= 500) {
            this.lastFpsUpdateMs = now;
            const nextFps = Math.round(this.engine.getFps());
            if (this.fps() !== nextFps) {
              this.fps.set(nextFps);
            }
          }
        }
      });
    } catch {
      // Headless or non-WebGL browser environment fallback
    }
  }

  private startHoldTimer(onSurfaceDrag: (x: number, z: number, holdTicks: number) => void): void {
    this.stopHoldTimer();
    this.holdTimer = setInterval(() => {
      if (!this.isLeftPointerDown || !this.surfaceLockEnabled) {
        this.stopHoldTimer();
        return;
      }
      this.holdTicks++;
      const h = this.hoverCoords();
      onSurfaceDrag(h.x, h.z, this.holdTicks);
    }, 65);
  }

  private stopHoldTimer(): void {
    if (this.holdTimer) {
      clearInterval(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private resolveActiveSnapKind(): 'wall' | 'cell-center' | 'free' {
    if (!this.ghostConfig.enabled) return 'free';
    if (this.ghostConfig.kind === 'wall') return 'wall';
    if (
      this.ghostConfig.kind === 'prop' ||
      this.ghostConfig.kind === 'decal' ||
      this.ghostConfig.kind === 'light'
    ) {
      return 'cell-center';
    }
    return 'free';
  }

  private pickGroundCoordinates(forceSnapKind?: 'wall' | 'cell-center' | 'free'): { x: number; z: number } | null {
    if (!this.scene) return null;
    const snapKind = forceSnapKind ?? this.resolveActiveSnapKind();
    let rawX: number | null = null;
    let rawZ: number | null = null;

    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (m) => m.name === 'lw-terrain-ground',
    );
    if (pick?.hit && pick.pickedPoint) {
      rawX = pick.pickedPoint.x;
      rawZ = pick.pickedPoint.z;
    } else {
      const ray = this.scene.createPickingRay(
        this.scene.pointerX,
        this.scene.pointerY,
        null,
        this.scene.cameraToUseForPointers ?? this.camera,
      );
      if (Math.abs(ray.direction.y) > 0.0001) {
        const t = -ray.origin.y / ray.direction.y;
        if (t > 0) {
          rawX = ray.origin.x + ray.direction.x * t;
          rawZ = ray.origin.z + ray.direction.z * t;
        }
      }
    }

    if (rawX === null || rawZ === null) return null;

    if (snapKind === 'wall') {
      const snappedWall = WallMeshBuilder.snapWallCursorPoint(
        this.lastState?.walls,
        rawX,
        rawZ,
        this.wallStartAnchor,
        this.snapToGrid,
      );
      this.lastWallHoverAngleY = snappedWall.previewAngleY;
      return { x: snappedWall.x, z: snappedWall.z };
    }

    return TerrainMeshBuilder.snapWorldCoordinates(rawX, rawZ, this.snapToGrid, snapKind);
  }

  private pickSceneEntityMeta(): PickedSceneEntityMeta | undefined {
    if (!this.scene) return undefined;
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (m) =>
        m.isPickable &&
        m.name !== 'lw-terrain-ground' &&
        !m.name.startsWith('lw-ghost-') &&
        !m.name.startsWith('lw-gizmo-') &&
        (Boolean(m.metadata?.lwKind) ||
          Boolean(m.metadata?.lwNodeName) ||
          m.name.startsWith('lw-wall-') ||
          m.name.startsWith('lw-door-') ||
          m.name.startsWith('lw-stamp-') ||
          m.name.startsWith('lw-light-orb-')),
    );
    if (!pick?.hit || !pick.pickedMesh) return undefined;
    const meta = (pick.pickedMesh.metadata ?? {}) as PickedSceneEntityMeta;
    return {
      lwNodeName: meta.lwNodeName ?? pick.pickedMesh.name,
      lwKind: meta.lwKind,
      lwEntityId: meta.lwEntityId,
      lwWallId: meta.lwWallId,
    };
  }

  setSurfaceDrawingLock(locked: boolean): void {
    this.surfaceLockEnabled = locked;
    this.applyCameraPointerButtons();
  }

  private applyCameraPointerButtons(forceAllButtons = false): void {
    if (!this.camera) return;
    const pointers = (this.scene?.cameraToUseForPointers ?? this.camera).inputs.attached['pointers'] as
      | ArcRotateCameraPointersInput
      | undefined;
    if (pointers) {
      const allowLeftButtonOrbit =
        forceAllButtons || this.isSpaceKeyHeld || !this.surfaceLockEnabled;
      pointers.buttons = allowLeftButtonOrbit ? [0, 1, 2] : [1, 2];
    }
  }

  setSnapToGrid(snap: boolean): void {
    this.snapToGrid = snap;
  }

  setGhostConfig(config: GhostAssetConfig, wallAnchor: { x: number; z: number } | null): void {
    this.ghostConfig = config;
    this.wallStartAnchor = wallAnchor;
    if (this.scene && config.modelUrl) {
      GlbModelCache.getOrLoadTemplate(this.scene, config.modelUrl, () => {
        const h = this.hoverCoords();
        this.updateGhostMeshAt(h.x, h.z);
      });
    }
    const h = this.hoverCoords();
    this.updateGhostMeshAt(h.x, h.z);
  }

  private clearGhostMeshes(): void {
    if (!this.scene) return;
    this.scene.transformNodes
      .filter((n) => n.name.startsWith('lw-ghost-'))
      .forEach((n) => n.dispose(false, false));
    this.scene.meshes
      .filter((m) => m.name.startsWith('lw-ghost-'))
      .forEach((m) => m.dispose(false, false));
  }

  private updateGhostMeshAt(gx: number, gz: number): void {
    if (!this.scene) return;
    this.clearGhostMeshes();

    if (!this.ghostConfig.enabled || this.isCameraOrbiting) return;

    const groundY = TerrainMeshBuilder.sampleElevationAt(this.scene, gx, gz);

    // Wall Line & Room Ghost: shows snapped 3D stone wall stamp on hover before 1st click,
    // and snapped wall/room span preview while drawing from start anchor to cursor
    if (this.ghostConfig.kind === 'wall') {
      if (
        this.wallStartAnchor ||
        (this.ghostConfig.wallDrawMode === 'freehand' &&
          (this.ghostConfig.freehandPoints?.length ?? 0) >= 2)
      ) {
        const startX = this.wallStartAnchor?.x ?? gx;
        const startZ = this.wallStartAnchor?.z ?? gz;
        WallMeshBuilder.renderGhostWallPreview(
          this.scene,
          this.ghostConfig.wallDrawMode,
          startX,
          startZ,
          gx,
          gz,
          this.ghostConfig.heightMeters,
          this.ghostConfig.thicknessMeters,
          this.ghostConfig.freehandPoints,
          this.snapToGrid,
        );
      } else {
        WallMeshBuilder.renderHoverWallStampPreview(
          this.scene,
          gx,
          gz,
          this.lastWallHoverAngleY,
          this.ghostConfig.modelUrl,
          this.ghostConfig.heightMeters,
          this.ghostConfig.thicknessMeters,
          this.ghostConfig.wallOffsetY ?? -0.06,
          this.ghostConfig.wallStampScale ?? 1.0,
          this.ghostConfig.wallRotationOffsetDeg ?? 0,
        );
      }
      return;
    }

    // Terrain, Water, Scatter, or Floor Paint Brush: outline circle conforming 1:1 to terrain
    if (
      this.ghostConfig.kind === 'terrain' ||
      this.ghostConfig.kind === 'water' ||
      this.ghostConfig.kind === 'scatter' ||
      this.ghostConfig.kind === 'floor-paint'
    ) {
      const waterRadius=Math.max(.4,this.ghostConfig.scale);
      const radius=waterRadius+(this.ghostConfig.kind==='water'?this.ghostConfig.waterBankWidth ?? 0:0);
      const pts: Vector3[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const px = gx + Math.cos(angle) * radius;
        const pz = gz + Math.sin(angle) * radius;
        const py = TerrainMeshBuilder.sampleElevationAt(this.scene, px, pz) + 0.08;
        pts.push(new Vector3(px, py, pz));
      }
      const ring = MeshBuilder.CreateLines('lw-ghost-terrain-ring', { points: pts }, this.scene);
      ring.color = Color3.FromHexString(
        this.ghostConfig.kind === 'water'
          ? '#38bdf8'
          : this.ghostConfig.kind === 'floor-paint'
            ? this.ghostConfig.colorHex || '#49e892'
            : '#49e892',
      );
      ring.isPickable = false;

      // For Terrain Raise/Lower or Floor Paint Brush, also render the inner feathering core ring
      if (this.ghostConfig.kind === 'floor-paint' || this.ghostConfig.kind === 'terrain' || this.ghostConfig.kind === 'water') {
        const coreFrac =
          this.ghostConfig.kind === 'floor-paint'
            ? Math.max(0.08, Math.min(0.95, (this.ghostConfig.brushSharpness ?? 25) / 100))
            : Math.max(
                0.08,
                Math.min(0.95, 1.0 - ((this.ghostConfig.terrainFeathering ?? 80) / 100) * 0.92),
              );
        const innerR = this.ghostConfig.kind==='water'?waterRadius:radius*coreFrac;
        const innerPts: Vector3[] = [];
        for (let i = 0; i <= 36; i++) {
          const angle = (i / 36) * Math.PI * 2;
          const px = gx + Math.cos(angle) * innerR;
          const pz = gz + Math.sin(angle) * innerR;
          const py = TerrainMeshBuilder.sampleElevationAt(this.scene, px, pz) + 0.085;
          innerPts.push(new Vector3(px, py, pz));
        }
        const innerRing = MeshBuilder.CreateLines(
          'lw-ghost-paint-feather-ring',
          { points: innerPts },
          this.scene,
        );
        innerRing.color = Color3.FromHexString('#d9b77a');
        innerRing.isPickable = false;
      }
      return;
    }

    // Lights place as pure emitters: no ghost preview and no radius outline.
    if (this.ghostConfig.kind === 'light') return;

    // Door ghost: snap to closest wall segment if near a wall
    if (this.ghostConfig.kind === 'door') {
      const hit = WallMeshBuilder.findClosestWallAttachment(this.lastState?.walls, gx, gz, 4.5);
      const dx = hit ? hit.x : gx;
      const dz = hit ? hit.z : gz;
      const rotY = hit ? hit.angleY : this.ghostConfig.rotationRad;
      const dy = TerrainMeshBuilder.sampleElevationAt(this.scene, dx, dz);
      const doorUrl =
        this.ghostConfig.modelUrl || '/assets/object-library/models/obj-89c62a2b01238531.glb';
      const tpl = GlbModelCache.getOrLoadTemplate(this.scene, doorUrl);
      if (tpl) {
        const inst = GlbModelCache.instantiateClone(
          this.scene,
          tpl,
          'lw-ghost-cursor-door',
          this.ghostConfig.scale,
          this.ghostConfig.heightMeters,
          this.ghostConfig.thicknessMeters * 1.35,
          false,
          true,
        );
        inst.position.set(dx, dy, dz);
        inst.rotation.y = rotY;
        return;
      }
    }

    const effectiveOffsetY =
      this.ghostConfig.placementMode === 'custom' ? (this.ghostConfig.offsetY ?? 0) : 0;
    const cellMeters = TerrainMeshBuilder.getCellStepMeters(); // 1.5m = 1 grid square (1x1x1)
    const sx = (this.ghostConfig.scaleX ?? 1) * this.ghostConfig.scale;
    const sy = (this.ghostConfig.scaleY ?? 1) * this.ghostConfig.scale;
    const sz = (this.ghostConfig.scaleZ ?? 1) * this.ghostConfig.scale;

    // 2D Cutout Stamp Decal Ghost (sized 1x1 grid square by default)
    if (this.ghostConfig.kind === 'decal' && this.ghostConfig.albedoUrl) {
      const decal = MeshBuilder.CreateGround(
        'lw-ghost-cursor-decal',
        { width: cellMeters * sx, height: cellMeters * sz },
        this.scene,
      );
      decal.position.set(gx, groundY + 0.05 + effectiveOffsetY, gz);
      decal.rotation.y = this.ghostConfig.rotationRad;
      decal.material = GlbModelCache.getSharedGhostMaterial(this.scene);
      decal.isPickable = false;
      return;
    }

    // 3D Object Ghost (sized 1x1x1 grid square = 1.5m x 1.5m x 1.5m by default, flush on floor)
    if (this.ghostConfig.modelUrl) {
      const tpl = GlbModelCache.getOrLoadTemplate(this.scene, this.ghostConfig.modelUrl);
      if (tpl) {
        const isUniform =
          Math.abs(sx - sy) < 0.01 && Math.abs(sy - sz) < 0.01;
        const inst = GlbModelCache.instantiateClone(
          this.scene,
          tpl,
          'lw-ghost-cursor-glb',
          cellMeters * sx,
          cellMeters * sy,
          cellMeters * sz,
          isUniform,
          true,
        );
        inst.position.set(gx, groundY + effectiveOffsetY, gz);
        inst.rotation.y = this.ghostConfig.rotationRad;
        return;
      }
    }

  }

  applyFloorBumpMap(
    albedoUrl: string,
    normalUrl: string,
    tilingScale = 10,
    heightUrl?: string,
  ): void {
    if (!this.scene) return;
    TerrainMeshBuilder.applyFloorBumpTexture(
      this.scene,
      albedoUrl,
      normalUrl,
      tilingScale,
      heightUrl,
    );
  }

  configureFloorProperties(config: FloorBumpAndColorConfig): void {
    if (!this.scene) return;
    TerrainMeshBuilder.configureFloorProperties(this.scene, config);
  }

  paintFloorStrokeAt(dab: MapFloorPaintDab): void {
    TerrainMeshBuilder.paintFloorStrokeAt(this.scene, dab);
  }

  clearFloorPaint(): void {
    TerrainMeshBuilder.clearFloorPaint(this.scene);
  }

  sampleWaterBankElevation(x: number, z: number): number {
    return this.scene ? WaterChannelTerrain.sampleBase(this.scene,x,z) : 0;
  }

  resetTerrainElevations(): void {
    TerrainMeshBuilder.resetElevations();
    if (this.scene) {
      const existingGround = this.scene.getMeshByName('lw-terrain-ground');
      existingGround?.dispose();
      if (this.lastState) {
        TerrainMeshBuilder.buildTerrainAndGrid(
          this.scene,
          this.lastState.biome,
          this.lastState.terrainRelief,
        );
      }
    }
  }

  sculptTerrainAt(
    worldX: number,
    worldZ: number,
    radius: number,
    deltaY: number,
    mode: 'raise' | 'lower' | 'flatten' | 'smooth',
    featheringPct = 80,
    plateauLimit = 6.0,
  ): void {
    if (!this.scene) return;
    TerrainMeshBuilder.sculptElevationAt(
      this.scene,
      worldX,
      worldZ,
      radius,
      deltaY,
      mode,
      featheringPct,
      plateauLimit,
    );
    if (this.lastState) {
      const ground = this.scene.getMeshByName('lw-terrain-ground');
      if (ground) TerrainMeshBuilder.applyVertexReliefAndHeightMap(this.scene, ground as import('@babylonjs/core').Mesh, this.lastState.terrainRelief);
      WallMeshBuilder.rebuildWallMeshes(this.scene, this.lastState.walls, this.hideGmSecrets);
      WaterSplineBuilder.rebuildWaterSplines(this.scene, this.lastState.waterSplines);
      this.rebuildStamps(this.scene, this.lastState.stamps);
    }
    this.updateGhostMeshAt(worldX, worldZ);
  }

  updateCelestialLight(config: CelestialLightConfig): void {
    if (!this.scene) return;
    SceneLightingController.syncCelestialDirectionalLight(this.scene, config);
  }

  setGridMode(mode: string): void {
    if (!this.scene) return;
    TerrainMeshBuilder.setGridMode(this.scene, mode);
  }

  setCameraMode(mode: MapRenderMode | string): void {
    this.cameraViews?.setMode(mode);
    this.applyCameraPointerButtons();
  }

  setQualityPreset(preset: string): void {
    if (!this.engine) return;
    if (GlbModelCache.setLodTier(lodTierForQualityPreset(preset)) && this.lastState) {
      this.syncSceneGraph(this.lastState);
    }
    if (preset === 'Cinematic 3D') {
      this.engine.setHardwareScalingLevel(0.85);
    } else if (preset === 'Performance 3D' || preset === 'Classic 2D') {
      this.engine.setHardwareScalingLevel(1.5);
    } else {
      this.engine.setHardwareScalingLevel(1.0);
    }
  }

  setPlayerSafeFilter(hideSecrets: boolean, state: MapSceneGraphState): void {
    this.hideGmSecrets = hideSecrets;
    this.syncSceneGraph(state);
  }

  focusGizmoAt(x: number | null, y = 0.1, z = 0, radius = 1.1): void {
    this.selectedGizmoRadius = radius;
    if (x === null) {
      this.selectedPosition = null;
    } else {
      const groundY = this.scene ? TerrainMeshBuilder.sampleElevationAt(this.scene, x, z) : 0;
      this.selectedPosition = new Vector3(x, groundY + y, z);
    }
    this.rebuildSelectionGizmo();
  }

  syncSceneGraph(state: MapSceneGraphState): void {
    if (!this.scene) return;
    this.lastState = state;

    WaterChannelTerrain.configure(this.scene, state.waterSplines);
    const ground = TerrainMeshBuilder.buildTerrainAndGrid(this.scene, state.biome, state.terrainRelief);
    if (state.floorAlbedoUrl && state.floorNormalUrl) {
      TerrainMeshBuilder.applyFloorBumpTexture(
        this.scene,
        state.floorAlbedoUrl,
        state.floorNormalUrl,
        state.floorTilingScale ?? 10,
        state.floorHeightUrl,
      );
    }
    TerrainMeshBuilder.applyVertexReliefAndHeightMap(this.scene, ground, state.terrainRelief);
    TerrainMeshBuilder.rebuildGridOverlay(this.scene);
    WaterSplineBuilder.rebuildWaterSplines(this.scene, state.waterSplines);
    SceneLightingController.syncLights(this.scene, state.lights);
    const scatterCount = SeededScatterEngine.rebuildScatterInstances(
      this.scene,
      state.scatterSeed,
      state.scatterDensity,
      state.scatterClusters,
      () => {
        if (this.lastState) this.syncSceneGraph(this.lastState);
      },
    );
    const wallCount = WallMeshBuilder.rebuildWallMeshes(
      this.scene,
      state.walls,
      this.hideGmSecrets,
      () => {
        if (this.lastState) this.syncSceneGraph(this.lastState);
      },
    );
    const pathCount = PathRibbonEngine.rebuildPathRibbonMeshes(this.scene, state.pathRibbons);
    this.rebuildStamps(this.scene, state.stamps);
    SceneLightingController.refreshShadowCasters(this.scene);
    this.rebuildSelectionGizmo();
    this.activeInstanceCount.set(
      scatterCount + state.stamps.length + state.lights.length + wallCount + pathCount,
    );
  }

  private rebuildStamps(scene: Scene, stamps: readonly MapStampNode[]): void {
    scene.transformNodes
      .filter((n) => n.name.startsWith('lw-stamp-node-'))
      .forEach((n) => n.dispose(false, false));
    scene.meshes
      .filter((m) => m.name.startsWith('lw-stamp-'))
      .forEach((m) => m.dispose(false, false));

    const cellMeters = TerrainMeshBuilder.getCellStepMeters(); // 1.5m = 1x1x1 grid square

    for (const st of stamps) {
      if (this.hideGmSecrets && (st.gmSecretOnly || st.label.toLowerCase().includes('secret'))) {
        continue;
      }
      const groundY = TerrainMeshBuilder.sampleElevationAt(scene, st.x, st.z);
      const offsetY = st.placementMode === 'custom' ? (st.offsetY ?? 0) : 0;
      const stampMeta: GlbCloneMetadata = {
        lwNodeName: `lw-stamp-${st.id}`,
        lwKind: 'object',
        lwEntityId: st.id,
      };
      const sx = (st.scaleX ?? 1) * st.scale;
      const sy = (st.scaleY ?? 1) * st.scale;
      const sz = (st.scaleZ ?? 1) * st.scale;

      // 1. Real 3D Asset Model (1x1x1 = 1.5m x 1.5m x 1.5m, flush on floor by default)
      if (st.modelUrl) {
        const tpl = GlbModelCache.getOrLoadTemplate(scene, st.modelUrl, () => {
          if (this.lastState) {
            this.rebuildStamps(scene, this.lastState.stamps);
            SceneLightingController.refreshShadowCasters(scene);
          }
        });
        if (tpl) {
          const isUniform =
            Math.abs(sx - sy) < 0.01 && Math.abs(sy - sz) < 0.01;
          const inst = GlbModelCache.instantiateClone(
            scene,
            tpl,
            `lw-stamp-node-${st.id}`,
            cellMeters * sx,
            cellMeters * sy,
            cellMeters * sz,
            isUniform,
            false,
            stampMeta,
            {
              colorHex: st.colorHex,
              surfaceFinish: st.surfaceFinish,
              opacity: st.opacity,
            },
          );
          inst.position.set(st.x, groundY + offsetY, st.z);
          inst.rotation.y = st.rotationY;
          inst.rotation.x = ((st.tiltX ?? 0) * Math.PI) / 180;
          continue;
        }
      }

      // 2. 2D Cutout Floor Stamp / Decal
      const texUrl = st.albedoUrl || st.thumbnailUrl;
      if (texUrl) {
        const decal = MeshBuilder.CreateGround(
          `lw-stamp-${st.id}`,
          { width: cellMeters * sx, height: cellMeters * sz },
          scene,
        );
        decal.position.set(st.x, groundY + 0.04 + offsetY, st.z);
        decal.rotation.y = st.rotationY;
        decal.receiveShadows = true;
        decal.metadata = stampMeta;

        const matName = `lw-stamp-decal-mat-${st.id}`;
        const existingMat = scene.getMaterialByName(matName) as StandardMaterial | null;
        if (existingMat) {
          existingMat.dispose(false, false);
        }
        const dMat = new StandardMaterial(matName, scene);
        const diffTex = new Texture(texUrl, scene);
        diffTex.hasAlpha = true;
        dMat.diffuseTexture = diffTex;
        dMat.useAlphaFromDiffuseTexture = true;
        dMat.diffuseColor =
          st.colorHex && st.colorHex.toLowerCase() !== '#ffffff'
            ? Color3.FromHexString(st.colorHex)
            : Color3.White();
        dMat.alpha = st.opacity ?? 1.0;
        dMat.specularColor = Color3.FromHexString('#18221c');
        if (st.normalUrl) {
          const bumpTex = new Texture(st.normalUrl, scene);
          bumpTex.level = 1.25;
          dMat.bumpTexture = bumpTex;
        }
        decal.material = dMat;
      }
    }
  }

  private rebuildSelectionGizmo(): void {
    if (!this.scene) return;
    this.scene.meshes
      .filter((m) => m.name.startsWith('lw-gizmo-'))
      .forEach((m) => m.dispose());

    if (!this.selectedPosition) return;

    const pos = this.selectedPosition;
    const pts: Vector3[] = [];
    const r = this.selectedGizmoRadius;
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      pts.push(new Vector3(pos.x + Math.cos(a) * r, pos.y + 0.06, pos.z + Math.sin(a) * r));
    }
    const selRing = MeshBuilder.CreateLines('lw-gizmo-ring', { points: pts }, this.scene);
    selRing.color = Color3.FromHexString('#49e892');
    selRing.isPickable = false;
    if (r < 1) {
      // Compact marker: a stem to the floor shows where an elevated emitter sits.
      const floorY = TerrainMeshBuilder.sampleElevationAt(this.scene, pos.x, pos.z);
      const stem = MeshBuilder.CreateLines(
        'lw-gizmo-stem',
        { points: [new Vector3(pos.x, floorY, pos.z), pos.clone()] },
        this.scene,
      );
      stem.color = Color3.FromHexString('#49e892');
      stem.isPickable = false;
    }
  }

  /** Lights are draggable and show editing handles only while the select or lighting tool is active. */
  setLightEditing(dragEnabled: boolean, handlesVisible: boolean): void {
    this.lightDrag.enabled = dragEnabled;
    if (this.scene) LightFixtureBuilder.setHandlesVisible(this.scene, handlesVisible);
  }

  resize(): void {
    this.engine?.resize();
  }

  dispose(): void {
    this.stopHoldTimer();
    this.wheelAbortController?.abort();
    this.wheelAbortController = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
    this.camera = null;
    this.cameraViews = null;
  }
}
