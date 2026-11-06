import {
  configureFloorRelief,
  loadFloorImage,
  resolveDerivedHeightUrl,
} from './floor-texture-relief';
import { WaterChannelTerrain } from '../water/water-channel-terrain';
import { GlbModelCache } from '../rendering/glb-model-cache';
import { resolveTextureLodUrl } from '../rendering/glb-lod';
import { WallSurfacePaint } from '../walls/wall-surface-paint';
import {
  Color3,
  DynamicTexture,
  Material,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { MapFloorBlendMode, MapFloorPaintDab } from '../map-scene-contract';

export type LwFloorGridMode = '5 ft' | '10 ft' | 'Hex' | 'Off';
export type LwFloorSurfaceFinish = 'matte' | 'semi-glossy' | 'shiny';

export interface FloorBumpAndColorConfig {
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly heightUrl?: string;
  readonly tilingScale?: number;
  readonly bumpIntensity?: number;
  readonly heightScale?: number;
  readonly surfaceFinish?: LwFloorSurfaceFinish;
  readonly roughness?: number;
  readonly specularIntensity?: number;
  readonly ambientOcclusion?: number;
  readonly colorHex?: string;
  readonly colorStrength?: number;
  readonly colorBlendMode?: MapFloorBlendMode;
}

export interface FloorGridConfig {
  readonly mode?: string;
  readonly scaleFactor?: number;
  readonly offsetX?: number;
  readonly offsetZ?: number;
  readonly opacity?: number;
}

export class TerrainMeshBuilder {
  static readonly GROUND_W = 75;
  static readonly GROUND_H = 75;
  static readonly BASE_GRID_SQUARES = 50;
  private static readonly SUBDIV = 96;
  private static readonly COMP_SIZE = 1024;
  private static readonly TILE_SIZE = 512;

  private static customElevations: Float32Array | null = null;
  private static elevationVersion = 0;
  private static appliedFloorSigByScene = new WeakMap<Scene, string>();
  private static appliedReliefSigByScene = new WeakMap<Scene, string>();
  private static floorTexCache = new WeakMap<Scene, Map<string, Texture>>();
  private static activeAlbedoUrl =
    '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone.png';
  private static activeNormalUrl =
    '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone_normal.png';
  private static activeHeightUrl =
    '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone_height.png';
  private static floorTilingScale = 18;
  private static floorBumpIntensity = 135; // 0% to 300%
  private static floorHeightScale = 100; // 0% to 220%
  private static floorSurfaceFinish: LwFloorSurfaceFinish = 'matte';
  private static floorRoughness = 82; // 0% (wet/glossy) to 100% (matte)
  private static floorSpecularIntensity = 22; // 0% to 150%
  private static floorAmbientOcclusion = 65; // 0% to 150%
  private static floorColorHex = '#ffffff';
  private static floorColorStrength = 0; // 0% to 100%
  private static floorColorBlendMode: MapFloorBlendMode = 'multiply';

  private static activeGridMode: LwFloorGridMode = '5 ft';
  private static gridScaleFactor = 1.0; // 0.5x to 2.5x
  private static gridOffsetX = 0; // -1.5m to +1.5m
  private static gridOffsetZ = 0; // -1.5m to +1.5m
  private static gridOpacity = 0.78; // 0.15 to 1.0

  private static paintDabs: MapFloorPaintDab[] = [];
  private static processedTileCanvas: HTMLCanvasElement | null = null;
  private static tileDynTex: DynamicTexture | null = null;
  private static baseTiledCanvas: HTMLCanvasElement | null = null;
  private static compositeDynTex: DynamicTexture | null = null;
  private static eraserScratchCanvas: HTMLCanvasElement | null = null;
  private static imageCache = new Map<string, HTMLImageElement>();

  static getElevationVersion(): number {
    return this.elevationVersion;
  }

  private static getOrCreateFloorTex(scene: Scene, url: string): Texture {
    let map = this.floorTexCache.get(scene);
    if (!map) {
      map = new Map<string, Texture>();
      this.floorTexCache.set(scene, map);
    }
    const existing = map.get(url);
    if (existing) {
      existing.wrapU = Texture.WRAP_ADDRESSMODE;
      existing.wrapV = Texture.WRAP_ADDRESSMODE;
      return existing;
    }
    const tex = new Texture(url, scene);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    map.set(url, tex);
    return tex;
  }

  static getCellStepMeters(): number {
    const base = this.activeGridMode === '10 ft' ? 3.0 : 1.5;
    return Math.max(0.35, Math.min(4.5, base * this.gridScaleFactor));
  }

  static getGridSquaresAcross(): { cols: number; rows: number } {
    const step = this.getCellStepMeters();
    return {
      cols: Math.max(10, Math.round(this.GROUND_W / step)),
      rows: Math.max(10, Math.round(this.GROUND_H / step)),
    };
  }

  static getGridScaleFactor(): number {
    return this.gridScaleFactor;
  }

  static getGridOffset(): { x: number; z: number } {
    return { x: this.gridOffsetX, z: this.gridOffsetZ };
  }

  static getGridOpacity(): number {
    return this.gridOpacity;
  }

  static getPaintDabs(): readonly MapFloorPaintDab[] {
    return this.paintDabs;
  }

  static getCompositeFloorCanvas(): HTMLCanvasElement | null {
    if (!this.compositeDynTex) return this.baseTiledCanvas ?? this.processedTileCanvas;
    return this.compositeDynTex.getContext().canvas as HTMLCanvasElement;
  }

  static snapWorldCoordinates(
    rawX: number,
    rawZ: number,
    snapEnabled: boolean,
    snapKind: 'wall' | 'cell-center' | 'free',
  ): { x: number; z: number } {
    const halfW = this.GROUND_W / 2;
    const halfH = this.GROUND_H / 2;
    const clampedX = Math.max(-halfW, Math.min(halfW, rawX));
    const clampedZ = Math.max(-halfH, Math.min(halfH, rawZ));

    if (!snapEnabled || this.activeGridMode === 'Off' || snapKind === 'free') {
      return {
        x: Math.round(clampedX * 100) / 100,
        z: Math.round(clampedZ * 100) / 100,
      };
    }

    const step = this.getCellStepMeters();
    const ox = this.gridOffsetX;
    const oz = this.gridOffsetZ;
    if (snapKind === 'wall') {
      const sx = Math.round((clampedX + halfW - ox) / step) * step - halfW + ox;
      const sz = Math.round((clampedZ + halfH - oz) / step) * step - halfH + oz;
      return {
        x: Math.round(Math.max(-halfW, Math.min(halfW, sx)) * 100) / 100,
        z: Math.round(Math.max(-halfH, Math.min(halfH, sz)) * 100) / 100,
      };
    }

    const cx = (Math.floor((clampedX + halfW - ox) / step) + 0.5) * step - halfW + ox;
    const cz = (Math.floor((clampedZ + halfH - oz) / step) + 0.5) * step - halfH + oz;
    return {
      x: Math.round(Math.max(-halfW + step * 0.5, Math.min(halfW - step * 0.5, cx)) * 100) / 100,
      z: Math.round(Math.max(-halfH + step * 0.5, Math.min(halfH - step * 0.5, cz)) * 100) / 100,
    };
  }

  static exportElevations(): readonly number[] | undefined {
    if (!this.customElevations) return undefined;
    let hasNonZero = false;
    const out: number[] = new Array(this.customElevations.length);
    for (let i = 0; i < this.customElevations.length; i++) {
      const v = Math.round(this.customElevations[i] * 1000) / 1000;
      out[i] = v;
      if (Math.abs(v) > 0.001) hasNonZero = true;
    }
    return hasNonZero ? out : undefined;
  }

  static importElevations(elevations?: readonly number[] | null): void {
    const stride = this.SUBDIV + 1;
    const expected = stride * stride;
    if (elevations && elevations.length === expected) {
      if (this.customElevations && this.customElevations.length === expected) {
        let changed = false;
        for (let i = 0; i < expected; i++) {
          if (Math.abs(this.customElevations[i] - elevations[i]) > 0.0005) {
            changed = true;
            break;
          }
        }
        if (!changed) return;
      }
      this.customElevations = new Float32Array(elevations);
      this.elevationVersion++;
    } else if (elevations && elevations.length > 4) {
      // Backwards-compatible bilinear resampling for older saved maps (e.g. 65x65 SUBDIV=64)
      const srcStride = Math.round(Math.sqrt(elevations.length));
      if (srcStride >= 2 && srcStride * srcStride === elevations.length) {
        const resampled = new Float32Array(expected);
        const srcSubdiv = srcStride - 1;
        for (let rz = 0; rz < stride; rz++) {
          const v = (rz / this.SUBDIV) * srcSubdiv;
          const z0 = Math.min(srcSubdiv - 1, Math.floor(v));
          const tz = v - z0;
          for (let rx = 0; rx < stride; rx++) {
            const u = (rx / this.SUBDIV) * srcSubdiv;
            const x0 = Math.min(srcSubdiv - 1, Math.floor(u));
            const tx = u - x0;
            const y00 = elevations[z0 * srcStride + x0] ?? 0;
            const y10 = elevations[z0 * srcStride + (x0 + 1)] ?? 0;
            const y01 = elevations[(z0 + 1) * srcStride + x0] ?? 0;
            const y11 = elevations[(z0 + 1) * srcStride + (x0 + 1)] ?? 0;
            const top = y00 * (1 - tx) + y10 * tx;
            const bot = y01 * (1 - tx) + y11 * tx;
            resampled[rz * stride + rx] = top * (1 - tz) + bot * tz;
          }
        }
        this.customElevations = resampled;
        this.elevationVersion++;
      }
    } else if (elevations === null || (elevations && elevations.length === 0)) {
      if (!this.customElevations) return;
      let hasNonZero = false;
      for (let i = 0; i < this.customElevations.length; i++) {
        if (Math.abs(this.customElevations[i]) > 0.0005) {
          hasNonZero = true;
          break;
        }
      }
      if (!hasNonZero) return;
      this.customElevations = null;
      this.elevationVersion++;
    }
  }

  static setPaintDabs(scene: Scene | null, dabs?: readonly MapFloorPaintDab[] | null): void {
    const incoming = dabs ? [...dabs] : [];
    if (incoming.length === this.paintDabs.length && incoming.length === 0) return;
    this.paintDabs = incoming;
    if (scene) {
      this.appliedFloorSigByScene.delete(scene);
      const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
      if (ground) {
        this.applyMaterialAndBump(scene, ground, '');
      }
    }
  }

  static resetElevations(): void {
    this.customElevations = null;
    this.elevationVersion++;
  }

  static clearFloorPaint(scene: Scene | null): void {
    this.paintDabs = [];
    if (scene) {
      this.appliedFloorSigByScene.delete(scene);
      const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
      if (ground) {
        this.applyMaterialAndBump(scene, ground, '');
      }
    }
  }

  static setGridMode(scene: Scene, mode: string): void {
    const normalized: LwFloorGridMode =
      mode === '10 ft' || mode === 'Hex' || mode === 'Off' ? mode : '5 ft';
    this.activeGridMode = normalized;
    this.rebuildGridOverlay(scene);
  }

  static configureGrid(scene: Scene, config: FloorGridConfig): void {
    if (config.mode !== undefined) {
      this.activeGridMode =
        config.mode === '10 ft' || config.mode === 'Hex' || config.mode === 'Off'
          ? config.mode
          : '5 ft';
    }
    if (config.scaleFactor !== undefined && Number.isFinite(config.scaleFactor)) {
      this.gridScaleFactor = Math.max(0.25, Math.min(3.0, config.scaleFactor));
    }
    if (config.offsetX !== undefined && Number.isFinite(config.offsetX)) {
      this.gridOffsetX = Math.max(-6.0, Math.min(6.0, config.offsetX));
    }
    if (config.offsetZ !== undefined && Number.isFinite(config.offsetZ)) {
      this.gridOffsetZ = Math.max(-6.0, Math.min(6.0, config.offsetZ));
    }
    if (config.opacity !== undefined && Number.isFinite(config.opacity)) {
      this.gridOpacity = Math.max(0.15, Math.min(1.0, config.opacity));
    }
    this.rebuildGridOverlay(scene);
  }

  static buildTerrainAndGrid(
    scene: Scene,
    biome: string,
    reliefScale: number,
  ): Mesh {
    let ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
    if (!ground) {
      this.compositeDynTex = null;
      this.tileDynTex = null;
      this.appliedFloorSigByScene.delete(scene);
      this.appliedReliefSigByScene.delete(scene);
      ground = MeshBuilder.CreateGround(
        'lw-terrain-ground',
        {
          width: this.GROUND_W,
          height: this.GROUND_H,
          subdivisions: this.SUBDIV,
          updatable: true,
        },
        scene,
      );
      ground.isPickable = true;
      ground.receiveShadows = true;

      const existingHorizon = scene.getMeshByName('lw-terrain-horizon');
      if (existingHorizon && !existingHorizon.isDisposed()) {
        existingHorizon.dispose();
      }

      const positions = ground.getVerticesData('position');
      if (positions) {
        if (!this.customElevations || this.customElevations.length !== positions.length / 3) {
          this.customElevations = new Float32Array(positions.length / 3);
        }
        this.applyVertexReliefAndHeightMap(scene, ground, reliefScale);
      }

      this.applyMaterialAndBump(scene, ground, biome);
      this.rebuildGridOverlay(scene);
    }

    return ground;
  }

  static syncReliefAndGridIfChanged(
    scene: Scene,
    ground: Mesh,
    baseReliefScale = 24,
    waterSplineCount = 0,
    skipGridOverlay = false,
  ): void {
    const waterSig = JSON.stringify(WaterChannelTerrain.getBodies(scene));
    const sig = `${this.elevationVersion}|${waterSplineCount}|${waterSig}|${this.activeGridMode}|${this.gridScaleFactor}|${this.gridOffsetX}|${this.gridOffsetZ}|${this.gridOpacity}|${skipGridOverlay ? 'drag' : 'full'}`;
    if (this.appliedReliefSigByScene.get(scene) === sig) {
      return;
    }
    this.appliedReliefSigByScene.set(scene, sig);
    this.applyVertexReliefAndHeightMap(scene, ground, baseReliefScale);
    if (!skipGridOverlay) {
      this.rebuildGridOverlay(scene);
    }
  }

  /**
   * Applies user-sculpted `customElevations` and water channels onto the ground mesh vertices.
   * Never warps the floor plane with material height settings.
   */
  static applyVertexReliefAndHeightMap(
    scene: Scene,
    ground: Mesh,
    _baseReliefScale = 0,
  ): void {
    const positions = ground.getVerticesData('position');
    if (!positions) return;
    if (!this.customElevations || this.customElevations.length !== positions.length / 3) {
      this.customElevations = new Float32Array(positions.length / 3);
    }

    for (let i = 0; i < positions.length; i += 3) {
      const vIdx = i / 3;
      positions[i + 1] = this.customElevations[vIdx] ?? 0;
    }

    WaterChannelTerrain.apply(scene, positions, this.GROUND_W, this.GROUND_H);
    ground.updateVerticesData('position', positions);
    this.cachedPositionsByScene.set(scene, new Float32Array(positions));
    this.recomputeNormals(ground, positions);
    ground.refreshBoundingInfo();
  }

  private static recomputeNormals(ground: Mesh, positions: Float32Array | number[]): void {
    const indices = ground.getIndices();
    const normals = ground.getVerticesData('normal');
    if (indices && normals) {
      VertexData.ComputeNormals(positions, indices, normals);
      ground.updateVerticesData('normal', normals);
    }
  }

  private static cachedPositionsByScene = new WeakMap<Scene, Float32Array>();

  static sampleElevationAt(scene: Scene, worldX: number, worldZ: number): number {
    let positions: Float32Array | number[] | null | undefined = this.cachedPositionsByScene.get(scene);
    if (!positions) {
      const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
      if (!ground) return 0;
      positions = ground.getVerticesData('position');
      if (!positions) return 0;
      this.cachedPositionsByScene.set(scene, new Float32Array(positions));
    }

    const cols = this.SUBDIV + 1;
    const u = Math.max(0, Math.min(1, (worldX + this.GROUND_W / 2) / this.GROUND_W));
    const v = Math.max(0, Math.min(1, (this.GROUND_H / 2 - worldZ) / this.GROUND_H));

    const gx = u * this.SUBDIV;
    const gz = v * this.SUBDIV;
    const x0 = Math.min(this.SUBDIV - 1, Math.floor(gx));
    const z0 = Math.min(this.SUBDIV - 1, Math.floor(gz));
    const tx = gx - x0;
    const tz = gz - z0;

    const y00 = positions[(z0 * cols + x0) * 3 + 1] ?? 0;
    const y10 = positions[(z0 * cols + (x0 + 1)) * 3 + 1] ?? 0;
    const y01 = positions[((z0 + 1) * cols + x0) * 3 + 1] ?? 0;
    const y11 = positions[((z0 + 1) * cols + (x0 + 1)) * 3 + 1] ?? 0;

    const yTop = y00 * (1 - tx) + y10 * tx;
    const yBot = y01 * (1 - tx) + y11 * tx;
    return yTop * (1 - tz) + yBot * tz;
  }

  static rebuildGridOverlay(scene: Scene): void {
    const existingGrid = scene.getMeshByName('lw-terrain-grid');
    if (existingGrid) {
      existingGrid.dispose();
    }

    if (this.activeGridMode === 'Off') {
      return;
    }

    const lines: Vector3[][] = [];
    const halfW = this.GROUND_W / 2;
    const halfH = this.GROUND_H / 2;
    const liftY = 0.045;

    const slopeAdjustedPoint = (x: number, z: number): Vector3 => {
      const cx = Math.max(-halfW, Math.min(halfW, x));
      const cz = Math.max(-halfH, Math.min(halfH, z));
      const y = this.sampleElevationAt(scene, cx, cz) + liftY;
      return new Vector3(cx, y, cz);
    };

    if (this.activeGridMode === 'Hex') {
      const hexR = 1.05 * this.gridScaleFactor;
      const dx = hexR * 1.5;
      const dz = hexR * Math.sqrt(3);
      let col = 0;
      for (
        let cx = -halfW + hexR + (this.gridOffsetX % dx);
        cx <= halfW - hexR;
        cx += dx, col++
      ) {
        const zOffset = col % 2 === 0 ? 0 : dz / 2;
        for (
          let cz = -halfH + hexR + zOffset + (this.gridOffsetZ % dz);
          cz <= halfH - hexR;
          cz += dz
        ) {
          const ring: Vector3[] = [];
          for (let k = 0; k <= 6; k++) {
            const angle = (k * Math.PI) / 3;
            const vx = cx + Math.cos(angle) * hexR;
            const vz = cz + Math.sin(angle) * hexR;
            ring.push(slopeAdjustedPoint(vx, vz));
          }
          lines.push(ring);
        }
      }
    } else {
      const cellStep = this.getCellStepMeters();
      const sampleStep = 0.5;
      const startX = -halfW + (((this.gridOffsetX % cellStep) + cellStep) % cellStep);
      const startZ = -halfH + (((this.gridOffsetZ % cellStep) + cellStep) % cellStep);

      for (let x = startX; x <= halfW + 0.01; x += cellStep) {
        const polyline: Vector3[] = [];
        for (let z = -halfH; z <= halfH + 0.01; z += sampleStep) {
          polyline.push(slopeAdjustedPoint(x, z));
        }
        lines.push(polyline);
      }

      for (let z = startZ; z <= halfH + 0.01; z += cellStep) {
        const polyline: Vector3[] = [];
        for (let x = -halfW; x <= halfW + 0.01; x += sampleStep) {
          polyline.push(slopeAdjustedPoint(x, z));
        }
        lines.push(polyline);
      }
    }

    const grid = MeshBuilder.CreateLineSystem('lw-terrain-grid', { lines }, scene);
    grid.color = Color3.FromHexString('#3b7359');
    grid.alpha = this.gridOpacity;
    grid.isPickable = false;
  }

  static applyFloorBumpTexture(
    scene: Scene,
    albedoUrl: string,
    normalUrl: string,
    tilingScale = 10,
    heightUrl?: string,
  ): void {
    const derivedHeight = resolveDerivedHeightUrl(albedoUrl, normalUrl, heightUrl);
    const tier = GlbModelCache.getLodTier();
    const sig = `${tier}|${albedoUrl}|${normalUrl}|${derivedHeight}|${tilingScale}`;
    if (this.appliedFloorSigByScene.get(scene) === sig) {
      return;
    }
    this.appliedFloorSigByScene.set(scene, sig);
    this.activeAlbedoUrl = albedoUrl;
    this.activeNormalUrl = normalUrl;
    this.activeHeightUrl = derivedHeight;
    this.floorTilingScale = tilingScale;

    const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
    if (ground) {
      this.applyMaterialAndBump(scene, ground, '');
    }
  }

  static configureFloorProperties(
    scene: Scene,
    config: FloorBumpAndColorConfig,
  ): void {
    let needsMaterialRebuild = false;

    if (config.albedoUrl !== undefined && config.albedoUrl !== this.activeAlbedoUrl) {
      this.activeAlbedoUrl = config.albedoUrl;
      needsMaterialRebuild = true;
    }
    if (config.normalUrl !== undefined && config.normalUrl !== this.activeNormalUrl) {
      this.activeNormalUrl = config.normalUrl;
      needsMaterialRebuild = true;
    }
    if (config.heightUrl !== undefined) {
      const resolved = resolveDerivedHeightUrl(
        this.activeAlbedoUrl,
        this.activeNormalUrl,
        config.heightUrl,
      );
      if (resolved !== this.activeHeightUrl) {
        this.activeHeightUrl = resolved;
        needsMaterialRebuild = true;
      }
    }
    if (config.tilingScale !== undefined && config.tilingScale !== this.floorTilingScale) {
      this.floorTilingScale = config.tilingScale;
      needsMaterialRebuild = true;
    }
    if (config.bumpIntensity !== undefined && config.bumpIntensity !== this.floorBumpIntensity) {
      this.floorBumpIntensity = config.bumpIntensity;
      needsMaterialRebuild = true;
    }
    if (config.heightScale !== undefined && config.heightScale !== this.floorHeightScale) {
      this.floorHeightScale = config.heightScale;
      needsMaterialRebuild = true;
    }
    if (config.surfaceFinish !== undefined && config.surfaceFinish !== this.floorSurfaceFinish) {
      this.floorSurfaceFinish = config.surfaceFinish;
      if (config.roughness === undefined && config.specularIntensity === undefined) {
        if (config.surfaceFinish === 'matte') {
          this.floorRoughness = 86;
          this.floorSpecularIntensity = 14;
        } else if (config.surfaceFinish === 'semi-glossy') {
          this.floorRoughness = 46;
          this.floorSpecularIntensity = 58;
        } else if (config.surfaceFinish === 'shiny') {
          this.floorRoughness = 14;
          this.floorSpecularIntensity = 115;
        }
      }
      needsMaterialRebuild = true;
    }
    if (config.roughness !== undefined && config.roughness !== this.floorRoughness) {
      this.floorRoughness = config.roughness;
      needsMaterialRebuild = true;
    }
    if (
      config.specularIntensity !== undefined &&
      config.specularIntensity !== this.floorSpecularIntensity
    ) {
      this.floorSpecularIntensity = config.specularIntensity;
      needsMaterialRebuild = true;
    }
    if (
      config.ambientOcclusion !== undefined &&
      config.ambientOcclusion !== this.floorAmbientOcclusion
    ) {
      this.floorAmbientOcclusion = config.ambientOcclusion;
      needsMaterialRebuild = true;
    }
    if (
      (config.colorHex !== undefined && config.colorHex !== this.floorColorHex) ||
      (config.colorStrength !== undefined && config.colorStrength !== this.floorColorStrength) ||
      (config.colorBlendMode !== undefined && config.colorBlendMode !== this.floorColorBlendMode)
    ) {
      if (config.colorHex !== undefined) this.floorColorHex = config.colorHex;
      if (config.colorStrength !== undefined) this.floorColorStrength = config.colorStrength;
      if (config.colorBlendMode !== undefined) this.floorColorBlendMode = config.colorBlendMode;
      needsMaterialRebuild = true;
    }

    const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
    if (!ground) return;

    if (needsMaterialRebuild) {
      this.appliedFloorSigByScene.delete(scene);
      this.applyMaterialAndBump(scene, ground, '');
    }
  }

  /**
   * Paints a feathered Photoshop-blended color dab onto the floor at `(worldX, worldZ)`
   * and updates the 3D ground texture in real time.
   */
  static paintFloorStrokeAt(scene: Scene | null, dab: MapFloorPaintDab): void {
    this.paintDabs.push(dab);
    if (!scene) return;
    const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
    if (!ground) return;

    if (!this.compositeDynTex || !this.baseTiledCanvas) {
      this.applyMaterialAndBump(scene, ground, '');
      return;
    }

    const compCtx = this.compositeDynTex.getContext() as unknown as CanvasRenderingContext2D;
    this.renderSingleDabToContext(compCtx, dab);
    this.compositeDynTex.update();
  }

  private static renderSingleDabToContext(
    ctx: CanvasRenderingContext2D,
    dab: MapFloorPaintDab,
  ): void {
    const size = this.COMP_SIZE;
    const halfW = this.GROUND_W / 2;
    const halfH = this.GROUND_H / 2;

    const cx = ((dab.x + halfW) / this.GROUND_W) * size;
    const cy = ((halfH - dab.z) / this.GROUND_H) * size;
    const rPx = Math.max(4, (dab.radius / this.GROUND_W) * size);
    const sharpFrac = Math.max(0, Math.min(0.96, dab.sharpness / 100));
    const innerR = rPx * sharpFrac;
    const alpha = Math.max(0.02, Math.min(1, dab.opacity / 100));

    if (dab.blendMode === 'eraser') {
      if (!this.baseTiledCanvas) return;
      if (!this.eraserScratchCanvas && typeof document !== 'undefined') {
        this.eraserScratchCanvas = document.createElement('canvas');
      }
      const scratch = this.eraserScratchCanvas;
      if (!scratch) return;
      const box = Math.ceil(rPx * 2 + 4);
      scratch.width = box;
      scratch.height = box;
      const sctx = scratch.getContext('2d');
      if (!sctx) return;

      const sx = Math.floor(cx - box / 2);
      const sy = Math.floor(cy - box / 2);
      sctx.clearRect(0, 0, box, box);
      sctx.drawImage(this.baseTiledCanvas, sx, sy, box, box, 0, 0, box, box);

      sctx.globalCompositeOperation = 'destination-in';
      const maskGrad = sctx.createRadialGradient(
        box / 2,
        box / 2,
        innerR,
        box / 2,
        box / 2,
        rPx,
      );
      maskGrad.addColorStop(0, `rgba(0,0,0,${alpha})`);
      maskGrad.addColorStop(0.5, `rgba(0,0,0,${alpha * 0.5})`);
      maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = maskGrad;
      sctx.beginPath();
      sctx.arc(box / 2, box / 2, rPx, 0, Math.PI * 2);
      sctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(scratch, sx, sy);
      ctx.restore();
      return;
    }

    const rgb = this.hexToRgb(dab.colorHex);
    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, rPx);
    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
    const stops = [0.25, 0.5, 0.75, 1.0];
    for (const s of stops) {
      const falloff = 0.5 * (1 + Math.cos(Math.PI * s));
      grad.addColorStop(
        s,
        `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(alpha * falloff).toFixed(4)})`,
      );
    }

    ctx.save();
    ctx.globalCompositeOperation = dab.blendMode as GlobalCompositeOperation;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private static hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = (hex || '#ffffff').replace('#', '');
    if (clean.length !== 6) return { r: 73, g: 232, b: 146 };
    return {
      r: parseInt(clean.substring(0, 2), 16) || 0,
      g: parseInt(clean.substring(2, 4), 16) || 0,
      b: parseInt(clean.substring(4, 6), 16) || 0,
    };
  }

  private static loadOrGetAlbedoImage(
    url: string,
    onReady: (img: HTMLImageElement) => void,
  ): HTMLImageElement | null {
    if (!url || typeof Image === 'undefined') return null;
    const cached = this.imageCache.get(url);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      return cached;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.imageCache.set(url, img);
      onReady(img);
    };
    img.src = url;
    return null;
  }

  /**
   * Builds a 512x512 seamless floor tile canvas with height-map high/low contrast
   * exaggeration, cavity ambient occlusion, and optional global color tint.
   */
  private static buildProcessedTileCanvas(
    albedoImg: HTMLImageElement,
    heightImg: HTMLImageElement | null,
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const size = this.TILE_SIZE;
    if (!this.processedTileCanvas) {
      this.processedTileCanvas = document.createElement('canvas');
      this.processedTileCanvas.width = size;
      this.processedTileCanvas.height = size;
    }
    const ctx = this.processedTileCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(albedoImg, 0, 0, size, size);

    // Apply global whole-floor tint if enabled
    if (this.floorColorStrength > 0 && this.floorColorHex) {
      ctx.save();
      const mode =
        this.floorColorBlendMode === 'eraser' ? 'multiply' : this.floorColorBlendMode;
      ctx.globalCompositeOperation = mode as GlobalCompositeOperation;
      ctx.globalAlpha = Math.max(0, Math.min(1, this.floorColorStrength / 100));
      ctx.fillStyle = this.floorColorHex;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
    }

    // Exaggerate high and low points of the height map (and cavity AO) directly on the tile
    const heightStrength = Math.max(0, Math.min(2.5, this.floorHeightScale / 100));
    const aoStrength = Math.max(0, Math.min(1.5, this.floorAmbientOcclusion / 100));
    if (heightStrength > 0.01 || aoStrength > 0.01) {
      const imgData = ctx.getImageData(0, 0, size, size);
      const px = imgData.data;

      let hData: Uint8ClampedArray | null = null;
      if (heightImg) {
        const hCanvas = document.createElement('canvas');
        hCanvas.width = size;
        hCanvas.height = size;
        const hCtx = hCanvas.getContext('2d', { willReadFrequently: true });
        if (hCtx) {
          hCtx.drawImage(heightImg, 0, 0, size, size);
          hData = hCtx.getImageData(0, 0, size, size).data;
        }
      }

      // Compute mean height so high/low exaggeration is balanced around the texture's midpoint
      let sumH = 0;
      const totalPx = size * size;
      for (let i = 0; i < px.length; i += 4) {
        const lum = hData
          ? hData[i] / 255
          : (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
        sumH += lum;
      }
      const meanH = sumH / Math.max(1, totalPx);

      for (let i = 0; i < px.length; i += 4) {
        const rawH = hData
          ? hData[i] / 255
          : (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
        const delta = rawH - meanH; // > 0 = high ridge/stone, < 0 = low crevice/mortar

        let gain = 1.0;
        if (delta >= 0) {
          // Exaggerate high points
          gain = 1.0 + delta * heightStrength * 0.85;
        } else {
          // Exaggerate low points & cavity AO shadow depth
          gain = Math.max(
            0.18,
            1.0 + delta * (heightStrength * 0.95 + aoStrength * 0.55),
          );
        }

        px[i] = Math.max(0, Math.min(255, Math.round(px[i] * gain)));
        px[i + 1] = Math.max(0, Math.min(255, Math.round(px[i + 1] * gain)));
        px[i + 2] = Math.max(0, Math.min(255, Math.round(px[i + 2] * gain)));
      }
      ctx.putImageData(imgData, 0, 0);
    }

    return this.processedTileCanvas;
  }

  private static rebuildCompositeCanvasFromTile(
    scene: Scene,
    mat: StandardMaterial,
    tileCanvas: HTMLCanvasElement,
    uScale: number,
    vScale: number,
  ): void {
    if (typeof document === 'undefined') return;

    // Fast path when no freehand brush paint dabs are present: use hardware-wrapped 512x512 tile texture!
    if (this.paintDabs.length === 0) {
      const tSize = this.TILE_SIZE;
      if (!this.tileDynTex || this.tileDynTex.getScene() !== scene) {
        if (this.tileDynTex) {
          this.tileDynTex.dispose();
        }
        this.tileDynTex = new DynamicTexture(
          'lw-floor-tile-dyn',
          { width: tSize, height: tSize },
          scene,
          true,
        );
      }
      this.tileDynTex.wrapU = Texture.WRAP_ADDRESSMODE;
      this.tileDynTex.wrapV = Texture.WRAP_ADDRESSMODE;
      this.tileDynTex.wrapR = Texture.WRAP_ADDRESSMODE;
      const internalTileTex = this.tileDynTex.getInternalTexture();
      if (internalTileTex) {
        internalTileTex.wrapU = Texture.WRAP_ADDRESSMODE;
        internalTileTex.wrapV = Texture.WRAP_ADDRESSMODE;
        internalTileTex._cachedWrapU = null;
        internalTileTex._cachedWrapV = null;
      }
      this.tileDynTex.uScale = uScale;
      this.tileDynTex.vScale = vScale;
      const tCtx = this.tileDynTex.getContext() as unknown as CanvasRenderingContext2D;
      tCtx.clearRect(0, 0, tSize, tSize);
      tCtx.drawImage(tileCanvas, 0, 0, tSize, tSize);
      this.tileDynTex.update();
      mat.diffuseTexture = this.tileDynTex;
      return;
    }

    const size = this.COMP_SIZE;
    if (!this.baseTiledCanvas) {
      this.baseTiledCanvas = document.createElement('canvas');
      this.baseTiledCanvas.width = size;
      this.baseTiledCanvas.height = size;
    }
    const bctx = this.baseTiledCanvas.getContext('2d');
    if (!bctx) return;

    const cols = Math.max(2, uScale);
    const rows = Math.max(2, vScale);
    const tileW = size / cols;
    const tileH = size / rows;

    bctx.clearRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        bctx.drawImage(
          tileCanvas,
          Math.floor(c * tileW),
          Math.floor(r * tileH),
          Math.ceil(tileW),
          Math.ceil(tileH),
        );
      }
    }

    if (!this.compositeDynTex || this.compositeDynTex.getScene() !== scene) {
      if (this.compositeDynTex) {
        this.compositeDynTex.dispose();
      }
      this.compositeDynTex = new DynamicTexture(
        'lw-floor-composite-dyn',
        { width: size, height: size },
        scene,
        true,
      );
    }
    this.compositeDynTex.wrapU = Texture.WRAP_ADDRESSMODE;
    this.compositeDynTex.wrapV = Texture.WRAP_ADDRESSMODE;
    this.compositeDynTex.uScale = 1;
    this.compositeDynTex.vScale = 1;

    const compCtx = this.compositeDynTex.getContext() as unknown as CanvasRenderingContext2D;
    compCtx.clearRect(0, 0, size, size);
    compCtx.globalCompositeOperation = 'source-over';
    compCtx.drawImage(this.baseTiledCanvas, 0, 0);

    for (const dab of this.paintDabs) {
      this.renderSingleDabToContext(compCtx, dab);
    }

    this.compositeDynTex.update();
    mat.diffuseTexture = this.compositeDynTex;
  }

  private static applyMaterialAndBump(scene: Scene, ground: Mesh, biome: string): void {
    let mat = scene.getMaterialByName('lw-terrain-mat') as StandardMaterial | null;
    if (!mat) {
      mat = new StandardMaterial('lw-terrain-mat', scene);
    }
    mat.maxSimultaneousLights = 12;

    // Standard 3D Surface Finish (Matte, Semi-Glossy, Shiny) + Roughness & Specular controls
    const roughnessFrac = Math.max(0.04, Math.min(1.0, this.floorRoughness / 100));
    const specStrength = Math.max(0, Math.min(1.8, this.floorSpecularIntensity / 100));
    mat.diffuseColor = Color3.FromHexString('#dcdcdc');
    mat.roughness = roughnessFrac;
    mat.specularPower = Math.round(8 + Math.pow(1 - roughnessFrac, 2) * 180);
    mat.specularColor = new Color3(
      0.6 * specStrength,
      0.6 * specStrength,
      0.6 * specStrength,
    );

    const uScale = this.floorTilingScale;
    const vScale = Math.max(2, Math.round(this.floorTilingScale * (this.GROUND_H / this.GROUND_W)));
    const tier = GlbModelCache.getLodTier();
    const resolvedAlbedoUrl = this.activeAlbedoUrl
      ? resolveTextureLodUrl(this.activeAlbedoUrl, tier)
      : '';
    const resolvedNormalUrl = this.activeNormalUrl
      ? resolveTextureLodUrl(this.activeNormalUrl, tier)
      : '';
    const rawHeightUrl = resolveDerivedHeightUrl(
      this.activeAlbedoUrl,
      this.activeNormalUrl,
      this.activeHeightUrl,
    );
    const resolvedHeightUrl = rawHeightUrl ? resolveTextureLodUrl(rawHeightUrl, tier) : '';

    try {
      if (resolvedAlbedoUrl) {
        const expectedAlbedo = this.activeAlbedoUrl;
        const diffTex = this.getOrCreateFloorTex(scene, resolvedAlbedoUrl);
        diffTex.uScale = uScale;
        diffTex.vScale = vScale;
        if (!mat.diffuseTexture || this.paintDabs.length === 0) {
          mat.diffuseTexture = diffTex;
        }

        // Load albedo + height image and build the high/low relief & tinted tile texture
        const heightPromise = resolvedHeightUrl
          ? loadFloorImage(resolvedHeightUrl).catch(() => null)
          : Promise.resolve(null);
        void Promise.all([loadFloorImage(resolvedAlbedoUrl), heightPromise])
          .then(([albedoImg, heightImg]) => {
            if (scene.isDisposed || this.activeAlbedoUrl !== expectedAlbedo) return;
            const currentMat = scene.getMaterialByName(
              'lw-terrain-mat',
            ) as StandardMaterial | null;
            if (!currentMat) return;
            const tileCanvas = this.buildProcessedTileCanvas(albedoImg, heightImg);
            if (tileCanvas) {
              this.rebuildCompositeCanvasFromTile(scene, currentMat, tileCanvas, uScale, vScale);
              currentMat.markAsDirty(Material.TextureDirtyFlag | Material.MiscDirtyFlag);
            }
          })
          .catch(() => {
            // Keep base diffuseTexture on load fallback
          });
      }
      if (resolvedNormalUrl) {
        const bumpTex = this.getOrCreateFloorTex(scene, resolvedNormalUrl);
        bumpTex.uScale = uScale;
        bumpTex.vScale = vScale;
        bumpTex.level = (this.floorBumpIntensity / 100) * 1.65;
        mat.bumpTexture = bumpTex;
      }
    } catch {
      if (biome.toLowerCase().includes('forest')) {
        mat.diffuseColor = Color3.FromHexString('#2a2826');
      }
    }

    configureFloorRelief(
      scene,
      mat,
      resolvedNormalUrl,
      resolvedHeightUrl,
      this.floorHeightScale,
      uScale,
      vScale,
      this.floorBumpIntensity,
    );
    WallSurfacePaint.registerMaterial(scene, mat);
    ground.material = mat;
    ground.receiveShadows = true;
  }

  static sculptElevationAt(
    scene: Scene,
    worldX: number,
    worldZ: number,
    radius: number,
    deltaY: number,
    mode: 'raise' | 'lower' | 'flatten' | 'smooth',
    featheringPct = 80,
    plateauLimit = 6.0,
  ): void {
    const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
    if (!ground) return;
    const positions = ground.getVerticesData('position');
    if (!positions) return;

    if (!this.customElevations || this.customElevations.length !== positions.length / 3) {
      this.customElevations = new Float32Array(positions.length / 3);
    }

    const r = Math.max(1.2, radius);
    const signedDelta = mode === 'lower' ? -Math.abs(deltaY) : Math.abs(deltaY);
    const featherFrac = Math.max(0.05, Math.min(1.0, featheringPct / 100));
    const innerCoreR = r * (1.0 - featherFrac * 0.92);
    const maxCap = Math.max(0.5, Math.min(8.5, plateauLimit));

    let smoothTargetY = 0;
    if (mode === 'smooth') {
      let sumY = 0;
      let count = 0;
      for (let i = 0; i < positions.length; i += 3) {
        const dist = Math.hypot(positions[i] - worldX, positions[i + 2] - worldZ);
        if (dist <= r) {
          sumY += positions[i + 1];
          count++;
        }
      }
      smoothTargetY = count > 0 ? sumY / count : 0;
    }

    for (let i = 0; i < positions.length; i += 3) {
      const vx = positions[i];
      const vz = positions[i + 2];
      const dist = Math.hypot(vx - worldX, vz - worldZ);
      if (dist <= r) {
        let falloff = 1.0;
        if (dist > innerCoreR) {
          const t = Math.min(1, (dist - innerCoreR) / Math.max(0.05, r - innerCoreR));
          falloff = 0.5 * (1 + Math.cos(Math.PI * t));
        }
        const vIdx = i / 3;
        if (mode === 'flatten') {
          positions[i + 1] = positions[i + 1] * (1 - falloff * 0.55);
          this.customElevations[vIdx] = positions[i + 1];
        } else if (mode === 'smooth') {
          const blend = falloff * 0.38;
          const nextY = positions[i + 1] * (1 - blend) + smoothTargetY * blend;
          this.customElevations[vIdx] += nextY - positions[i + 1];
          positions[i + 1] = nextY;
        } else {
          const step = signedDelta * falloff * 0.28;
          const nextY = Math.max(-maxCap, Math.min(maxCap, positions[i + 1] + step));
          this.customElevations[vIdx] += nextY - positions[i + 1];
          positions[i + 1] = nextY;
        }
      }
    }

    this.elevationVersion++;
    if (WaterChannelTerrain.getBodies(scene).length > 0) {
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] = this.customElevations[i / 3] ?? 0;
      }
      WaterChannelTerrain.apply(scene, positions, this.GROUND_W, this.GROUND_H);
    }
    ground.updateVerticesData('position', positions);
    this.cachedPositionsByScene.set(scene, new Float32Array(positions));
    this.recomputeNormals(ground, positions);
    ground.refreshBoundingInfo();
  }
}
