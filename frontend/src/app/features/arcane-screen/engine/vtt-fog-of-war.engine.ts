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

const CANVAS_W = 360;
const CANVAS_H = 270;

export interface VttFogRenderInput {
  readonly encounterId: string;
  readonly mode: VttFogMode;
  readonly losVisionEnabled?: boolean;
  readonly losWallShadowsEnabled?: boolean;
  readonly observers: readonly VttTokenVm[];
  readonly walls: readonly VttWallSegmentVm[];
  readonly defaultSightFeet: number;
  readonly applyTokenVision: boolean;
  readonly traveledFogOpacity: number;
  readonly unexploredFogOpacity: number;
  readonly visionFalloffPct: number;
  readonly visionFalloffCurvePct?: number;
  readonly shadowSoftnessPx: number;
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
 * Combines per-token line-of-sight visibility polygons against walls and 3D objects,
 * DM-adjustable radial vision falloff feathering, DM-adjustable soft shadow penumbra edges,
 * continuous traveled path memory, and manual GM Reveal/Cover brush strokes.
 */
export class VttFogOfWarEngine {
  private readonly exploredByEncounter = new Map<string, HTMLCanvasElement>();
  private readonly lastObserverPosByKey = new Map<string, { x: number; z: number }>();
  private outputCanvas: HTMLCanvasElement | null = null;
  private liveMaskCanvas: HTMLCanvasElement | null = null;
  private polyScratchCanvas: HTMLCanvasElement | null = null;
  private lastRenderSig = '';
  private revisionCounter = 1;

  resetExplored(encounterId?: string): void {
    this.lastRenderSig = '';
    if (encounterId) {
      for (const k of Array.from(this.exploredByEncounter.keys())) {
        if (k === encounterId || k.startsWith(`${encounterId}:`)) {
          this.exploredByEncounter.delete(k);
        }
      }
      for (const k of Array.from(this.lastObserverPosByKey.keys())) {
        if (k.startsWith(`${encounterId}:`)) {
          this.lastObserverPosByKey.delete(k);
        }
      }
    } else {
      this.exploredByEncounter.clear();
      this.lastObserverPosByKey.clear();
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

    const sig = this.computeInputSignature(input);
    if (sig === this.lastRenderSig && this.outputCanvas) {
      return this.outputCanvas;
    }

    const out = this.ensureCanvas('out');
    const liveMask = this.ensureCanvas('live');
    if (!out || !liveMask) return null;

    const outCtx = out.getContext('2d');
    const liveCtx = liveMask.getContext('2d');
    if (!outCtx || !liveCtx) return null;

    const blockingWalls = input.losWallShadowsEnabled !== false ? input.walls.filter((w) => w.blocksVision) : [];
    const curvePct = input.visionFalloffCurvePct ?? 50;
    const scopeKey = `${input.encounterId}:${input.observers.map((o) => o.key).join('|') || 'all'}`;
    const exploredCanvas = this.getOrCreateExploredCanvas(scopeKey);
    const exploredCtx = exploredCanvas?.getContext('2d') ?? null;

    // 1. Build live visibility mask from observer tokens (unless manual-only mode)
    liveCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (input.mode !== 'manual-only' && input.losVisionEnabled !== false) {
      for (const observer of input.observers) {
        const sightFeet = getEffectiveTokenVisionFeet(observer, input.defaultSightFeet, input.applyTokenVision);
        const radiusWorld = sightFeet / FEET_PER_WORLD_UNIT;

        if (input.mode === 'explored-los' && exploredCtx) {
          const posKey = `${scopeKey}:${observer.key}`;
          const prev = this.lastObserverPosByKey.get(posKey);
          if (prev) {
            const moveDist = Math.hypot(observer.x - prev.x, observer.z - prev.z);
            if (moveDist > 0.35 && moveDist < 18) {
              const steps = Math.min(4, Math.max(1, Math.ceil(moveDist / 0.9)));
              for (let s = 0; s < steps; s++) {
                const ratio = s / steps;
                const ix = prev.x + (observer.x - prev.x) * ratio;
                const iz = prev.z + (observer.z - prev.z) * ratio;
                const stepPoly = this.computeVisibilityPolygon(ix, iz, radiusWorld, blockingWalls);
                this.stampVisibilityPolygon(exploredCtx, ix, iz, radiusWorld, stepPoly, input.visionFalloffPct, curvePct, 0, blockingWalls.length > 0);
              }
              this.lastObserverPosByKey.set(posKey, { x: observer.x, z: observer.z });
            }
          } else {
            this.lastObserverPosByKey.set(posKey, { x: observer.x, z: observer.z });
          }
        }

        const poly = this.computeVisibilityPolygon(observer.x, observer.z, radiusWorld, blockingWalls);
        this.stampVisibilityPolygon(liveCtx, observer.x, observer.z, radiusWorld, poly, input.visionFalloffPct, curvePct, input.shadowSoftnessPx, blockingWalls.length > 0);
      }
    }

    // 2. Apply manual GM brush strokes to both liveMask and exploredCanvas
    for (const stroke of input.manualStrokes) {
      this.applyBrushStroke(liveCtx, stroke);
      if (exploredCtx) {
        this.applyBrushStroke(exploredCtx, stroke);
      }
    }

    // 3. Compose final Fog of War layer (pure #000000 black base)
    const unexploredAlpha = Math.max(0.08, Math.min(1.0, input.unexploredFogOpacity));
    const traveledAlpha = Math.max(0.0, Math.min(0.95, input.traveledFogOpacity));

    outCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    outCtx.globalCompositeOperation = 'source-over';
    outCtx.fillStyle = `rgba(0, 0, 0, ${unexploredAlpha})`;
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

    // Punch out currently visible areas completely (alpha -> 0) so active LoS is crystal clear
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

    // Keep a 2px black perimeter rim so clamped UVs outside map bounds remain black
    outCtx.save();
    outCtx.globalCompositeOperation = 'source-over';
    outCtx.strokeStyle = `rgba(0, 0, 0, ${unexploredAlpha})`;
    outCtx.lineWidth = 4;
    outCtx.strokeRect(0, 0, CANVAS_W, CANVAS_H);
    outCtx.restore();

    this.lastRenderSig = sig;
    (out as HTMLCanvasElement & { _lwFogRev?: number })._lwFogRev = ++this.revisionCounter;
    return out;
  }

  private computeInputSignature(input: VttFogRenderInput): string {
    const obsPart = input.observers
      .map(
        (o) =>
          `${o.key}:${o.x.toFixed(2)},${o.z.toFixed(2)},${o.sightFeet ?? ''},${o.darkvisionFeet ?? ''},${o.emitsLight ? o.lightDimFeet : 0}`,
      )
      .join('|');
    const lastStroke = input.manualStrokes[input.manualStrokes.length - 1]?.id ?? '';
    return `${input.encounterId}:${input.mode}:${input.losVisionEnabled !== false}:${input.losWallShadowsEnabled !== false}:${input.defaultSightFeet}:${input.applyTokenVision}:${input.traveledFogOpacity.toFixed(2)}:${input.unexploredFogOpacity.toFixed(2)}:${input.visionFalloffPct}:${input.visionFalloffCurvePct ?? 50}:${input.shadowSoftnessPx}:${input.walls.length}:${input.manualStrokes.length}:${lastStroke}:${obsPart}`;
  }

  computeVisibilityPolygon(
    ox: number,
    oz: number,
    radiusWorld: number,
    walls: readonly VttWallSegmentVm[],
  ): VttPoint2D[] {
    const activeWalls = walls.filter(
      (w) => this.distToSegment(ox, oz, w.x1, w.z1, w.x2, w.z2) <= radiusWorld + 0.5,
    );

    if (activeWalls.length === 0) {
      const pts: VttPoint2D[] = [];
      const steps = 72;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        pts.push({ x: ox + Math.cos(a) * radiusWorld, z: oz + Math.sin(a) * radiusWorld });
      }
      return pts;
    }

    const rawAngles: number[] = [];
    const circleSteps = 72;
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
        if (Math.hypot(dx, dz) > 0.05) {
          const base = Math.atan2(dz, dx);
          rawAngles.push(base - 0.0004, base, base + 0.0004);
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
          if (t1 >= 0.14 && t2 >= -0.001 && t2 <= 1.001 && t1 < minT) {
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
    visionFalloffPct: number,
    visionFalloffCurvePct: number,
    shadowSoftnessPx: number,
    hasBlockingWalls = false,
  ): void {
    if (polygon.length < 3) return;
    const center = this.worldToPixel(ox, oz);
    const radiusPx = Math.max(8, (radiusWorld / FOG_WORLD_WIDTH) * CANVAS_W);
    const featherFrac = Math.max(0.0, Math.min(1.0, (visionFalloffPct ?? 45) / 100));
    const coreStop = Math.max(0.04, 0.985 - featherFrac * 0.945);
    const curveNorm = Math.max(5, Math.min(95, visionFalloffCurvePct ?? 50));
    const gamma = Math.pow(3.6, (curveNorm - 50) / 40);

    const grad = ctx.createRadialGradient(center.x, center.y, radiusPx * 0.02, center.x, center.y, radiusPx);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(coreStop, 'rgba(255, 255, 255, 1.0)');
    const steps = 8;
    for (let k = 1; k < steps; k++) {
      const u = k / steps;
      const s = u * u * (3 - 2 * u);
      const t = 0.45 * u + 0.55 * s;
      const alpha = Math.max(0, Math.min(1, Math.pow(1.0 - t, gamma)));
      const stopPos = Math.min(0.999, coreStop + u * (1.0 - coreStop));
      grad.addColorStop(stopPos, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
    }
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

    const blurPx = hasBlockingWalls ? Math.max(0, Math.min(16, Math.round((shadowSoftnessPx ?? 10) * 0.45))) : 0;
    const scratch = blurPx > 0 ? this.ensureCanvas('scratch') : null;
    const scratchCtx = scratch?.getContext('2d') ?? null;

    if (scratch && scratchCtx) {
      scratchCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      scratchCtx.save();
      scratchCtx.globalCompositeOperation = 'source-over';
      scratchCtx.filter = `blur(${blurPx}px)`;
      scratchCtx.beginPath();
      polygon.forEach((pt, idx) => {
        const p = this.worldToPixel(pt.x, pt.z);
        if (idx === 0) scratchCtx.moveTo(p.x, p.y);
        else scratchCtx.lineTo(p.x, p.y);
      });
      scratchCtx.closePath();
      scratchCtx.fillStyle = 'rgba(255, 255, 255, 1.0)';
      scratchCtx.fill();
      scratchCtx.filter = 'none';
      scratchCtx.globalCompositeOperation = 'destination-in';
      scratchCtx.beginPath();
      scratchCtx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
      scratchCtx.fillStyle = grad;
      scratchCtx.fill();
      scratchCtx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    if (!hasBlockingWalls) {
      ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    } else {
      polygon.forEach((pt, idx) => {
        const p = this.worldToPixel(pt.x, pt.z);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
    }
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
      outCtx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      outCtx.fillRect(center.x - radiusPx, center.y - radiusPx, radiusPx * 2, radiusPx * 2);
    } else {
      const grad = outCtx.createRadialGradient(center.x, center.y, radiusPx * 0.3, center.x, center.y, radiusPx);
      grad.addColorStop(0.0, `rgba(0, 0, 0, ${alpha})`);
      grad.addColorStop(0.8, `rgba(0, 0, 0, ${alpha * 0.85})`);
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      outCtx.fillStyle = grad;
      outCtx.beginPath();
      outCtx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
      outCtx.fill();
    }
    outCtx.restore();
  }

  private worldToPixel(x: number, z: number): { x: number; y: number } {
    return { x: ((x - FOG_WORLD_MIN_X) / FOG_WORLD_WIDTH) * CANVAS_W, y: ((z - FOG_WORLD_MIN_Z) / FOG_WORLD_HEIGHT) * CANVAS_H };
  }

  private distToSegment(px: number, pz: number, x1: number, z1: number, x2: number, z2: number): number {
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

  private ensureCanvas(which: 'out' | 'live' | 'scratch'): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const create = () => {
      const c = document.createElement('canvas');
      c.width = CANVAS_W;
      c.height = CANVAS_H;
      return c;
    };
    if (which === 'out') return (this.outputCanvas ??= create());
    if (which === 'scratch') return (this.polyScratchCanvas ??= create());
    return (this.liveMaskCanvas ??= create());
  }
}
