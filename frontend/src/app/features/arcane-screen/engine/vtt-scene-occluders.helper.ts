import {
  MapScatterClusterNode,
  MapSceneGraphState,
  MapStampNode,
  MapWallSegmentNode,
  WallOpeningNode,
} from '../../maps/engine/map-scene-contract';
import { isMapSceneGraphStatePayload } from '../../effects/engine/babylon-vtt-3d-scene-graph.helper';
import { VttWallSegmentVm } from '../models/vtt-battle.models';

const DEFAULT_CELL_METERS = 1.5;

/**
 * Extracts 2D Line-of-Sight and movement occluder segments (`VttWallSegmentVm[]`)
 * from a loaded 3D Map Studio scene (`MapSceneGraphState`):
 * 1. Architectural walls (`state.walls`) with open-doorway cutouts and closed-door blockers.
 * 2. 3D stamps & props (`state.stamps`: rocks, mushrooms, pillars, ruins, buildings).
 * 3. Deterministic procedural scatter (`state.scatterClusters`: trees, boulders, foliage).
 */
export function extractSceneOccludersFromMapState(rawSceneData: unknown): VttWallSegmentVm[] {
  const state = parseMapSceneGraphState(rawSceneData);
  if (!state) return [];

  const segments: VttWallSegmentVm[] = [];

  if (Array.isArray(state.walls)) {
    for (const wall of state.walls) {
      extractWallPolylineSegments(wall, segments);
    }
  }

  if (Array.isArray(state.stamps)) {
    for (const stamp of state.stamps) {
      extractStampOccluderSegments(stamp, segments);
    }
  }

  if (Array.isArray(state.scatterClusters)) {
    for (const cluster of state.scatterClusters) {
      extractScatterClusterOccluders(cluster, segments);
    }
  }

  return segments;
}

function parseMapSceneGraphState(rawSceneData: unknown): MapSceneGraphState | null {
  if (!rawSceneData) return null;
  let candidate: unknown = rawSceneData;
  if (typeof rawSceneData === 'string') {
    const trimmed = rawSceneData.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return isMapSceneGraphStatePayload(candidate) ? candidate : null;
}

function isVisionPassableOpening(op: WallOpeningNode): boolean {
  if (op.type === 'window' || op.type === 'bars') return true;
  if (op.type === 'archway' || op.type === 'breach' || op.type === 'door_open') return true;
  return Boolean(op.isOpen);
}

function isMovementPassableOpening(op: WallOpeningNode): boolean {
  if (op.type === 'window' || op.type === 'bars') return false;
  if (op.type === 'archway' || op.type === 'breach' || op.type === 'door_open') return true;
  return Boolean(op.isOpen);
}

function extractWallPolylineSegments(
  wall: MapWallSegmentNode,
  out: VttWallSegmentVm[],
): void {
  const pts = wall.points;
  if (!Array.isArray(pts) || pts.length < 2) return;

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

  let accumBefore = 0;
  const openings = Array.isArray(wall.openings) ? wall.openings : [];

  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const totalLen = segLengths[i];
    if (totalLen < 0.08) continue;

    const segGlobalStartT = totalPerimeter > 0 ? accumBefore / totalPerimeter : 0;
    const segGlobalEndT = totalPerimeter > 0 ? (accumBefore + totalLen) / totalPerimeter : 1;
    accumBefore += totalLen;

    const localCutouts: { startLocal: number; endLocal: number; opening: WallOpeningNode }[] = [];
    for (const op of openings) {
      if (op.t >= segGlobalStartT - 0.001 && op.t <= segGlobalEndT + 0.001) {
        const localCenter =
          segGlobalEndT > segGlobalStartT
            ? (op.t - segGlobalStartT) / (segGlobalEndT - segGlobalStartT)
            : 0.5;
        const halfSpan = Math.min(0.45, (op.widthMeters * 0.5) / totalLen);
        localCutouts.push({
          startLocal: Math.max(0, localCenter - halfSpan),
          endLocal: Math.min(1, localCenter + halfSpan),
          opening: op,
        });
      }
    }
    localCutouts.sort((x, y) => x.startLocal - y.startLocal);

    const solidSpans: [number, number][] = [];
    let cursor = 0;
    for (const cut of localCutouts) {
      if (cut.startLocal - cursor > 0.03) {
        solidSpans.push([cursor, cut.startLocal]);
      }
      if (!isVisionPassableOpening(cut.opening) || !isMovementPassableOpening(cut.opening)) {
        out.push({
          id: `wall-op-${wall.id}-${cut.opening.id}`,
          label: cut.opening.name || wall.name || 'Doorway',
          x1: Number((a[0] + dx * cut.startLocal).toFixed(3)),
          z1: Number((a[1] + dz * cut.startLocal).toFixed(3)),
          x2: Number((a[0] + dx * cut.endLocal).toFixed(3)),
          z2: Number((a[1] + dz * cut.endLocal).toFixed(3)),
          blocksVision: !isVisionPassableOpening(cut.opening),
          blocksMovement: !isMovementPassableOpening(cut.opening),
        });
      }
      cursor = Math.max(cursor, cut.endLocal);
    }
    if (1 - cursor > 0.03) {
      solidSpans.push([cursor, 1]);
    }

    for (let sIdx = 0; sIdx < solidSpans.length; sIdx++) {
      const [s0, s1] = solidSpans[sIdx];
      out.push({
        id: `wall-${wall.id}-${i}-${sIdx}`,
        label: wall.name || 'Stone Wall',
        x1: Number((a[0] + dx * s0).toFixed(3)),
        z1: Number((a[1] + dz * s0).toFixed(3)),
        x2: Number((a[0] + dx * s1).toFixed(3)),
        z2: Number((a[1] + dz * s1).toFixed(3)),
        blocksVision: true,
        blocksMovement: true,
      });
    }
  }
}

function extractStampOccluderSegments(
  st: MapStampNode,
  out: VttWallSegmentVm[],
): void {
  if (st.category === 'Token' || st.category === 'DecalStamp') return;
  if (st.blocksVision === false) return;
  const is3dObject = Boolean(st.modelUrl) || st.category === 'Architecture' || st.category === 'Prop';
  if (!is3dObject && !st.blocksVision) return;

  const baseScale = Math.max(0.35, st.scale || 1);
  const sx = Math.max(0.35, (st.scaleX ?? 1) * baseScale);
  const sz = Math.max(0.35, (st.scaleZ ?? 1) * baseScale);

  // Inset silhouette (~46% of full visual footprint) so the front surface of the 3D object
  // remains visible to the observer while casting a clean shadow wedge behind it.
  const rx = Math.max(0.28, DEFAULT_CELL_METERS * sx * 0.26);
  const rz = Math.max(0.28, DEFAULT_CELL_METERS * sz * 0.26);
  const rot = st.rotationY || 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const sides = 6;
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const lx = Math.cos(a) * rx;
    const lz = Math.sin(a) * rz;
    pts.push({
      x: st.x + lx * cos - lz * sin,
      z: st.z + lx * sin + lz * cos,
    });
  }

  for (let i = 0; i < sides; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % sides];
    out.push({
      id: `stamp-occ-${st.id}-${i}`,
      label: st.label || '3D Object',
      x1: Number(p1.x.toFixed(3)),
      z1: Number(p1.z.toFixed(3)),
      x2: Number(p2.x.toFixed(3)),
      z2: Number(p2.z.toFixed(3)),
      blocksVision: true,
      blocksMovement: st.blocksMovement ?? true,
    });
  }
}

function extractScatterClusterOccluders(
  cluster: MapScatterClusterNode,
  out: VttWallSegmentVm[],
): void {
  const makePrng = (initialSeed: number) => {
    let state = initialSeed || 1042;
    return (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const nextRand = makePrng(cluster.seed);
  const itemCount = Math.min(
    96,
    Math.max(0, Math.round(Math.PI * cluster.radius ** 2 * (cluster.density / 100) * 0.4)),
  );

  for (let j = 0; j < itemCount; j++) {
    const r = Math.sqrt(nextRand()) * Math.max(0.1, cluster.radius);
    const a = nextRand() * Math.PI * 2;
    const ix = cluster.x + Math.cos(a) * r;
    const iz = cluster.z + Math.sin(a) * r;
    const s = 0.85 + nextRand() * 0.3;
    nextRand(); // consume rotY to stay 100% synchronized with SeededScatterEngine

    const trunkR = Math.max(0.18, 0.24 * s);
    out.push(
      {
        id: `scatter-occ-${cluster.id}-${j}-a`,
        label: cluster.label || 'Tree',
        x1: Number((ix - trunkR).toFixed(3)),
        z1: Number(iz.toFixed(3)),
        x2: Number((ix + trunkR).toFixed(3)),
        z2: Number(iz.toFixed(3)),
        blocksVision: true,
        blocksMovement: false,
      },
      {
        id: `scatter-occ-${cluster.id}-${j}-b`,
        label: cluster.label || 'Tree',
        x1: Number(ix.toFixed(3)),
        z1: Number((iz - trunkR).toFixed(3)),
        x2: Number(ix.toFixed(3)),
        z2: Number((iz + trunkR).toFixed(3)),
        blocksVision: true,
        blocksMovement: false,
      },
    );
  }
}
