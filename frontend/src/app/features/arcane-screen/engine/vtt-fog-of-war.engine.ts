import { VttTokenVm } from '../../effects/engine/effect-timeline.contract';
import {
  VttFogBrushStrokeVm,
  VttFogMode,
  VttPoint2D,
  VttWallSegmentVm,
} from '../models/vtt-battle.models';
import { FEET_PER_WORLD_UNIT } from './vtt-los-and-grid.engine';

export const FOG_WORLD_MIN_X = -18;
export const FOG_WORLD_MAX_X = 18;
export const FOG_WORLD_MIN_Z = -13.5;
export const FOG_WORLD_MAX_Z = 13.5;
export const FOG_WORLD_WIDTH = FOG_WORLD_MAX_X - FOG_WORLD_MIN_X; // 36
export const FOG_WORLD_HEIGHT = FOG_WORLD_MAX_Z - FOG_WORLD_MIN_Z; // 27

const CANVAS_W = 1080;
const CANVAS_H = 810;

export interface VttFogRenderInput {
  readonly encounterId: string;
  readonly mode: VttFogMode;
  readonly observers: readonly VttTokenVm[];
  readonly walls: readonly VttWallSegmentVm[];
  readonly defaultSightFeet: number;
  readonly applyTokenVision: boolean;
  readonly traveledFogOpacity: number;
  readonly unexploredFogOpacity: number;
  readonly manualStrokes: readonly VttFogBrushStrokeVm[];
}

export function getEffectiveTokenVisionFeet(
  token: VttTokenVm,
  defaultSightFeet: number,
  applyTokenVision: boolean,
): number {
  if (!applyTokenVision) {
    return Math.max(10, defaultSightFeet);
  }
  const baseSight = token.sightFeet ?? defaultSightFeet;
  const darkvision = token.darkvisionFeet ?? 0;
  const emittedLight = token.emitsLight
    ? Math.max(token.lightDimFeet ?? 0, token.lightBrightFeet ?? 0)
    : 0;
  return Math.max(10, baseSight, darkvision, emittedLight);
}

/**
 * MythWeaver-style smooth raycasted Fog of War engine.
 * Combines per-token line-of-sight visibility polygons, radial aperture feathering,
 * traveled path memory, and manual GM Reveal/Cover brush strokes.
 */
export class VttFogOfWarEngine {
  private readonly exploredByEncounter = new Map<string, HTMLCanvasElement>();
  private outputCanvas: HTMLCanvasElement | null = null;
  private liveMaskCanvas: HTMLCanvasElement | null = null;

  resetExplored(encounterId?: string): void {
    if (encounterId) {
      for (const k of Array.from(this.exploredByEncounter.keys())) {
        if (k === encounterId || k.startsWith(`${encounterId}:`)) {
          this.exploredByEncounter.delete(k);
        }
      }
    } else {
      this.exploredByEncounter.clear();
    }
  }

  revealEntireEncounter(encounterId: string): void {
    const exp = this.getOrCreateExploredCanvas(encounterId);
    if (!exp) return;
    const ctx = exp.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  render(input: VttFogRenderInput): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || input.mode === 'no-fog') {
      return null;
    }

    const out = this.ensureCanvas('out');
    const liveMask = this.ensureCanvas('live');
    if (!out || !liveMask) return null;

    const outCtx = out.getContext('2d');
    const liveCtx = liveMask.getContext('2d');
    if (!outCtx || !liveCtx) return null;

    const blockingWalls = input.walls.filter((w) => w.blocksVision);
    const scopeKey = `${input.encounterId}:${input.observers.map((o) => o.key).join('|') || 'all'}`;
    const exploredCanvas = this.getOrCreateExploredCanvas(scopeKey);
    const exploredCtx = exploredCanvas?.getContext('2d') ?? null;

    // 1. Build live visibility mask from observer tokens (unless manual-only mode)
    liveCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (input.mode !== 'manual-only') {
      for (const observer of input.observers) {
        const sightFeet = getEffectiveTokenVisionFeet(
          observer,
          input.defaultSightFeet,
          input.applyTokenVision,
        );
        const radiusWorld = sightFeet / FEET_PER_WORLD_UNIT;
        const poly = this.computeVisibilityPolygon(
          observer.x,
          observer.z,
          radiusWorld,
          blockingWalls,
        );
        this.stampVisibilityPolygon(liveCtx, observer.x, observer.z, radiusWorld, poly);
        if (input.mode === 'explored-los' && exploredCtx) {
          this.stampVisibilityPolygon(exploredCtx, observer.x, observer.z, radiusWorld, poly);
        }
      }
    }

    // 2. Apply manual GM brush strokes to both liveMask and exploredCanvas
    for (const stroke of input.manualStrokes) {
      this.applyBrushStroke(liveCtx, stroke);
      if (exploredCtx) {
        this.applyBrushStroke(exploredCtx, stroke);
      }
    }

    // 3. Compose final Fog of War layer
    const unexploredAlpha = Math.max(0.08, Math.min(0.98, input.unexploredFogOpacity));
    const traveledAlpha = Math.max(0.05, Math.min(0.92, input.traveledFogOpacity));

    outCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    outCtx.globalCompositeOperation = 'source-over';
    outCtx.fillStyle = `rgba(3, 8, 6, ${unexploredAlpha})`;
    outCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // If keeping traveled areas cleared, reduce alpha in explored regions down to traveledAlpha
    if (input.mode === 'explored-los' && exploredCanvas && unexploredAlpha > traveledAlpha) {
      const eraseFraction = Math.max(
        0,
        Math.min(1, (unexploredAlpha - traveledAlpha) / unexploredAlpha),
      );
      outCtx.save();
      outCtx.globalCompositeOperation = 'destination-out';
      outCtx.globalAlpha = eraseFraction;
      outCtx.drawImage(exploredCanvas, 0, 0);
      outCtx.restore();
    }

    // Punch out currently visible areas completely (alpha -> 0)
    outCtx.save();
    outCtx.globalCompositeOperation = 'destination-out';
    outCtx.globalAlpha = 1.0;
    outCtx.drawImage(liveMask, 0, 0);
    outCtx.restore();

    // Re-apply any 'cover' manual strokes that came after 'reveal' so GM cover brush forces fog
    for (const stroke of input.manualStrokes) {
      if (stroke.mode === 'cover') {
        this.paintCoverFogOnOutput(outCtx, stroke, unexploredAlpha);
      }
    }

    return out;
  }

  computeVisibilityPolygon(
    ox: number,
    oz: number,
    radiusWorld: number,
    walls: readonly VttWallSegmentVm[],
  ): VttPoint2D[] {
    const activeWalls = walls.filter(
      (w) => this.distToSegment(ox, oz, w.x1, w.z1, w.x2, w.z2) <= radiusWorld,
    );

    if (activeWalls.length === 0) {
      const pts: VttPoint2D[] = [];
      const steps = 56;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        pts.push({ x: ox + Math.cos(a) * radiusWorld, z: oz + Math.sin(a) * radiusWorld });
      }
      return pts;
    }

    const rawAngles: number[] = [];
    const circleSteps = 96;
    for (let i = 0; i < circleSteps; i++) {
      rawAngles.push(-Math.PI + (i / circleSteps) * (Math.PI * 2));
    }

    for (const w of activeWalls) {
      for (const [px, pz] of [
        [w.x1, w.z1],
        [w.x2, w.z2],
      ]) {
        const dx = px - ox;
        const dz = pz - oz;
        if (Math.hypot(dx, dz) > 0.001) {
          const base = Math.atan2(dz, dx);
          rawAngles.push(base - 0.0003, base, base + 0.0003);
        }
      }
    }

    const sortedAngles = Array.from(
      new Set(
        rawAngles.map((a) => {
          let n = a;
          while (n <= -Math.PI) n += Math.PI * 2;
          while (n > Math.PI) n -= Math.PI * 2;
          return n;
        }),
      ),
    ).sort((a, b) => a - b);

    const polygon: VttPoint2D[] = [];
    for (const a of sortedAngles) {
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      let minT = radiusWorld;

      for (const w of activeWalls) {
        const sx = w.x2 - w.x1;
        const sz = w.z2 - w.z1;
        const cross = dx * sz - dz * sx;
        if (Math.abs(cross) > 1e-6) {
          const qx = w.x1 - ox;
          const qz = w.z1 - oz;
          const t1 = (qx * sz - qz * sx) / cross;
          const t2 = (qx * dz - qz * dx) / cross;
          if (t1 >= 0.001 && t2 >= 0 && t2 <= 1 && t1 < minT) {
            minT = t1;
          }
        }
      }
      polygon.push({ x: ox + dx * minT, z: oz + dz * minT });
    }
    return polygon;
  }

  private stampVisibilityPolygon(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oz: number,
    radiusWorld: number,
    polygon: readonly VttPoint2D[],
  ): void {
    if (polygon.length < 3) return;
    const center = this.worldToPixel(ox, oz);
    const radiusPx = Math.max(8, (radiusWorld / FOG_WORLD_WIDTH) * CANVAS_W);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    polygon.forEach((pt, idx) => {
      const p = this.worldToPixel(pt.x, pt.z);
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();

    const grad = ctx.createRadialGradient(
      center.x,
      center.y,
      radiusPx * 0.15,
      center.x,
      center.y,
      radiusPx,
    );
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.68, 'rgba(255, 255, 255, 0.96)');
    grad.addColorStop(0.88, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  private applyBrushStroke(ctx: CanvasRenderingContext2D, stroke: VttFogBrushStrokeVm): void {
    const center = this.worldToPixel(stroke.x, stroke.z);
    const radiusWorld = Math.max(1, stroke.radiusFeet / FEET_PER_WORLD_UNIT);
    const radiusPx = Math.max(6, (radiusWorld / FOG_WORLD_WIDTH) * CANVAS_W);

    ctx.save();
    ctx.globalCompositeOperation = stroke.mode === 'reveal' ? 'source-over' : 'destination-out';
    if (stroke.shape === 'square') {
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      ctx.fillRect(center.x - radiusPx, center.y - radiusPx, radiusPx * 2, radiusPx * 2);
    } else {
      const grad = ctx.createRadialGradient(
        center.x,
        center.y,
        radiusPx * 0.25,
        center.x,
        center.y,
        radiusPx,
      );
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.92)');
      grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private paintCoverFogOnOutput(
    outCtx: CanvasRenderingContext2D,
    stroke: VttFogBrushStrokeVm,
    alpha: number,
  ): void {
    const center = this.worldToPixel(stroke.x, stroke.z);
    const radiusWorld = Math.max(1, stroke.radiusFeet / FEET_PER_WORLD_UNIT);
    const radiusPx = Math.max(6, (radiusWorld / FOG_WORLD_WIDTH) * CANVAS_W);

    outCtx.save();
    outCtx.globalCompositeOperation = 'source-over';
    if (stroke.shape === 'square') {
      outCtx.fillStyle = `rgba(3, 8, 6, ${alpha})`;
      outCtx.fillRect(center.x - radiusPx, center.y - radiusPx, radiusPx * 2, radiusPx * 2);
    } else {
      const grad = outCtx.createRadialGradient(
        center.x,
        center.y,
        radiusPx * 0.3,
        center.x,
        center.y,
        radiusPx,
      );
      grad.addColorStop(0.0, `rgba(3, 8, 6, ${alpha})`);
      grad.addColorStop(0.8, `rgba(3, 8, 6, ${alpha * 0.85})`);
      grad.addColorStop(1.0, 'rgba(3, 8, 6, 0.0)');
      outCtx.fillStyle = grad;
      outCtx.beginPath();
      outCtx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
      outCtx.fill();
    }
    outCtx.restore();
  }

  private worldToPixel(x: number, z: number): { x: number; y: number } {
    return {
      x: ((x - FOG_WORLD_MIN_X) / FOG_WORLD_WIDTH) * CANVAS_W,
      y: ((z - FOG_WORLD_MIN_Z) / FOG_WORLD_HEIGHT) * CANVAS_H,
    };
  }

  private distToSegment(
    px: number,
    pz: number,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
  ): number {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    if (l2 === 0) return Math.hypot(px - x1, pz - z1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
    return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
  }

  private getOrCreateExploredCanvas(encounterId: string): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const key = encounterId || 'default';
    let canvas = this.exploredByEncounter.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      this.exploredByEncounter.set(key, canvas);
    }
    return canvas;
  }

  private ensureCanvas(which: 'out' | 'live'): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    if (which === 'out') {
      if (!this.outputCanvas) {
        this.outputCanvas = document.createElement('canvas');
        this.outputCanvas.width = CANVAS_W;
        this.outputCanvas.height = CANVAS_H;
      }
      return this.outputCanvas;
    }
    if (!this.liveMaskCanvas) {
      this.liveMaskCanvas = document.createElement('canvas');
      this.liveMaskCanvas.width = CANVAS_W;
      this.liveMaskCanvas.height = CANVAS_H;
    }
    return this.liveMaskCanvas;
  }
}
