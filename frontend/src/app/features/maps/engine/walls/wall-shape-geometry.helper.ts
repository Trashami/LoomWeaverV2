import { MapWallSegmentNode, WallDrawMode } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import type { SnappedWallCursorResult, WallDoorAttachmentHit } from './wall-mesh.builder';

interface RawWallEdge {
  readonly wallId: string;
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly angleY: number;
}

export function extractWallEdges(walls: readonly MapWallSegmentNode[] | undefined): RawWallEdge[] {
  if (!walls || walls.length === 0) return [];
  const edges: RawWallEdge[] = [];
  for (const w of walls) {
    const pts = w.points;
    if (pts.length < 2) continue;
    const closed = w.drawMode !== 'line' && w.drawMode !== 'freehand';
    const segCount = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      if (Math.hypot(dx, dz) < 0.05) continue;
      edges.push({
        wallId: w.id,
        ax: a[0],
        az: a[1],
        bx: b[0],
        bz: b[1],
        angleY: -Math.atan2(dz, dx),
      });
    }
  }
  return edges;
}

export function snapWallCursorPointHelper(
  walls: readonly MapWallSegmentNode[] | undefined,
  rawX: number,
  rawZ: number,
  anchor: { x: number; z: number } | null,
  snapToGrid: boolean,
): SnappedWallCursorResult {
  const edges = extractWallEdges(walls);
  const cornerSnapRadius = snapToGrid ? 1.35 : 0.75;

  let bestCornerDist = cornerSnapRadius;
  let bestCorner: { x: number; z: number; wallId: string; edgeAngleY: number; dx: number; dz: number } | null =
    null;

  for (const e of edges) {
    const dA = Math.hypot(rawX - e.ax, rawZ - e.az);
    if (dA < bestCornerDist) {
      bestCornerDist = dA;
      bestCorner = {
        x: e.ax,
        z: e.az,
        wallId: e.wallId,
        edgeAngleY: e.angleY,
        dx: e.bx - e.ax,
        dz: e.bz - e.az,
      };
    }
    const dB = Math.hypot(rawX - e.bx, rawZ - e.bz);
    if (dB < bestCornerDist) {
      bestCornerDist = dB;
      bestCorner = {
        x: e.bx,
        z: e.bz,
        wallId: e.wallId,
        edgeAngleY: e.angleY,
        dx: e.bx - e.ax,
        dz: e.bz - e.az,
      };
    }
  }

  if (bestCorner && (!anchor || Math.hypot(bestCorner.x - anchor.x, bestCorner.z - anchor.z) > 0.25)) {
    const len = Math.max(0.01, Math.hypot(bestCorner.dx, bestCorner.dz));
    const ux = bestCorner.dx / len;
    const uz = bestCorner.dz / len;
    const relX = rawX - bestCorner.x;
    const relZ = rawZ - bestCorner.z;
    const perpDot = relX * -uz + relZ * ux;
    const perpAngleY =
      perpDot >= 0 ? bestCorner.edgeAngleY + Math.PI / 2 : bestCorner.edgeAngleY - Math.PI / 2;

    return {
      x: Math.round(bestCorner.x * 100) / 100,
      z: Math.round(bestCorner.z * 100) / 100,
      snappedToCorner: true,
      connectedWallId: bestCorner.wallId,
      previewAngleY: perpAngleY,
    };
  }

  // Also snap to existing wall segment centerlines for T-junction connections
  const edgeSnapRadius = snapToGrid ? 0.92 : 0.55;
  let bestEdgeDist = edgeSnapRadius;
  let bestEdgeHit: { x: number; z: number; wallId: string; edgeAngleY: number } | null = null;
  for (const e of edges) {
    const edx = e.bx - e.ax;
    const edz = e.bz - e.az;
    const lenSq = edx * edx + edz * edz;
    if (lenSq < 0.01) continue;
    const t = Math.max(0, Math.min(1, ((rawX - e.ax) * edx + (rawZ - e.az) * edz) / lenSq));
    const px = e.ax + edx * t;
    const pz = e.az + edz * t;
    const dist = Math.hypot(rawX - px, rawZ - pz);
    if (dist < bestEdgeDist && (!anchor || Math.hypot(px - anchor.x, pz - anchor.z) > 0.25)) {
      bestEdgeDist = dist;
      bestEdgeHit = {
        x: Math.round(px * 100) / 100,
        z: Math.round(pz * 100) / 100,
        wallId: e.wallId,
        edgeAngleY: e.angleY,
      };
    }
  }
  if (bestEdgeHit) {
    const previewAngleY = anchor
      ? -Math.atan2(bestEdgeHit.z - anchor.z, bestEdgeHit.x - anchor.x)
      : bestEdgeHit.edgeAngleY + Math.PI / 2;
    return {
      x: bestEdgeHit.x,
      z: bestEdgeHit.z,
      snappedToCorner: true,
      connectedWallId: bestEdgeHit.wallId,
      previewAngleY,
    };
  }

  const baseSnap = TerrainMeshBuilder.snapWorldCoordinates(rawX, rawZ, snapToGrid, 'wall');
  let sx = baseSnap.x;
  let sz = baseSnap.z;
  let previewAngleY = 0;

  if (anchor && snapToGrid) {
    const dx = sx - anchor.x;
    const dz = sz - anchor.z;
    const dist = Math.hypot(dx, dz);
    if (dist >= 0.5) {
      const anchorEdge = edges.find(
        (e) =>
          Math.hypot(anchor.x - e.ax, anchor.z - e.az) < 0.25 ||
          Math.hypot(anchor.x - e.bx, anchor.z - e.bz) < 0.25,
      );
      const rawAngle = Math.atan2(dz, dx);
      const stepRad = Math.PI / 2;
      const baseRefAngle = anchorEdge ? -anchorEdge.angleY : 0;
      const relAngle = rawAngle - baseRefAngle;
      const nearestOrtho = Math.round(relAngle / stepRad) * stepRad + baseRefAngle;
      const angleDiff = Math.abs(
        Math.atan2(Math.sin(rawAngle - nearestOrtho), Math.cos(rawAngle - nearestOrtho)),
      );

      if (angleDiff <= 0.38) {
        const stepMeters = TerrainMeshBuilder.getCellStepMeters();
        const snappedLen = Math.max(stepMeters, Math.round(dist / stepMeters) * stepMeters);
        sx = Math.round((anchor.x + Math.cos(nearestOrtho) * snappedLen) * 100) / 100;
        sz = Math.round((anchor.z + Math.sin(nearestOrtho) * snappedLen) * 100) / 100;
      }
      previewAngleY = -Math.atan2(sz - anchor.z, sx - anchor.x);
    }
  }

  return {
    x: sx,
    z: sz,
    snappedToCorner: false,
    previewAngleY,
  };
}

export function mergeSharedWallsOnPlacementHelper(
  existingWalls: readonly MapWallSegmentNode[],
  newWall: MapWallSegmentNode,
  snapToGrid = true,
): { walls: MapWallSegmentNode[]; primaryWallId: string } {
  if (!snapToGrid || newWall.drawMode === 'freehand' || newWall.points.length < 2) {
    return {
      walls: [...existingWalls, newWall],
      primaryWallId: newWall.id,
    };
  }

  const newPts = newWall.points;
  const isClosed = newWall.drawMode !== 'line';
  const segCount = isClosed ? newPts.length : newPts.length - 1;
  const candidateEdges: [readonly [number, number], readonly [number, number]][] = [];
  for (let i = 0; i < segCount; i++) {
    const a = newPts[i];
    const b = newPts[(i + 1) % newPts.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.25) {
      candidateEdges.push([a, b]);
    }
  }

  const workingWalls: MapWallSegmentNode[] = [];
  for (const w of existingWalls) {
    if (w.drawMode !== 'line' && w.drawMode !== 'freehand' && w.points.length > 2) {
      const wPts = w.points;
      for (let i = 0; i < wPts.length; i++) {
        const a = wPts[i];
        const b = wPts[(i + 1) % wPts.length];
        workingWalls.push({
          ...w,
          id: i === 0 ? w.id : `${w.id}-edge-${i}`,
          drawMode: 'line',
          points: [a, b],
          openings: i === 0 ? w.openings : [],
        });
      }
    } else {
      workingWalls.push({ ...w });
    }
  }

  let primaryWallId = newWall.id;
  let edgeIdx = 0;

  for (const [na, nb] of candidateEdges) {
    const ndx = nb[0] - na[0];
    const ndz = nb[1] - na[1];
    const nLen = Math.hypot(ndx, ndz);
    if (nLen < 0.25) continue;
    const ux = ndx / nLen;
    const uz = ndz / nLen;

    let mergedIntoExisting = false;

    for (let wIdx = 0; wIdx < workingWalls.length; wIdx++) {
      const ew = workingWalls[wIdx];
      if (ew.points.length !== 2) continue;
      const [ea, eb] = ew.points;
      const edx = eb[0] - ea[0];
      const edz = eb[1] - ea[1];
      const eLen = Math.hypot(edx, edz);
      if (eLen < 0.25) continue;

      const dot = (ux * edx + uz * edz) / eLen;
      if (Math.abs(dot) < 0.992) continue;

      const perpDist = Math.abs((ea[0] - na[0]) * -uz + (ea[1] - na[1]) * ux);
      if (perpDist > 0.28) continue;

      const tN0 = 0;
      const tN1 = nLen;
      const tEA = (ea[0] - na[0]) * ux + (ea[1] - na[1]) * uz;
      const tEB = (eb[0] - na[0]) * ux + (eb[1] - na[1]) * uz;
      const tE0 = Math.min(tEA, tEB);
      const tE1 = Math.max(tEA, tEB);

      const overlapStart = Math.max(tN0, tE0);
      const overlapEnd = Math.min(tN1, tE1);
      const touchesOrOverlaps = overlapEnd >= overlapStart - 0.22;

      if (touchesOrOverlaps) {
        const unionStart = Math.min(tN0, tE0);
        const unionEnd = Math.max(tN1, tE1);
        const mergedA: readonly [number, number] = [
          Math.round((na[0] + ux * unionStart) * 100) / 100,
          Math.round((na[1] + uz * unionStart) * 100) / 100,
        ];
        const mergedB: readonly [number, number] = [
          Math.round((na[0] + ux * unionEnd) * 100) / 100,
          Math.round((na[1] + uz * unionEnd) * 100) / 100,
        ];

        workingWalls[wIdx] = {
          ...ew,
          points: [mergedA, mergedB],
        };
        primaryWallId = ew.id;
        mergedIntoExisting = true;
        break;
      }
    }

    if (!mergedIntoExisting) {
      const segId = edgeIdx === 0 ? newWall.id : `${newWall.id}-edge-${edgeIdx}`;
      if (edgeIdx === 0) {
        primaryWallId = segId;
      }
      workingWalls.push({
        ...newWall,
        id: segId,
        drawMode: 'line',
        points: [na, nb],
      });
      edgeIdx++;
    }
  }

  return {
    walls: workingWalls,
    primaryWallId,
  };
}

export function buildWallShapePointsHelper(
  mode: WallDrawMode,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  freehandPoints?: readonly (readonly [number, number])[],
  snapToGrid = true,
): (readonly [number, number])[] {
  const snapPt = (x: number, z: number): [number, number] => {
    if (!snapToGrid) {
      return [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
    }
    const s = TerrainMeshBuilder.snapWorldCoordinates(x, z, true, 'wall');
    return [s.x, s.z];
  };

  if (mode === 'freehand' && freehandPoints && freehandPoints.length >= 2) {
    return freehandPoints.map(([px, pz]) => snapPt(px, pz));
  }

  const [sx, sz] = snapPt(startX, startZ);
  const [ex, ez] = snapPt(endX, endZ);

  if (mode === 'line') {
    return [
      [sx, sz],
      [ex, ez],
    ];
  }

  const minX = Math.min(sx, ex);
  const maxX = Math.max(sx, ex);
  const minZ = Math.min(sz, ez);
  const maxZ = Math.max(sz, ez);
  const w = Math.max(1.5, maxX - minX);
  const d = Math.max(1.5, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const rx = w / 2;
  const rz = d / 2;

  if (mode === 'room') {
    return [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ];
  }
  if (mode === 'triangle') {
    return [snapPt(cx, maxZ), [maxX, minZ], [minX, minZ]];
  }
  if (mode === 'l_shape') {
    const [midX, midZ] = snapPt(minX + w * 0.5, minZ + d * 0.5);
    return [
      [minX, minZ],
      [maxX, minZ],
      [maxX, midZ],
      [midX, midZ],
      [midX, maxZ],
      [minX, maxZ],
    ];
  }
  if (mode === 't_shape') {
    const [x1, zBar] = snapPt(minX + w * 0.33, minZ + d * 0.6);
    const [x2] = snapPt(minX + w * 0.67, minZ);
    return [
      [x1, minZ],
      [x2, minZ],
      [x2, zBar],
      [maxX, zBar],
      [maxX, maxZ],
      [minX, maxZ],
      [minX, zBar],
      [x1, zBar],
    ];
  }
  if (mode === 'cross') {
    const [x1, z1] = snapPt(minX + w * 0.33, minZ + d * 0.33);
    const [x2, z2] = snapPt(minX + w * 0.67, minZ + d * 0.67);
    return [
      [x1, minZ],
      [x2, minZ],
      [x2, z1],
      [maxX, z1],
      [maxX, z2],
      [x2, z2],
      [x2, maxZ],
      [x1, maxZ],
      [x1, z2],
      [minX, z2],
      [minX, z1],
      [x1, z1],
    ];
  }

  const sides = mode === 'circle' ? 24 : mode === 'hexagon' ? 6 : 8;
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push([
      Math.round((cx + Math.cos(a) * rx) * 100) / 100,
      Math.round((cz + Math.sin(a) * rz) * 100) / 100,
    ]);
  }
  return pts;
}

export function findClosestWallAttachmentHelper(
  walls: readonly MapWallSegmentNode[] | undefined,
  worldX: number,
  worldZ: number,
  maxSnapDist = 4.0,
): WallDoorAttachmentHit | null {
  if (!walls || walls.length === 0) return null;
  let bestHit: WallDoorAttachmentHit | null = null;
  let bestDist = maxSnapDist;

  for (const wall of walls) {
    const pts = wall.points;
    if (pts.length < 2) continue;
    const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';
    const segCount = closed ? pts.length : pts.length - 1;

    const segLengths: number[] = [];
    let totalPerimeter = 0;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segLengths.push(len);
      totalPerimeter += len;
    }
    if (totalPerimeter < 0.2) continue;

    let accumBefore = 0;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const lenSq = dx * dx + dz * dz;
      const segLen = segLengths[i];
      if (segLen < 0.2) {
        accumBefore += segLen;
        continue;
      }
      let localT = ((worldX - a[0]) * dx + (worldZ - a[1]) * dz) / lenSq;
      localT = Math.max(0.12, Math.min(0.88, localT));
      const projX = a[0] + dx * localT;
      const projZ = a[1] + dz * localT;
      const dist = Math.hypot(worldX - projX, worldZ - projZ);
      if (dist < bestDist) {
        bestDist = dist;
        const globalT = (accumBefore + localT * segLen) / totalPerimeter;
        bestHit = {
          wallId: wall.id,
          t: Math.round(globalT * 1000) / 1000,
          x: Math.round(projX * 100) / 100,
          z: Math.round(projZ * 100) / 100,
          angleY: -Math.atan2(dz, dx),
          wallHeight: wall.heightMeters,
          wallThickness: wall.thicknessMeters,
        };
      }
      accumBefore += segLen;
    }
  }
  return bestHit;
}
