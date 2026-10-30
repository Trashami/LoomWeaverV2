import { VttFogMode, VttWallSegmentVm } from '../models/vtt-battle.models';
import {
  FEET_PER_WORLD_UNIT,
  SVG_VIEWBOX_HEIGHT,
  SVG_VIEWBOX_WIDTH,
  computeVisibilityPolygonSvgPoints,
  distanceInFeet,
  hasLineOfSight,
  worldToSvgX,
  worldToSvgY,
} from './vtt-los-and-grid.engine';

/** Feather width in feet on each side of the vision edge. */
export const FEATHER_FEET = 10;

const SVG_PX_PER_FOOT = SVG_VIEWBOX_WIDTH / (24 * FEET_PER_WORLD_UNIT);
const VISIBILITY_RAYS = 128;
const TRAVELED_ALPHA_FACTOR = 0.5;
const FOG_RGB = [3, 8, 6] as const;

/**
 * Feather rings are drawn at each offset from the vision edge. A ring at
 * `offsetFeet` carries the clearness of the 5-ft grid band just inside it,
 * so the falloff steps every 5 ft across the 10 ft feather on each side.
 */
const FEATHER_BANDS: readonly { readonly offsetFeet: number; readonly clear: number }[] = [
  { offsetFeet: -FEATHER_FEET, clear: 1 },
  { offsetFeet: -5, clear: 0.8 },
  { offsetFeet: 0, clear: 0.6 },
  { offsetFeet: 5, clear: 0.4 },
  { offsetFeet: FEATHER_FEET, clear: 0.2 },
];

export interface FogObserver {
  readonly x: number;
  readonly z: number;
  readonly radiusFeet: number;
}

export interface FogCircle {
  readonly x: number;
  readonly z: number;
  readonly radiusFeet: number;
}

export interface FogPoint {
  readonly x: number;
  readonly z: number;
}

/** Sight range, extended by darkvision when darkvision reaches further. */
export function tokenVisionRadiusFeet(
  token: { readonly sightFeet?: number; readonly darkvisionFeet?: number },
  defaultSightFeet: number,
): number {
  return Math.max(token.sightFeet ?? defaultSightFeet, token.darkvisionFeet ?? 0);
}

/**
 * Returns 0..1 for how visible `point` is to the observers. Full inside the
 * vision edge minus the feather, fading out across the last 10 ft, and 0 when
 * an observer's line of sight is blocked or the point is out of range.
 */
export function visibilityFactorForPoint(
  point: FogPoint,
  observers: readonly FogObserver[],
  walls: readonly VttWallSegmentVm[],
): number {
  let best = 0;
  for (const obs of observers) {
    const origin = { x: obs.x, z: obs.z };
    const dist = distanceInFeet(origin, point);
    if (dist > obs.radiusFeet) continue;
    if (!hasLineOfSight(origin, point, obs.radiusFeet, walls)) continue;
    best = Math.max(best, Math.min(1, (obs.radiusFeet - dist) / FEATHER_FEET));
    if (best === 1) break;
  }
  return best;
}

/**
 * Renders the player fog as a 1200x800 canvas (SVG viewBox space). Returns null
 * when fog is off. Explored mode dims traveled-but-unseen areas to 50% black.
 */
export function renderFogOfWarCanvas(
  observers: readonly FogObserver[],
  walls: readonly VttWallSegmentVm[],
  mode: VttFogMode,
  traveled: readonly FogCircle[],
): HTMLCanvasElement | null {
  if (mode === 'no-fog') return null;

  const visible = createLayerCanvas();
  paintVisibility(visible, observers, walls);

  const traveledLayer = mode === 'explored-los' ? createLayerCanvas() : null;
  if (traveledLayer) paintTraveled(traveledLayer, traveled);

  return composeFog(visible, traveledLayer);
}

function createLayerCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SVG_VIEWBOX_WIDTH;
  canvas.height = SVG_VIEWBOX_HEIGHT;
  const ctx = ctx2d(canvas);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Paints each observer's feather rings; `lighten` keeps the brightest clearness per pixel. */
function paintVisibility(
  canvas: HTMLCanvasElement,
  observers: readonly FogObserver[],
  walls: readonly VttWallSegmentVm[],
): void {
  const ctx = ctx2d(canvas);
  ctx.globalCompositeOperation = 'lighten';
  for (const obs of observers) {
    for (const band of FEATHER_BANDS) {
      const radius = Math.max(1, obs.radiusFeet + band.offsetFeet);
      const pts = computeVisibilityPolygonSvgPoints(
        { x: obs.x, z: obs.z },
        radius,
        walls,
        VISIBILITY_RAYS,
      );
      const level = Math.round(band.clear * 255);
      fillSvgPolygon(ctx, pts, `rgb(${level}, ${level}, ${level})`);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function paintTraveled(canvas: HTMLCanvasElement, circles: readonly FogCircle[]): void {
  const ctx = ctx2d(canvas);
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = '#ffffff';
  for (const c of circles) {
    ctx.beginPath();
    ctx.arc(worldToSvgX(c.x), worldToSvgY(c.z), c.radiusFeet * SVG_PX_PER_FOOT, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function composeFog(visible: HTMLCanvasElement, traveledLayer: HTMLCanvasElement | null): HTMLCanvasElement {
  const out = createLayerCanvas();
  const outCtx = ctx2d(out);
  const seen = ctx2d(visible).getImageData(0, 0, out.width, out.height).data;
  const travelData = traveledLayer
    ? ctx2d(traveledLayer).getImageData(0, 0, out.width, out.height).data
    : null;
  const image = outCtx.createImageData(out.width, out.height);
  const px = image.data;

  for (let i = 0; i < px.length; i += 4) {
    const unseen = 1 - seen[i] / 255;
    const travelFactor = travelData ? 1 - TRAVELED_ALPHA_FACTOR * (travelData[i] / 255) : 1;
    px[i] = FOG_RGB[0];
    px[i + 1] = FOG_RGB[1];
    px[i + 2] = FOG_RGB[2];
    px[i + 3] = Math.round(unseen * travelFactor * 255);
  }

  outCtx.putImageData(image, 0, 0);
  return out;
}

function fillSvgPolygon(ctx: CanvasRenderingContext2D, pts: string, fill: string): void {
  const coords = pts.split(' ').map((pair) => pair.split(',').map(Number));
  ctx.beginPath();
  coords.forEach(([x, y], idx) => {
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context is unavailable for fog rendering.');
  return ctx;
}
