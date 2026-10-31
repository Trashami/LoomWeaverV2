import { VttTokenVm } from "../../effects/engine/effect-timeline.contract";
import {
  VttClampedLineResult,
  VttPoint2D,
  VttWallSegmentVm,
} from "../models/vtt-battle.models";

export const FEET_PER_WORLD_UNIT = 2.5;
export const WORLD_UNITS_PER_GRID_CELL = 2; // 2 * 2.5ft = 5ft grid cell
export const SVG_VIEWBOX_WIDTH = 1200;
export const SVG_VIEWBOX_HEIGHT = 800;

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
  if (feet <= 5) {
    return 28;
  }
  return Math.round(feet * 6.8 * 10) / 10;
}

export function distanceInFeet(a: VttPoint2D, b: VttPoint2D): number {
  return (
    Math.round(Math.hypot(b.x - a.x, b.z - a.z) * FEET_PER_WORLD_UNIT * 10) / 10
  );
}

export function snapToFiveFootGrid(pt: VttPoint2D): VttPoint2D {
  const step = 1.0; // 1 world unit step = 5ft dungeon tile alignment
  return {
    x: Math.max(-10.5, Math.min(10.5, Math.round(pt.x / step) * step)),
    z: Math.max(-6.5, Math.min(6.5, Math.round(pt.z / step) * step)),
  };
}

/**
 * Computes intersection between segment AB and wall segment CD.
 * Returns parameter t in [0, 1] along AB if an intersection occurs.
 */
export function intersectSegmentWithWall(
  a: VttPoint2D,
  b: VttPoint2D,
  wall: VttWallSegmentVm,
): { t: number; point: VttPoint2D } | null {
  const rX = b.x - a.x;
  const rZ = b.z - a.z;
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

  if (t >= 0.001 && t <= 1 && u >= 0 && u <= 1) {
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

/**
 * Clamps a ray from `start` toward `desiredEnd` so it never exceeds `maxRangeFeet`
 * and stops immediately at the closest vision/movement-blocking wall.
 */
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
  const maxWorldDist = maxRangeFeet / FEET_PER_WORLD_UNIT;

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
      // Pull back slightly before the wall surface so token/AoE remains on player side
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

/**
 * Checks whether `observer` has unobstructed Line of Sight to `target` within `sightDistanceFeet`.
 */
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

/**
 * Computes a 360-degree visibility polygon in SVG coordinates (`x,y x,y ...`)
 * from `observer` out to `sightDistanceFeet`, clipped against all vision-blocking walls.
 */
export function computeVisibilityPolygonSvgPoints(
  observer: VttPoint2D,
  sightDistanceFeet: number,
  walls: readonly VttWallSegmentVm[],
  rayCount = 96,
): string {
  const maxWorldDist = sightDistanceFeet / FEET_PER_WORLD_UNIT;
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

/**
 * Computes a grid-snapped movement preview path that follows the 5-ft grid,
 * stops at walls, and never exceeds `maxMoveFeet`.
 */
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
  // Verify the final snapped cell doesn't cross a wall from the start
  const snappedCheck = clampLineToRangeAndWalls(
    start,
    snappedEnd,
    maxMoveFeet,
    walls,
    true,
  );
  const finalDest = snappedCheck.blockedByWall ? clampedLine.end : snappedEnd;

  // Build intermediate 5-ft grid steps for visual grid path preview
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

/**
 * Finds the nearest token within `snapRadiusFeet` of `cursorPos` that is within
 * `maxRangeFeet` of `attackerPos` and has unobstructed Line of Sight.
 */
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

/**
 * Returns all visible tokens whose body intersects or lies inside the SVG AoE circle
 * centered at `aoeCenter` with radius `aoeRadiusFeet`.
 */
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
