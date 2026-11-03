import { VttTokenVm } from "../../effects/engine/effect-timeline.contract";
import {
  VttClampedLineResult,
  VttPoint2D,
  VttWallSegmentVm,
} from "../models/vtt-battle.models";

export const FEET_PER_WORLD_UNIT = 5;
export const WORLD_UNITS_PER_GRID_CELL = 1; // 1 world unit = 50 SVG px = 1 5-ft square at scale 1.0
export const SVG_VIEWBOX_WIDTH = 1200;
export const SVG_VIEWBOX_HEIGHT = 800;
export const BASE_GRID_CELL_SVG_PX = 50;

let currentGridScale = 1.0;
let currentGridOffsetX = 0.0;
let currentGridOffsetY = 0.0;

export function setActiveGridCalibration(scale: number, offsetX: number, offsetY: number): void {
  currentGridScale = Math.max(0.25, Math.min(3.0, scale || 1.0));
  currentGridOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
  currentGridOffsetY = Number.isFinite(offsetY) ? offsetY : 0;
}

export function getActiveGridCalibration(): { scale: number; offsetX: number; offsetY: number } {
  return {
    scale: currentGridScale,
    offsetX: currentGridOffsetX,
    offsetY: currentGridOffsetY,
  };
}

export function worldToSvgX(x: number): number {
  return Math.round(((x + 12) / 24) * SVG_VIEWBOX_WIDTH * 10) / 10;
}

export function worldToSvgY(z: number): number {
  return Math.round(((z + 8) / 16) * SVG_VIEWBOX_HEIGHT * 10) / 10;
}

export function svgToWorldPoint(svgX: number, svgY: number): VttPoint2D {
  const x = Math.max(
    -11.5,
    Math.min(11.5, (svgX / SVG_VIEWBOX_WIDTH) * 24 - 12),
  );
  const z = Math.max(-7.5, Math.min(7.5, (svgY / SVG_VIEWBOX_HEIGHT) * 16 - 8));
  return {
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
  };
}

export function feetToSvgPx(feet: number): number {
  const cellPx = BASE_GRID_CELL_SVG_PX * currentGridScale;
  if (feet <= 5) {
    return Math.round(cellPx * 0.56 * 10) / 10;
  }
  return Math.round((feet / 5) * cellPx * 10) / 10;
}

export function distanceInFeet(a: VttPoint2D, b: VttPoint2D): number {
  const cellWorld = 1.0 * currentGridScale;
  const squares = Math.hypot(b.x - a.x, b.z - a.z) / cellWorld;
  return Math.round(squares * 5 * 10) / 10;
}

export function snapToFiveFootGrid(pt: VttPoint2D): VttPoint2D {
  const stepWorld = Math.max(0.25, WORLD_UNITS_PER_GRID_CELL * currentGridScale);
  const offXWorld = (currentGridOffsetX / BASE_GRID_CELL_SVG_PX) * WORLD_UNITS_PER_GRID_CELL;
  const offZWorld = (currentGridOffsetY / BASE_GRID_CELL_SVG_PX) * WORLD_UNITS_PER_GRID_CELL;
  const snappedX = Math.round((pt.x - offXWorld) / stepWorld) * stepWorld + offXWorld;
  const snappedZ = Math.round((pt.z - offZWorld) / stepWorld) * stepWorld + offZWorld;
  return {
    x: Math.max(-17.5, Math.min(17.5, Math.round(snappedX * 100) / 100)),
    z: Math.max(-13.0, Math.min(13.0, Math.round(snappedZ * 100) / 100)),
  };
}

export function intersectSegmentWithWall(
  a: VttPoint2D,
  b: VttPoint2D,
  wall: VttWallSegmentVm,
): { t: number; point: VttPoint2D } | null {
  const rX = b.x - a.x;
  const rZ = b.z - a.z;
  const segLen = Math.hypot(rX, rZ);
  const sX = wall.x2 - wall.x1;
  const sZ = wall.z2 - wall.z1;

  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < 1e-7) {
    return null;
  }

  const qpX = wall.x1 - a.x;
  const qpZ = wall.z1 - a.z;

  const t = (qpX * sZ - qpZ * sX) / denom;
  const u = (qpX * rZ - qpZ * rX) / denom;
  const minT = segLen > 0.25 ? 0.12 / segLen : 0.01;

  if (t >= minT && t <= 1 && u >= 0 && u <= 1) {
    return {
      t,
      point: {
        x: a.x + t * rX,
        z: a.z + t * rZ,
      },
    };
  }
  return null;
}

export function clampLineToRangeAndWalls(
  start: VttPoint2D,
  desiredEnd: VttPoint2D,
  maxRangeFeet: number,
  walls: readonly VttWallSegmentVm[],
  checkMovementBlock = false,
): VttClampedLineResult {
  const dx = desiredEnd.x - start.x;
  const dz = desiredEnd.z - start.z;
  const rawWorldDist = Math.hypot(dx, dz);
  const maxWorldDist = (maxRangeFeet / 5) * currentGridScale;

  let clampedEnd: VttPoint2D = desiredEnd;
  if (rawWorldDist > maxWorldDist && rawWorldDist > 1e-5) {
    const scale = maxWorldDist / rawWorldDist;
    clampedEnd = {
      x: start.x + dx * scale,
      z: start.z + dz * scale,
    };
  }

  let bestT = 1.0;
  let blockedByWall = false;
  let blockingWallLabel: string | null = null;
  let hitPoint = clampedEnd;

  for (const wall of walls) {
    if (checkMovementBlock ? !wall.blocksMovement : !wall.blocksVision) {
      continue;
    }
    const hit = intersectSegmentWithWall(start, clampedEnd, wall);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      blockedByWall = true;
      blockingWallLabel = wall.label;
      const pullBackT = Math.max(0, hit.t - 0.03);
      hitPoint = {
        x: start.x + (clampedEnd.x - start.x) * pullBackT,
        z: start.z + (clampedEnd.z - start.z) * pullBackT,
      };
    }
  }

  return {
    start,
    end: {
      x: Math.round(hitPoint.x * 100) / 100,
      z: Math.round(hitPoint.z * 100) / 100,
    },
    distanceFeet: distanceInFeet(start, hitPoint),
    maxRangeFeet,
    blockedByWall,
    blockingWallLabel,
  };
}

export function hasLineOfSight(
  observer: VttPoint2D,
  target: VttPoint2D,
  sightDistanceFeet: number,
  walls: readonly VttWallSegmentVm[],
): boolean {
  const distFeet = distanceInFeet(observer, target);
  if (distFeet > sightDistanceFeet) {
    return false;
  }
  for (const wall of walls) {
    if (!wall.blocksVision) continue;
    const hit = intersectSegmentWithWall(observer, target, wall);
    if (hit && hit.t < 0.98) {
      return false;
    }
  }
  return true;
}

export function computeVisibilityPolygonSvgPoints(
  observer: VttPoint2D,
  sightDistanceFeet: number,
  walls: readonly VttWallSegmentVm[],
  rayCount = 96,
): string {
  const maxWorldDist = (sightDistanceFeet / 5) * currentGridScale;
  const pts: string[] = [];

  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const desiredEnd: VttPoint2D = {
      x: observer.x + Math.cos(angle) * maxWorldDist,
      z: observer.z + Math.sin(angle) * maxWorldDist,
    };
    const clamped = clampLineToRangeAndWalls(
      observer,
      desiredEnd,
      sightDistanceFeet,
      walls,
      false,
    );
    pts.push(`${worldToSvgX(clamped.end.x)},${worldToSvgY(clamped.end.z)}`);
  }

  return pts.join(" ");
}

export function computeClampedGridMovePath(
  start: VttPoint2D,
  desiredCursor: VttPoint2D,
  maxMoveFeet: number,
  walls: readonly VttWallSegmentVm[],
): {
  readonly waypoints: readonly VttPoint2D[];
  readonly destination: VttPoint2D;
  readonly distanceFeet: number;
  readonly blockedByWall: boolean;
  readonly blockingWallLabel: string | null;
} {
  const clampedLine = clampLineToRangeAndWalls(
    start,
    desiredCursor,
    maxMoveFeet,
    walls,
    true,
  );
  const snappedEnd = snapToFiveFootGrid(clampedLine.end);
  const snappedCheck = clampLineToRangeAndWalls(
    start,
    snappedEnd,
    maxMoveFeet,
    walls,
    true,
  );
  const finalDest = snappedCheck.blockedByWall ? clampedLine.end : snappedEnd;

  const waypoints: VttPoint2D[] = [start];
  const steps = Math.max(1, Math.round(distanceInFeet(start, finalDest) / 5));
  for (let i = 1; i <= steps; i++) {
    const ratio = i / steps;
    waypoints.push({
      x: Math.round((start.x + (finalDest.x - start.x) * ratio) * 10) / 10,
      z: Math.round((start.z + (finalDest.z - start.z) * ratio) * 10) / 10,
    });
  }

  return {
    waypoints,
    destination: finalDest,
    distanceFeet: Math.min(
      maxMoveFeet,
      Math.round(distanceInFeet(start, finalDest) / 5) * 5,
    ),
    blockedByWall: clampedLine.blockedByWall || snappedCheck.blockedByWall,
    blockingWallLabel:
      clampedLine.blockingWallLabel ?? snappedCheck.blockingWallLabel,
  };
}

export function findClosestSnapToken(
  attackerPos: VttPoint2D,
  cursorPos: VttPoint2D,
  maxRangeFeet: number,
  snapRadiusFeet: number,
  candidates: readonly VttTokenVm[],
  walls: readonly VttWallSegmentVm[],
): VttTokenVm | null {
  let bestToken: VttTokenVm | null = null;
  let bestCursorDist = snapRadiusFeet;

  for (const token of candidates) {
    const tokenPos: VttPoint2D = { x: token.x, z: token.z };
    const distFromAttacker = distanceInFeet(attackerPos, tokenPos);
    if (distFromAttacker > maxRangeFeet) {
      continue;
    }
    if (!hasLineOfSight(attackerPos, tokenPos, maxRangeFeet, walls)) {
      continue;
    }
    const distFromCursor = distanceInFeet(cursorPos, tokenPos);
    if (distFromCursor <= bestCursorDist) {
      bestCursorDist = distFromCursor;
      bestToken = token;
    }
  }

  return bestToken;
}

export function findTokensInAoe(
  aoeCenter: VttPoint2D,
  aoeRadiusFeet: number,
  tokens: readonly VttTokenVm[],
): readonly VttTokenVm[] {
  const centerSvgX = worldToSvgX(aoeCenter.x);
  const centerSvgY = worldToSvgY(aoeCenter.z);
  const circleRadiusPx = feetToSvgPx(aoeRadiusFeet);
  const tokenBodyAllowancePx = aoeRadiusFeet <= 5 ? 8 : 16;

  return tokens.filter((t) => {
    const dx = worldToSvgX(t.x) - centerSvgX;
    const dy = worldToSvgY(t.z) - centerSvgY;
    return Math.hypot(dx, dy) <= circleRadiusPx + tokenBodyAllowancePx;
  });
}
