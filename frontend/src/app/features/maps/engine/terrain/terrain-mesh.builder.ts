import { WaterChannelTerrain } from '../water/water-channel-terrain';
import {
  Color3,
  DynamicTexture,
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

export interface FloorBumpAndColorConfig {
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly heightUrl?: string;
  readonly tilingScale?: number;
  readonly bumpIntensity?: number;
  readonly heightScale?: number;
  readonly colorHex?: string;
  readonly colorStrength?: number;
  readonly colorBlendMode?: MapFloorBlendMode;
}

export class TerrainMeshBuilder {
  static readonly GROUND_W = 36;
  static readonly GROUND_H = 27;
  private static readonly SUBDIV = 64;
  private static readonly COMP_SIZE = 1024;

  private static customElevations: Float32Array | null = null;
  private static activeAlbedoUrl =
    '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone.png';
  private static activeNormalUrl =
    '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone_normal.png';
  private static activeHeightUrl = '';
  private static floorTilingScale = 10;
  private static floorBumpIntensity = 135; // 0% to 300%
  private static floorHeightScale = 100; // -100% to +200%
  private static floorColorHex = '#ffffff';
  private static floorColorStrength = 0; // 0% to 100%
  private static floorColorBlendMode: MapFloorBlendMode = 'multiply';
  private static activeGridMode: LwFloorGridMode = '5 ft';

  private static paintDabs: MapFloorPaintDab[] = [];
  private static baseTiledCanvas: HTMLCanvasElement | null = null;
  private static compositeDynTex: DynamicTexture | null = null;
  private static eraserScratchCanvas: HTMLCanvasElement | null = null;
  private static imageCache = new Map<string, HTMLImageElement>();
  private static heightPixelsCache = new Map<string, { data: Uint8ClampedArray; w: number; h: number }>();

  static getCellStepMeters(): number {
    return this.activeGridMode === '10 ft' ? 3.0 : 1.5;
  }

  static getPaintDabs(): readonly MapFloorPaintDab[] {
    return this.paintDabs;
  }

  static getCompositeFloorCanvas(): HTMLCanvasElement | null {
    if (!this.compositeDynTex) return this.baseTiledCanvas;
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
    if (snapKind === 'wall') {
      const sx = Math.round((clampedX + halfW) / step) * step - halfW;
      const sz = Math.round((clampedZ + halfH) / step) * step - halfH;
      return {
        x: Math.round(sx * 100) / 100,
        z: Math.round(sz * 100) / 100,
      };
    }

    const cx = (Math.floor((clampedX + halfW) / step) + 0.5) * step - halfW;
    const cz = (Math.floor((clampedZ + halfH) / step) + 0.5) * step - halfH;
    return {
      x: Math.round(Math.max(-halfW + step * 0.5, Math.min(halfW - step * 0.5, cx)) * 100) / 100,
      z: Math.round(Math.max(-halfH + step * 0.5, Math.min(halfH - step * 0.5, cz)) * 100) / 100,
    };
  }

  static resetElevations(): void {
    this.customElevations = null;
  }

  static clearFloorPaint(scene: Scene | null): void {
    this.paintDabs = [];
    if (scene) {
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

  static buildTerrainAndGrid(
    scene: Scene,
    biome: string,
    reliefScale: number,
  ): Mesh {
    let ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
    if (!ground) {
      this.compositeDynTex = null;
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

  /**
   * Applies both procedural/heightmap floor relief (`floorHeightScale`) and
   * user-sculpted `customElevations` onto the ground mesh vertices.
   */
  static applyVertexReliefAndHeightMap(
    scene: Scene,
    ground: Mesh,
    baseReliefScale = 24,
  ): void {
    const positions = ground.getVerticesData('position');
    if (!positions) return;
    if (!this.customElevations || this.customElevations.length !== positions.length / 3) {
      this.customElevations = new Float32Array(positions.length / 3);
    }

    const heightFactor = (this.floorHeightScale - 100) / 100; // 0 at default 100%, -1 at 0%, +1 at 200%
    const baseAmp =
      baseReliefScale <= 0 ? 0 : (Math.min(100, baseReliefScale) / 100) * 0.35;
    const heightPixels = this.activeHeightUrl
      ? this.heightPixelsCache.get(this.activeHeightUrl)
      : undefined;
    const uScale = this.floorTilingScale;
    const vScale = Math.round(this.floorTilingScale * 0.8);

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const vIdx = i / 3;
      const distFromCenter = Math.sqrt(x * x + z * z);
      const edgeFactor = Math.min(1, Math.max(0, (distFromCenter - 7) / 12));
      const baseWave =
        baseAmp === 0 ? 0 : Math.sin(x * 0.35) * Math.cos(z * 0.35) * baseAmp * edgeFactor;

      // Micro-height relief from heightmap texture or stone cellular pattern
      let microHeight = 0;
      if (Math.abs(heightFactor) > 0.01) {
        if (heightPixels) {
          const u = (((x + this.GROUND_W / 2) / this.GROUND_W) * uScale) % 1;
          const v = (((this.GROUND_H / 2 - z) / this.GROUND_H) * vScale) % 1;
          const px = Math.min(
            heightPixels.w - 1,
            Math.max(0, Math.floor((u < 0 ? u + 1 : u) * heightPixels.w)),
          );
          const py = Math.min(
            heightPixels.h - 1,
            Math.max(0, Math.floor((v < 0 ? v + 1 : v) * heightPixels.h)),
          );
          const lum = heightPixels.data[(py * heightPixels.w + px) * 4] / 255;
          microHeight = (lum - 0.5) * 0.65 * heightFactor;
        } else {
          const freqX = x * (uScale * 0.35);
          const freqZ = z * (vScale * 0.35);
          microHeight =
            (Math.sin(freqX) * Math.cos(freqZ) * 0.5 +
              Math.cos(freqX * 0.5 - freqZ * 0.5) * 0.5) *
            0.38 *
            heightFactor;
        }
      }

      positions[i + 1] = baseWave + microHeight + (this.customElevations[vIdx] ?? 0);
    }

    WaterChannelTerrain.apply(scene, positions, this.GROUND_W, this.GROUND_H);
    ground.updateVerticesData('position', positions);
    this.recomputeNormals(ground, positions);
    ground.refreshBoundingInfo();
  }

  static sampleElevationAt(scene: Scene, worldX: number, worldZ: number): number {
    const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
    if (!ground) return 0;
    const positions = ground.getVerticesData('position');
    if (!positions) return 0;

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
      const y = this.sampleElevationAt(scene, x, z);
      const eps = 0.35;
      const dydx =
        (this.sampleElevationAt(scene, x + eps, z) -
          this.sampleElevationAt(scene, x - eps, z)) /
        (2 * eps);
      const dydz =
        (this.sampleElevationAt(scene, x, z + eps) -
          this.sampleElevationAt(scene, x, z - eps)) /
        (2 * eps);
      const adjX = x - dydx * Math.abs(y) * 0.18;
      const adjZ = z - dydz * Math.abs(y) * 0.18;
      const adjY = this.sampleElevationAt(scene, adjX, adjZ) + liftY;
      return new Vector3(adjX, adjY, adjZ);
    };

    if (this.activeGridMode === 'Hex') {
      const hexR = 1.05;
      const dx = hexR * 1.5;
      const dz = hexR * Math.sqrt(3);
      let col = 0;
      for (let cx = -halfW + hexR; cx <= halfW - hexR; cx += dx, col++) {
        const zOffset = col % 2 === 0 ? 0 : dz / 2;
        for (let cz = -halfH + hexR + zOffset; cz <= halfH - hexR; cz += dz) {
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
      const cellStep = this.activeGridMode === '10 ft' ? 3.0 : 1.5;
      const sampleStep = 0.5;

      for (let x = -halfW; x <= halfW + 0.01; x += cellStep) {
        const polyline: Vector3[] = [];
        for (let z = -halfH; z <= halfH + 0.01; z += sampleStep) {
          polyline.push(slopeAdjustedPoint(x, z));
        }
        lines.push(polyline);
      }

      for (let z = -halfH; z <= halfH + 0.01; z += cellStep) {
        const polyline: Vector3[] = [];
        for (let x = -halfW; x <= halfW + 0.01; x += sampleStep) {
          polyline.push(slopeAdjustedPoint(x, z));
        }
        lines.push(polyline);
      }
    }

    const grid = MeshBuilder.CreateLineSystem('lw-terrain-grid', { lines }, scene);
    grid.color = Color3.FromHexString('#34634d');
    grid.isPickable = false;
  }

  static applyFloorBumpTexture(
    scene: Scene,
    albedoUrl: string,
    normalUrl: string,
    tilingScale = 10,
    heightUrl?: string,
  ): void {
    this.activeAlbedoUrl = albedoUrl;
    this.activeNormalUrl = normalUrl;
    if (heightUrl !== undefined) {
      this.activeHeightUrl = heightUrl;
      this.ensureHeightMapLoaded(scene, heightUrl);
    }
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
    let needsVertexReliefUpdate = false;

    if (config.albedoUrl !== undefined && config.albedoUrl !== this.activeAlbedoUrl) {
      this.activeAlbedoUrl = config.albedoUrl;
      needsMaterialRebuild = true;
    }
    if (config.normalUrl !== undefined && config.normalUrl !== this.activeNormalUrl) {
      this.activeNormalUrl = config.normalUrl;
      needsMaterialRebuild = true;
    }
    if (config.heightUrl !== undefined && config.heightUrl !== this.activeHeightUrl) {
      this.activeHeightUrl = config.heightUrl;
      this.ensureHeightMapLoaded(scene, config.heightUrl);
      needsVertexReliefUpdate = true;
    }
    if (config.tilingScale !== undefined && config.tilingScale !== this.floorTilingScale) {
      this.floorTilingScale = config.tilingScale;
      needsMaterialRebuild = true;
      needsVertexReliefUpdate = true;
    }
    if (config.bumpIntensity !== undefined && config.bumpIntensity !== this.floorBumpIntensity) {
      this.floorBumpIntensity = config.bumpIntensity;
      const mat = scene.getMaterialByName('lw-terrain-mat') as StandardMaterial | null;
      if (mat?.bumpTexture) {
        mat.bumpTexture.level = (this.floorBumpIntensity / 100) * 1.35;
      } else {
        needsMaterialRebuild = true;
      }
    }
    if (config.heightScale !== undefined && config.heightScale !== this.floorHeightScale) {
      this.floorHeightScale = config.heightScale;
      needsVertexReliefUpdate = true;
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

    if (needsVertexReliefUpdate) {
      this.applyVertexReliefAndHeightMap(scene, ground);
      this.rebuildGridOverlay(scene);
    }
    if (needsMaterialRebuild) {
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
    // Multi-stop smooth cosine feathering between innerR and rPx for natural edge falloff
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

  private static ensureHeightMapLoaded(scene: Scene, url: string): void {
    if (!url || this.heightPixelsCache.has(url) || typeof Image === 'undefined') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (typeof document === 'undefined') return;
      const c = document.createElement('canvas');
      c.width = Math.min(256, img.naturalWidth || 256);
      c.height = Math.min(256, img.naturalHeight || 256);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      this.heightPixelsCache.set(url, { data: imgData.data, w: c.width, h: c.height });
      const ground = scene.getMeshByName('lw-terrain-ground') as Mesh | null;
      if (ground && Math.abs(this.floorHeightScale - 100) > 1) {
        this.applyVertexReliefAndHeightMap(scene, ground);
        this.rebuildGridOverlay(scene);
      }
    };
    img.src = url;
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

  private static rebuildCompositeCanvasFromImage(
    scene: Scene,
    mat: StandardMaterial,
    img: HTMLImageElement,
  ): void {
    if (typeof document === 'undefined') return;
    const size = this.COMP_SIZE;
    if (!this.baseTiledCanvas) {
      this.baseTiledCanvas = document.createElement('canvas');
      this.baseTiledCanvas.width = size;
      this.baseTiledCanvas.height = size;
    }
    const bctx = this.baseTiledCanvas.getContext('2d');
    if (!bctx) return;

    const cols = Math.max(2, this.floorTilingScale);
    const rows = Math.max(2, Math.round(this.floorTilingScale * 0.8));
    const tileW = size / cols;
    const tileH = size / rows;

    bctx.clearRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        bctx.drawImage(img, c * tileW, r * tileH, tileW + 0.75, tileH + 0.75);
      }
    }

    // Apply Global Floor Colorize with selected Photoshop Blend Mode
    if (this.floorColorStrength > 0 && this.floorColorHex) {
      bctx.save();
      const mode =
        this.floorColorBlendMode === 'eraser' ? 'multiply' : this.floorColorBlendMode;
      bctx.globalCompositeOperation = mode as GlobalCompositeOperation;
      bctx.globalAlpha = Math.max(0, Math.min(1, this.floorColorStrength / 100));
      bctx.fillStyle = this.floorColorHex;
      bctx.fillRect(0, 0, size, size);
      bctx.restore();
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
    mat.diffuseColor = Color3.FromHexString('#b8c7be');
    mat.specularColor = Color3.FromHexString('#1e2923');
    mat.roughness = 0.85;

    const uScale = this.floorTilingScale;
    const vScale = Math.round(this.floorTilingScale * 0.8);
    const hasCustomColorOrPaint =
      this.floorColorStrength > 0 || this.paintDabs.length > 0;

    try {
      if (this.activeAlbedoUrl) {
        if (hasCustomColorOrPaint) {
          const readyImg = this.loadOrGetAlbedoImage(this.activeAlbedoUrl, (loaded) => {
            const currentMat = scene.getMaterialByName(
              'lw-terrain-mat',
            ) as StandardMaterial | null;
            if (currentMat) {
              this.rebuildCompositeCanvasFromImage(scene, currentMat, loaded);
            }
          });
          if (readyImg) {
            this.rebuildCompositeCanvasFromImage(scene, mat, readyImg);
          } else {
            const diffTex = new Texture(this.activeAlbedoUrl, scene);
            diffTex.uScale = uScale;
            diffTex.vScale = vScale;
            mat.diffuseTexture = diffTex;
          }
        } else {
          const diffTex = new Texture(this.activeAlbedoUrl, scene);
          diffTex.uScale = uScale;
          diffTex.vScale = vScale;
          mat.diffuseTexture = diffTex;
          // Pre-warm image cache so switching to brush painting is instantaneous
          this.loadOrGetAlbedoImage(this.activeAlbedoUrl, () => {});
        }
      }
      if (this.activeNormalUrl) {
        const bumpTex = new Texture(this.activeNormalUrl, scene);
        bumpTex.uScale = uScale;
        bumpTex.vScale = vScale;
        bumpTex.level = (this.floorBumpIntensity / 100) * 1.35;
        mat.bumpTexture = bumpTex;
      }
    } catch {
      if (biome.toLowerCase().includes('forest')) {
        mat.diffuseColor = Color3.FromHexString('#183326');
      }
    }

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

    // Precompute average elevation inside brush for 'smooth' mode
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

    ground.updateVerticesData('position', positions);
    this.recomputeNormals(ground, positions);
    ground.refreshBoundingInfo();
    this.rebuildGridOverlay(scene);
  }

  private static recomputeNormals(ground: Mesh, positions: number[] | Float32Array): void {
    const indices = ground.getIndices();
    if (!indices) return;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    ground.updateVerticesData('normal', normals);
  }
}
