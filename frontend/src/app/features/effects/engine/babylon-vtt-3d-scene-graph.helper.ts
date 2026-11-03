import {
  ArcRotateCamera,
  ArcRotateCameraPointersInput,
  Color3,
  Engine,
  Mesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { MapSceneGraphState } from '../../maps/engine/map-scene-contract';
import { GlbModelCache } from '../../maps/engine/rendering/glb-model-cache';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';
import { WaterChannelTerrain } from '../../maps/engine/water/water-channel-terrain';
import { WaterSplineBuilder } from '../../maps/engine/water/water-spline.builder';
import { SceneLightingController } from '../../maps/engine/lighting/scene-lighting.controller';
import { LightFixtureBuilder } from '../../maps/engine/lighting/light-fixture.builder';
import { SeededScatterEngine } from '../../maps/engine/scatter/seeded-scatter.engine';
import { WallMeshBuilder } from '../../maps/engine/walls/wall-mesh.builder';
import { PathRibbonEngine } from '../../maps/engine/paths/path-ribbon.engine';
import { StampSceneBuilder } from '../../maps/engine/rendering/stamp-scene.builder';
import { TokenDragController } from './token-drag-controller';

export function isMapSceneGraphStatePayload(obj: unknown): obj is MapSceneGraphState {
  if (!obj || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;
  if (typeof rec['biome'] === 'string' && typeof rec['terrainRelief'] === 'number') return true;
  if (Array.isArray(rec['waterSplines']) || Array.isArray(rec['customElevations'])) return true;
  if (typeof rec['floorAlbedoUrl'] === 'string') return true;
  return (
    Array.isArray(rec['walls']) &&
    rec['walls'].some((w) => w && typeof w === 'object' && Array.isArray((w as Record<string, unknown>)['points']))
  );
}

export function sync3dMapSceneGraph(
  scene: Scene,
  state: MapSceneGraphState,
  ground: Mesh | null,
  gridVisible: boolean,
  onScheduleResync: () => void,
  gridScale: number = 1.0,
  gridOffsetX: number = 0.0,
  gridOffsetY: number = 0.0,
): void {
  if (ground) {
    ground.isVisible = false;
    ground.isPickable = false;
  }
  scene.getLightByName('lw-vtt-hemi')?.setEnabled(false);
  scene.getLightByName('lw-vtt-pt')?.setEnabled(false);

  GlbModelCache.ensureScene(scene);
  TerrainMeshBuilder.importElevations(state.customElevations ?? null);
  TerrainMeshBuilder.setPaintDabs(scene, state.floorPaintDabs ?? []);
  WaterChannelTerrain.configure(scene, state.waterSplines ?? []);

  const terrainGround = TerrainMeshBuilder.buildTerrainAndGrid(
    scene,
    state.biome || 'Abandoned Crypt',
    state.terrainRelief ?? 0.35,
  );
  if (state.floorAlbedoUrl && state.floorNormalUrl) {
    TerrainMeshBuilder.applyFloorBumpTexture(
      scene,
      state.floorAlbedoUrl,
      state.floorNormalUrl,
      state.floorTilingScale ?? 10,
      state.floorHeightUrl,
    );
  }
  TerrainMeshBuilder.configureFloorProperties(scene, {
    albedoUrl: state.floorAlbedoUrl,
    normalUrl: state.floorNormalUrl,
    heightUrl: state.floorHeightUrl,
    tilingScale: state.floorTilingScale,
    bumpIntensity: state.floorBumpIntensity,
    heightScale: state.floorHeightScale,
    colorHex: state.floorColorHex,
    colorStrength: state.floorColorStrength,
    colorBlendMode: state.floorColorBlendMode,
  });
  TerrainMeshBuilder.syncReliefAndGridIfChanged(
    scene,
    terrainGround,
    state.terrainRelief ?? 0.35,
    state.waterSplines?.length ?? 0,
  );
  TerrainMeshBuilder.configureGrid(scene, {
    mode: gridVisible ? '5 ft' : 'Off',
    scaleFactor: gridScale,
    offsetX: (gridOffsetX / 50) * 1.5,
    offsetZ: (gridOffsetY / 50) * 1.5,
  });

  const terrainGrid = scene.getMeshByName('lw-terrain-grid');
  if (terrainGrid) {
    terrainGrid.isVisible = gridVisible;
    terrainGrid.isPickable = false;
  }

  WaterSplineBuilder.rebuildWaterSplines(scene, state.waterSplines ?? []);
  LightFixtureBuilder.setHandlesVisible(scene, false);
  SceneLightingController.syncLights(scene, state.lights ?? []);
  scene.meshes
    .filter((m) => m.name.startsWith('lw-light-orb-') || m.name === 'lw-celestial-sky-orb')
    .forEach((m) => {
      m.visibility = 0;
      m.isVisible = false;
      m.isPickable = false;
    });
  SeededScatterEngine.rebuildScatterInstances(
    scene,
    state.scatterSeed ?? 104729,
    state.scatterDensity ?? 0,
    state.scatterClusters,
    onScheduleResync,
  );
  WallMeshBuilder.rebuildWallMeshes(scene, state.walls, false, onScheduleResync);
  PathRibbonEngine.rebuildPathRibbonMeshes(scene, state.pathRibbons);
  StampSceneBuilder.rebuild(scene, state.stamps ?? [], false, onScheduleResync);
  SceneLightingController.refreshShadowCasters(scene);
}

export function clear3dMapSceneGraph(scene: Scene | null, ground: Mesh | null): void {
  TerrainMeshBuilder.resetElevations();
  if (!scene) return;
  StampSceneBuilder.evictScene(scene);
  WallMeshBuilder.evictScene(scene);
  scene.transformNodes
    .filter((n) => /^lw-(stamp-node|wall-node|door-node|scatter-node)-/.test(n.name))
    .forEach((n) => n.dispose(false, false));
  scene.meshes
    .filter((m) => /^lw-(terrain-ground|terrain-grid|water-|stamp-|wall-|portal-|door-|scatter-|path-)/.test(m.name))
    .forEach((m) => m.dispose(false, false));
  if (ground) {
    ground.isVisible = true;
    ground.isPickable = true;
  }
  scene.getLightByName('lw-vtt-hemi')?.setEnabled(true);
  scene.getLightByName('lw-vtt-pt')?.setEnabled(true);
}

export function createFlatGridLineSystem(
  scene: Scene,
  gridScale: number,
  gridOffsetX: number,
  gridOffsetY: number,
): Mesh {
  const step = Math.max(0.25, 1.0 * gridScale);
  const offsetXWorld = ((gridOffsetX / 50) % step + step) % step;
  const offsetZWorld = ((gridOffsetY / 50) % step + step) % step;
  const lines: Vector3[][] = [];
  for (let x = -12 + offsetXWorld; x <= 12.001; x += step) {
    lines.push([new Vector3(x, 0.025, -8), new Vector3(x, 0.025, 8)]);
  }
  for (let z = -8 - offsetZWorld; z <= 8.001; z += step) {
    lines.push([new Vector3(-12, 0.025, z), new Vector3(12, 0.025, z)]);
  }
  const grid = MeshBuilder.CreateLineSystem('lw-vtt-grid', { lines }, scene);
  grid.color = Color3.FromHexString('#1e3d2f');
  grid.isVisible = true;
  grid.isPickable = false;
  return grid;
}

export function attach2dTopDownPanningObserver(
  scene: Scene,
  getState: () => {
    isForcedTopDown: boolean;
    camera: ArcRotateCamera | null;
    engine: Engine | null;
    dragController: TokenDragController | null;
  },
): () => void {
  let pan2dActive = false;
  let panLastClientX = 0;
  let panLastClientY = 0;
  const panObserver = scene.onPointerObservable.add((info) => {
    const { isForcedTopDown, camera, engine, dragController } = getState();
    if (!isForcedTopDown || !camera || !engine) return;
    const evt = info.event as PointerEvent;
    if (info.type === PointerEventTypes.POINTERDOWN) {
      if (evt.button !== 0 || dragController?.isDragging()) {
        pan2dActive = false;
        return;
      }
      pan2dActive = true;
      panLastClientX = evt.clientX;
      panLastClientY = evt.clientY;
    } else if (info.type === PointerEventTypes.POINTERMOVE) {
      if (!pan2dActive || dragController?.isDragging() || (evt.buttons & 1) === 0) {
        pan2dActive = false;
        return;
      }
      const dx = evt.clientX - panLastClientX;
      const dy = evt.clientY - panLastClientY;
      panLastClientX = evt.clientX;
      panLastClientY = evt.clientY;
      const renderH = Math.max(240, engine.getRenderHeight());
      const worldPerPx = (2 * camera.radius * Math.tan(camera.fov / 2)) / renderH;
      camera.target.x -= dx * worldPerPx;
      camera.target.z += dy * worldPerPx;
      camera.inertialPanningX = 0;
      camera.inertialPanningY = 0;
    } else if (info.type === PointerEventTypes.POINTERUP) {
      pan2dActive = false;
    }
  });
  return () => {
    if (panObserver) scene.onPointerObservable.remove(panObserver);
  };
}

export function restoreCameraAfterTokenDrag(
  camera: ArcRotateCamera,
  canvas: HTMLCanvasElement,
  savedAlpha: number,
  savedBeta: number,
  isForcedTopDown: boolean,
): void {
  camera.inertialAlphaOffset = 0;
  camera.inertialBetaOffset = 0;
  camera.alpha = savedAlpha;
  camera.beta = savedBeta;
  if (isForcedTopDown) {
    camera.lowerAlphaLimit = -Math.PI / 2;
    camera.upperAlphaLimit = -Math.PI / 2;
    camera.lowerBetaLimit = 0.0001;
    camera.upperBetaLimit = 0.0001;
  } else {
    camera.lowerAlphaLimit = null;
    camera.upperAlphaLimit = null;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2.05;
  }
  camera.attachControl(canvas, true);
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
  const p = camera.inputs.attached['pointers'] as ArcRotateCameraPointersInput | undefined;
  if (p) p.buttons = [0, 1, 2];
}

export function pickTokenOrNearbyAtScreenPoint(
  scene: Scene,
  canvas: HTMLCanvasElement,
  ground: Mesh | null,
  clientX: number,
  clientY: number,
  tokens: readonly { key: string; x: number; z: number }[],
  opacityByKey: ReadonlyMap<string, number>,
  gridScale: number,
): string | null {
  const rect = canvas.getBoundingClientRect();
  const cx = clientX - rect.left;
  const cy = clientY - rect.top;
  const hit = scene.pick(cx, cy, (m) => m.isPickable && typeof m.metadata?.tokenKey === 'string');
  if (hit?.hit && typeof hit.pickedMesh?.metadata?.tokenKey === 'string') {
    return hit.pickedMesh.metadata.tokenKey as string;
  }
  const gPick = scene.pick(cx, cy, (m) => m === ground || m.name === 'lw-terrain-ground');
  if (!gPick?.hit || !gPick.pickedPoint) return null;
  const maxRadius = 0.82 * Math.max(0.5, gridScale);
  let bestKey: string | null = null;
  let bestDist = maxRadius;
  for (const t of tokens) {
    if ((opacityByKey.get(t.key) ?? 1) <= 0.05) continue;
    const d = Math.hypot(gPick.pickedPoint.x - t.x, gPick.pickedPoint.z - t.z);
    if (d <= bestDist) {
      bestDist = d;
      bestKey = t.key;
    }
  }
  return bestKey;
}
