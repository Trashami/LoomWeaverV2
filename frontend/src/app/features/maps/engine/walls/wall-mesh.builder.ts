import {
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { MapWallSegmentNode, WallDrawMode, WallOpeningNode } from '../map-scene-contract';
import { GlbModelCache } from '../rendering/glb-model-cache';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { wallEndExtension } from './wall-join-profile';
import { fitWallStamp, wallGroundAt } from './wall-terrain-fit';
import { WallSurfacePaint } from './wall-surface-paint';
import { CutawayWallEngine } from './cutaway-wall.engine';

export interface WallDoorAttachmentHit {
  readonly wallId: string;
  readonly t: number;
  readonly x: number;
  readonly z: number;
  readonly angleY: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
}

export interface SnappedWallCursorResult {
  readonly x: number;
  readonly z: number;
  readonly snappedToCorner: boolean;
  readonly connectedWallId?: string;
  readonly previewAngleY: number;
}

interface RawWallEdge {
  readonly wallId: string;
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly angleY: number;
}

export class WallMeshBuilder {
  private static texCache = new Map<string, Texture>();
  private static activeScene: Scene | null = null;
  private static ghostMat: StandardMaterial | null = null;

  private static ensureSceneCache(scene: Scene): void {
    if (this.activeScene !== scene) {
      this.texCache.clear();
      this.ghostMat = null;
      this.activeScene = scene;
    }
  }

  private static getCachedTexture(scene: Scene, url: string): Texture {
    this.ensureSceneCache(scene);
    const existing = this.texCache.get(url);
    if (existing) {
      return existing;
    }
    const tex = new Texture(url, scene);
    this.texCache.set(url, tex);
    return tex;
  }

  private static getSharedGhostWallMat(scene: Scene): StandardMaterial {
    this.ensureSceneCache(scene);
    if (!this.ghostMat || this.ghostMat.getScene() !== scene) {
      const mat = new StandardMaterial('lw-ghost-wall-shared-mat', scene);
      mat.diffuseColor = Color3.FromHexString('#49e892');
      mat.emissiveColor = Color3.FromHexString('#2ee66b').scale(0.5);
      mat.alpha = 0.5;
      this.ghostMat = mat;
    }
    return this.ghostMat;
  }

  private static extractWallEdges(walls: readonly MapWallSegmentNode[] | undefined): RawWallEdge[] {
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

  /**
   * Snaps the wall cursor to:
   * 1. Existing wall endpoints/corners (magnetic corner snap for seamless 90° or collinear connections)
   * 2. The 1.5m (5 ft) floor grid intersection when `snapToGrid` is active
   * 3. Orthogonal 90° grid/wall angles when drawing a line from an anchor with `snapToGrid` active
   */
  static snapWallCursorPoint(
    walls: readonly MapWallSegmentNode[] | undefined,
    rawX: number,
    rawZ: number,
    anchor: { x: number; z: number } | null,
    snapToGrid: boolean,
  ): SnappedWallCursorResult {
    const edges = this.extractWallEdges(walls);
    const cornerSnapRadius = snapToGrid ? 1.15 : 0.65;

    // 1. Check magnetic snap to any existing wall vertex/corner
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
      // Determine natural 90-degree perpendicular orientation based on which side of the corner the cursor is on
      const len = Math.max(0.01, Math.hypot(bestCorner.dx, bestCorner.dz));
      const ux = bestCorner.dx / len;
      const uz = bestCorner.dz / len;
      // Perpendicular normal vectors (-uz, ux) and (uz, -ux)
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

    // 2. Grid snap when Snap is On
    const baseSnap = TerrainMeshBuilder.snapWorldCoordinates(rawX, rawZ, snapToGrid, 'wall');
    let sx = baseSnap.x;
    let sz = baseSnap.z;
    let previewAngleY = 0;

    // 3. When drawing from an anchor with Snap On, snap near-90° angles cleanly to orthogonal grid/wall directions
    if (anchor && snapToGrid) {
      const dx = sx - anchor.x;
      const dz = sz - anchor.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= 0.5) {
        // Check if anchor sits on an existing wall corner; if so, favor 0° / 90° / 180° / 270° relative to that wall
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

        // Snap within ~22 degrees to exact 90-degree orthogonal corner alignment
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

  /**
   * Deduplicates shared walls between adjacent rooms/walls and seamlessly merges/extends
   * colinear overlapping or touching wall segments into one single continuous wall span.
   */
  static mergeSharedWallsOnPlacement(
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

    // Break any polygon/room or line into individual straight 2-point wall segments
    // so shared walls between two rooms can be independently merged or extended without gaps
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

    // Expand any existing closed room into its constituent edges if a new wall shares an edge with it,
    // or merge directly with existing 2-point wall segments
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

        // Check parallel/colinear alignment (dot product near ±1)
        const dot = (ux * edx + uz * edz) / eLen;
        if (Math.abs(dot) < 0.992) continue;

        // Check perpendicular distance between lines
        const perpDist = Math.abs((ea[0] - na[0]) * -uz + (ea[1] - na[1]) * ux);
        if (perpDist > 0.28) continue;

        // Project both segments onto 1D axis starting at `na` along `(ux, uz)`
        const tN0 = 0;
        const tN1 = nLen;
        const tEA = (ea[0] - na[0]) * ux + (ea[1] - na[1]) * uz;
        const tEB = (eb[0] - na[0]) * ux + (eb[1] - na[1]) * uz;
        const tE0 = Math.min(tEA, tEB);
        const tE1 = Math.max(tEA, tEB);

        // Check if intervals overlap or touch at endpoints (within 0.22m tolerance)
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

  static buildShapePoints(
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

  static findClosestWallAttachment(
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

  private static createTexturedWallMaterial(
    scene: Scene,
    matName: string,
    wall: MapWallSegmentNode,
  ): StandardMaterial {
    const existing = scene.getMaterialByName(matName) as StandardMaterial | null;
    if (existing) {
      existing.dispose(false, false);
    }
    const mat = new StandardMaterial(matName, scene);
    const baseColorHex = wall.colorHex || CutawayWallEngine.materialHex(wall.material);
    const texUrl =
      wall.albedoUrl ||
      wall.thumbnailUrl ||
      '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone.png';

    if (texUrl) {
      const diffTex = this.getCachedTexture(scene, texUrl);
      diffTex.uScale = 3.0;
      diffTex.vScale = 1.6;
      mat.diffuseTexture = diffTex;
      mat.diffuseColor = wall.colorHex
        ? Color3.FromHexString(wall.colorHex)
        : Color3.White();
      const normUrl =
        wall.normalUrl ||
        '/assets/sewer-dungeon-wall-library-v1/512/worn-castle-flagstone_normal.png';
      if (normUrl) {
        const bumpTex = this.getCachedTexture(scene, normUrl);
        bumpTex.uScale = 3.0;
        bumpTex.vScale = 1.6;
        bumpTex.level = 1.2;
        mat.bumpTexture = bumpTex;
      }
    } else {
      mat.diffuseColor = Color3.FromHexString(baseColorHex);
      mat.emissiveColor = Color3.FromHexString(baseColorHex).scale(0.12);
    }
    mat.specularColor = Color3.FromHexString('#1d2822');
    return mat;
  }

  /**
   * Builds 3D walls:
   * - If `wall.modelUrl` is set (defaulting to "A Wall Made Of Stone" `/assets/object-library/models/obj-4f9776736fb571f1.glb`),
   *   seamlessly tiles the 3D stone wall stamp along each straight span with configurable Connection Overlap,
   *   Move Up/Down (`offsetY`), Stamp Scale (`stampScale`), and Rotation Offset (`rotationOffsetDeg`).
   * - Falls back to procedural textured box geometry while the 3D model is loading or if a 2D wall texture is used.
   */
  static rebuildWallMeshes(
    scene: Scene,
    walls: readonly MapWallSegmentNode[] | undefined,
    hideSecrets = false,
    onGlbLoaded?: () => void,
  ): number {
    this.ensureSceneCache(scene);
    WallSurfacePaint.clear(scene);
    scene.transformNodes
      .filter((n) => n.name.startsWith('lw-wall-node-') || n.name.startsWith('lw-door-node-'))
      .forEach((n) => n.dispose(false, false));
    scene.meshes
      .filter(
        (m) =>
          m.name.startsWith('lw-wall-') ||
          m.name.startsWith('lw-portal-') ||
          m.name.startsWith('lw-door-'),
      )
      .forEach((m) => m.dispose(false, false));

    if (!walls || walls.length === 0) return 0;
    let meshCount = 0;

    for (const wall of walls) {
      const pts = wall.points;
      if (pts.length < 2) continue;

      const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';
      const height = CutawayWallEngine.computeCutawayHeight(
        wall.heightMeters,
        wall.perspective,
        false,
      );
      const mat = this.createTexturedWallMaterial(scene, `lw-wall-mat-${wall.id}`, wall);
      const wallTpl = wall.modelUrl
        ? GlbModelCache.getOrLoadTemplate(scene, wall.modelUrl, onGlbLoaded)
        : null;

      const overlapFrac = Math.max(-0.2, Math.min(0.5, (wall.connectionOverlap ?? 15) / 100));
      const offsetY = wall.offsetY ?? -0.06;
      const stampScale = Math.max(0.4, Math.min(3.0, wall.stampScale ?? 1.0));
      const rotOffsetRad = ((wall.rotationOffsetDeg ?? 0) * Math.PI) / 180;

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

        // Collect door openings on this segment
        const localCutouts: { startLocal: number; endLocal: number; opening: WallOpeningNode }[] = [];
        for (const op of wall.openings) {
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
          cursor = Math.max(cursor, cut.endLocal);
        }
        if (1 - cursor > 0.03) {
          solidSpans.push([cursor, 1]);
        }

        const angleY = -Math.atan2(dz, dx);
        const ux = dx / totalLen;
        const uz = dz / totalLen;

        for (let sIdx = 0; sIdx < solidSpans.length; sIdx++) {
          const [s0, s1] = solidSpans[sIdx];
          const rawSpanLen = (s1 - s0) * totalLen;
          // Extend ends at wall corners so 90-degree connections interlock flush with zero outside notch
          const startCornerExt =
            s0 <= 0.01 ? wallEndExtension(a, [ux, uz], wall, walls,
              wall.thicknessMeters * (0.48 + overlapFrac * 0.65)) : 0;
          const endCornerExt =
            s1 >= 0.99 ? wallEndExtension(b, [ux, uz], wall, walls,
              wall.thicknessMeters * (0.48 + overlapFrac * 0.65)) : 0;
          const spanStartX = a[0] + dx * s0 - ux * startCornerExt;
          const spanStartZ = a[1] + dz * s0 - uz * startCornerExt;
          const extendedSpanLen = rawSpanLen + startCornerExt + endCornerExt;
          if (extendedSpanLen < 0.03) continue;

          const wallMeta = {
            lwNodeName: `lw-wall-${wall.id}`,
            lwKind: 'wall' as const,
            lwEntityId: wall.id,
          };

          if (wallTpl) {
            const baseStampLen = 3.0 * stampScale;
            const stepLen = Math.max(1.2, baseStampLen * (1 - overlapFrac * 0.45));
            const stampCount = Math.min(
              18,
              Math.max(1, Math.round(extendedSpanLen / stepLen)),
            );
            const subStep = extendedSpanLen / stampCount;
            const pieceWidth = subStep * (1 + Math.max(0, overlapFrac * 0.75));
            const pieceDepth = wall.thicknessMeters * stampScale * (1 + Math.max(0, overlapFrac * 0.35));

            for (let k = 0; k < stampCount; k++) {
              const distAlong = (k + 0.5) * subStep;
              const px = spanStartX + ux * distAlong;
              const pz = spanStartZ + uz * distAlong;
              const py0 = TerrainMeshBuilder.sampleElevationAt(
                scene,
                px - ux * (subStep * 0.4),
                pz - uz * (subStep * 0.4),
              );
              const pyMid = TerrainMeshBuilder.sampleElevationAt(scene, px, pz);
              const py1 = TerrainMeshBuilder.sampleElevationAt(
                scene,
                px + ux * (subStep * 0.4),
                pz + uz * (subStep * 0.4),
              );
              const minGroundY = Math.min(py0, pyMid, py1);
              const maxGroundY = Math.max(py0, pyMid, py1);
              const terrainDrop = maxGroundY - minGroundY;
              const smoothing = wall.terrainSmoothing ?? 75;
              const ground = smoothing > 0 ? wallGroundAt(scene, px, pz, smoothing) : minGroundY;
              const pieceHeight = height * stampScale + (smoothing > 0 ? 0.18 : terrainDrop);

              const inst = GlbModelCache.instantiateClone(
                scene,
                wallTpl,
                `lw-wall-node-${wall.id}-${i}-${sIdx}-${k}`,
                pieceWidth,
                pieceHeight,
                pieceDepth,
                false,
                false,
                wallMeta,
                wall.colorHex ? { colorHex: wall.colorHex } : undefined,
              );
              inst.position.set(px, ground + offsetY - (smoothing > 0 ? 0.18 : 0), pz);
              inst.rotation.y = angleY + rotOffsetRad;
              fitWallStamp(scene, inst, [spanStartX, spanStartZ], [ux, uz],
                extendedSpanLen, ground, smoothing);
              meshCount++;
            }
          } else {
            const bx = spanStartX + ux * (extendedSpanLen * 0.5);
            const bz = spanStartZ + uz * (extendedSpanLen * 0.5);
            const yStart = TerrainMeshBuilder.sampleElevationAt(scene, a[0] + dx * s0, a[1] + dz * s0);
            const yMid = TerrainMeshBuilder.sampleElevationAt(scene, bx, bz);
            const yEnd = TerrainMeshBuilder.sampleElevationAt(scene, a[0] + dx * s1, a[1] + dz * s1);
            const minGroundY = Math.min(yStart, yMid, yEnd) - 0.35;
            const maxGroundY = Math.max(yStart, yMid, yEnd);
            const effectiveHeight = (maxGroundY + height - minGroundY) * stampScale;

            const segMesh = MeshBuilder.CreateBox(
              `lw-wall-${wall.id}-seg-${i}-${sIdx}`,
              {
                width: extendedSpanLen,
                height: effectiveHeight,
                depth: wall.thicknessMeters * stampScale,
              },
              scene,
            );
            segMesh.position.set(bx, minGroundY + effectiveHeight / 2 + offsetY, bz);
            segMesh.rotation.y = angleY + rotOffsetRad;
            segMesh.material = mat;
            segMesh.receiveShadows = true;
            segMesh.metadata = wallMeta;
            meshCount++;
          }
        }

        // Render lintel above each door cutout and place the independently selectable 3D Door asset
        for (const cut of localCutouts) {
          const op = cut.opening;
          if (hideSecrets && op.isSecret && !op.isRevealedToPlayers) continue;

          const tCenter = (cut.startLocal + cut.endLocal) * 0.5;
          const doorX = a[0] + dx * tCenter;
          const doorZ = a[1] + dz * tCenter;
          const groundY = TerrainMeshBuilder.sampleElevationAt(scene, doorX, doorZ);
          const doorH = op.heightMeters ?? Math.min(height * 0.85, 2.6);

          if (height - doorH > 0.25) {
            const lintelH = height - doorH;
            const lintel = MeshBuilder.CreateBox(
              `lw-wall-${wall.id}-lintel-${op.id}`,
              {
                width: op.widthMeters + 0.12,
                height: lintelH,
                depth: wall.thicknessMeters,
              },
              scene,
            );
            lintel.position.set(doorX, groundY + doorH + lintelH / 2 + offsetY, doorZ);
            lintel.rotation.y = angleY;
            lintel.material = mat;
            lintel.metadata = {
              lwNodeName: `lw-wall-${wall.id}`,
              lwKind: 'wall',
              lwEntityId: wall.id,
            };
          }

          const doorModelUrl = op.modelUrl || '/assets/object-library/models/obj-89c62a2b01238531.glb';
          const doorTpl = GlbModelCache.getOrLoadTemplate(scene, doorModelUrl, onGlbLoaded);
          const doorMeta = {
            lwNodeName: `lw-door-${op.id}`,
            lwKind: 'door' as const,
            lwEntityId: op.id,
            lwWallId: wall.id,
          };

          if (doorTpl) {
            const doorInst = GlbModelCache.instantiateClone(
              scene,
              doorTpl,
              `lw-door-node-${op.id}`,
              op.widthMeters + 0.06,
              doorH + 0.03,
              wall.thicknessMeters * stampScale * 1.08,
              false,
              false,
              doorMeta,
            );
            doorInst.position.set(doorX, groundY + offsetY - 0.015, doorZ);
            doorInst.rotation.y = angleY + (op.isOpen ? Math.PI * 0.42 : 0);
            meshCount++;
          } else {
            const doorMesh = MeshBuilder.CreateBox(
              `lw-door-${op.id}`,
              {
                width: op.widthMeters,
                height: doorH,
                depth: wall.thicknessMeters * stampScale * 1.08,
              },
              scene,
            );
            doorMesh.position.set(doorX, groundY + offsetY + doorH / 2, doorZ);
            doorMesh.rotation.y = angleY + (op.isOpen ? Math.PI * 0.42 : 0);
            doorMesh.material = mat;
            doorMesh.metadata = doorMeta;
            meshCount++;
          }
        }
      }
    }

    WallSurfacePaint.replay(scene, walls);
    return meshCount;
  }

  /**
   * Renders the single-stamp hover ghost before the 1st click of the Wall tool,
   * anchored at the snapped grid/corner vertex `(gx, gz)` and rotated by `previewAngleY`
   * so the user sees the exact 90-degree corner snap or grid alignment before clicking.
   */
  static renderHoverWallStampPreview(
    scene: Scene,
    gx: number,
    gz: number,
    previewAngleY: number,
    modelUrl: string | undefined,
    heightMeters: number,
    thicknessMeters: number,
    offsetY = -0.06,
    stampScale = 1.0,
    rotationOffsetDeg = 0,
  ): void {
    const groundY = TerrainMeshBuilder.sampleElevationAt(scene, gx, gz);
    const step = TerrainMeshBuilder.getCellStepMeters() * 0.24;
    const pts = [
      new Vector3(gx - step, groundY + 0.08, gz - step),
      new Vector3(gx + step, groundY + 0.08, gz - step),
      new Vector3(gx + step, groundY + 0.08, gz + step),
      new Vector3(gx - step, groundY + 0.08, gz + step),
      new Vector3(gx - step, groundY + 0.08, gz - step),
    ];
    const anchorBox = MeshBuilder.CreateLines('lw-ghost-wall-anchor', { points: pts }, scene);
    anchorBox.color = Color3.FromHexString('#49e892');
    anchorBox.isPickable = false;

    const totalRotY = previewAngleY + ((rotationOffsetDeg ?? 0) * Math.PI) / 180;
    const segLen = 3.0 * stampScale;
    const ux = Math.cos(-totalRotY);
    const uz = Math.sin(-totalRotY);
    const midX = gx + ux * (segLen * 0.5);
    const midZ = gz + uz * (segLen * 0.5);
    const midY = TerrainMeshBuilder.sampleElevationAt(scene, midX, midZ);

    if (modelUrl) {
      const tpl = GlbModelCache.getOrLoadTemplate(scene, modelUrl);
      if (tpl) {
        const inst = GlbModelCache.instantiateClone(
          scene,
          tpl,
          'lw-ghost-wall-hover-stamp',
          segLen,
          heightMeters * stampScale,
          thicknessMeters * stampScale,
          false,
          true,
        );
        inst.position.set(midX, midY + offsetY, midZ);
        inst.rotation.y = totalRotY;
        return;
      }
    }

    const box = MeshBuilder.CreateBox(
      'lw-ghost-wall-hover-box',
      {
        width: segLen,
        height: heightMeters * stampScale,
        depth: thicknessMeters * stampScale,
      },
      scene,
    );
    box.position.set(midX, midY + (heightMeters * stampScale) / 2 + offsetY, midZ);
    box.rotation.y = totalRotY;
    box.material = this.getSharedGhostWallMat(scene);
    box.isPickable = false;
  }

  static renderGhostWallPreview(
    scene: Scene,
    drawMode: WallDrawMode,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    heightMeters: number,
    thicknessMeters: number,
    freehandPoints?: readonly (readonly [number, number])[],
    snapToGrid = true,
  ): void {
    scene.meshes
      .filter((m) => m.name.startsWith('lw-ghost-wall-'))
      .forEach((m) => m.dispose(false, false));

    const pts = this.buildShapePoints(
      drawMode,
      startX,
      startZ,
      endX,
      endZ,
      freehandPoints,
      snapToGrid,
    );
    if (pts.length < 2) return;

    const closed = drawMode !== 'line' && drawMode !== 'freehand';
    const mat = this.getSharedGhostWallMat(scene);

    const segCount = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const totalLen = Math.hypot(dx, dz);
      if (totalLen < 0.05) continue;

      const angleY = -Math.atan2(dz, dx);
      const bx = (a[0] + b[0]) * 0.5;
      const bz = (a[1] + b[1]) * 0.5;
      const y0 = TerrainMeshBuilder.sampleElevationAt(scene, a[0], a[1]);
      const yMid = TerrainMeshBuilder.sampleElevationAt(scene, bx, bz);
      const y1 = TerrainMeshBuilder.sampleElevationAt(scene, b[0], b[1]);
      const minGroundY = Math.min(y0, yMid, y1) - 0.35;
      const maxGroundY = Math.max(y0, yMid, y1);
      const effectiveH = maxGroundY + heightMeters - minGroundY;

      const mesh = MeshBuilder.CreateBox(
        `lw-ghost-wall-seg-${i}`,
        { width: totalLen + thicknessMeters * 0.48, height: effectiveH, depth: thicknessMeters },
        scene,
      );
      mesh.position.set(bx, minGroundY + effectiveH / 2, bz);
      mesh.rotation.y = angleY;
      mesh.material = mat;
      mesh.isPickable = false;
    }
  }
}
