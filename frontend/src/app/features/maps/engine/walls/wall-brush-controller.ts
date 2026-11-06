import {
  Color3,
  LinesMesh,
  MeshBuilder,
  PointerEventTypes,
  Ray,
  Scene,
  Vector3,
} from '@babylonjs/core';
import type { MapWallSegmentNode } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { WallSurfacePaint } from './wall-surface-paint';
import type { WallBrushSettings, WallPaintDab } from './wall-surface.models';

interface WallBarrierInfo {
  readonly normalX: number;
  readonly normalZ: number;
  readonly originX: number;
  readonly originZ: number;
  readonly halfThickness: number;
}

/**
 * Owns interactive 3D wall & cross-surface (floor -> wall & wall -> floor) brush strokes.
 * Ensures strokes draw on the floor in front of the wall and transition seamlessly up the
 * front face of the wall without ever bleeding through to the back face or floor behind the wall.
 */
export class WallBrushController {
  settings: WallBrushSettings | null = null;
  wallId: string | null = null;
  walls: readonly MapWallSegmentNode[] = [];
  onStroke: (dabs: readonly WallPaintDab[]) => void = () => {};
  private dabs: WallPaintDab[] = [];
  private dragging = false;
  private last: Vector3 | null = null;
  private cursor: LinesMesh | null = null;
  private lastPickTimeMs = 0;
  private lockedBarrier: WallBarrierInfo | null = null;

  clearCursor(): void {
    this.cursor?.dispose();
    this.cursor = null;
  }

  get enabled(): boolean {
    return !!this.wallId && !!this.settings?.active;
  }

  finish(): void {
    this.dragging = false;
    this.last = null;
    this.lockedBarrier = null;
    if (this.dabs.length) {
      this.onStroke(this.dabs);
    }
    this.dabs = [];
  }

  handle(scene: Scene, type: number, event: PointerEvent): boolean {
    if (!this.enabled) return false;
    if (type === PointerEventTypes.POINTERDOWN && event.button === 0) {
      this.dragging = true;
      this.dabs = [];
      this.last = null;
      this.lockedBarrier = null;
      this.lastPickTimeMs = 0;
      this.paint(scene, false);
    } else if (type === PointerEventTypes.POINTERMOVE) {
      const now = performance.now();
      if (now - this.lastPickTimeMs < 14) {
        return true;
      }
      this.lastPickTimeMs = now;
      this.paint(scene, !this.dragging);
    } else if (type === PointerEventTypes.POINTERUP && event.button === 0) {
      this.finish();
    }
    return true;
  }

  private paint(scene: Scene, previewOnly = false): void {
    const settings = this.settings;
    if (!settings || !this.wallId) return;

    const cam = scene.cameraToUseForPointers ?? scene.activeCamera;
    const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, null, cam);

    // IMPORTANT: fastCheck MUST be false so Babylon finds the closest surface to the camera
    // (the front face of the wall) rather than returning mesh[0] (lw-terrain-ground behind the wall).
    const meshHit = scene.pickWithRay(
      ray,
      (mesh) =>
        mesh.isPickable &&
        mesh.isEnabled() &&
        !mesh.name.startsWith('lw-ghost-') &&
        !mesh.name.startsWith('lw-gizmo-') &&
        (mesh.metadata?.lwKind === 'wall' ||
          mesh.metadata?.lwKind === 'door' ||
          mesh.name === 'lw-terrain-ground'),
      false,
    );

    // Also intersect ray against analytical 3D wall prisms so tiny crevices between 3D GLB stones
    // never let the ray slip through the wall onto the floor behind it.
    const obbHit = this.intersectRayWithWallPrisms(scene, ray);

    let point: Vector3 | null = null;
    let normal: Vector3 = Vector3.Up();

    if (meshHit?.hit && meshHit.pickedPoint && meshHit.pickedMesh) {
      const meshDist = Vector3.Distance(ray.origin, meshHit.pickedPoint);
      const isGroundMesh = meshHit.pickedMesh.name === 'lw-terrain-ground';
      if (obbHit && (isGroundMesh ? obbHit.dist <= meshDist + 0.08 : obbHit.dist < meshDist - 0.12)) {
        point = obbHit.point;
        normal = obbHit.normal;
      } else {
        point = meshHit.pickedPoint.clone();
        const pickedNormal = meshHit.getNormal(true, false);
        normal = pickedNormal ? pickedNormal.normalize() : isGroundMesh ? Vector3.Up() : (obbHit?.normal ?? Vector3.Up());
        // Ensure wall normal faces toward the camera ray
        if (!isGroundMesh && Vector3.Dot(normal, ray.direction) > 0) {
          normal = normal.scale(-1);
        }
      }
    } else if (obbHit) {
      point = obbHit.point;
      normal = obbHit.normal;
    }

    if (!point) {
      this.last = null;
      this.clearCursor();
      return;
    }

    const barrier = this.resolveClosestWallBarrier(point.x, point.z, ray.origin);
    if (barrier) {
      // Lock the active camera-facing side of the wall when the stroke begins
      if (!previewOnly && !this.lockedBarrier) {
        this.lockedBarrier = barrier;
      }
      const refBarrier = this.lockedBarrier ?? barrier;
      const signedDist =
        (point.x - refBarrier.originX) * refBarrier.normalX +
        (point.z - refBarrier.originZ) * refBarrier.normalZ;

      // Block hits that land on the back side of the wall or on the floor behind the wall
      if (signedDist < -0.02) {
        return;
      }

      // If hitting a wall face, keep the cursor normal aligned with the front wall face
      if (Math.abs(normal.y) < 0.72) {
        normal = new Vector3(refBarrier.normalX, 0, refBarrier.normalZ).normalize();
      }
    }

    this.showCursor(scene, point, normal, settings);
    if (previewOnly) return;

    const minSpacing = Math.max(0.06, settings.radius * 0.2);
    if (this.last && Vector3.Distance(this.last, point) < minSpacing) {
      return;
    }

    const activeBarrier = barrier
      ? ([
          Math.round(barrier.normalX * 1000) / 1000,
          Math.round(barrier.normalZ * 1000) / 1000,
          Math.round(barrier.originX * 1000) / 1000,
          Math.round(barrier.originZ * 1000) / 1000,
        ] as const)
      : undefined;

    const dab: WallPaintDab = {
      position: [
        Math.round(point.x * 1000) / 1000,
        Math.round(point.y * 1000) / 1000,
        Math.round(point.z * 1000) / 1000,
      ],
      normal: [
        Math.round(normal.x * 1000) / 1000,
        Math.round(normal.y * 1000) / 1000,
        Math.round(normal.z * 1000) / 1000,
      ],
      barrier: activeBarrier,
      radius: settings.radius,
      opacity: settings.opacity,
      hardness: settings.hardness,
      colorHex: settings.colorHex,
    };
    this.last = point.clone();
    this.dabs.push(dab);
    WallSurfacePaint.apply(scene, this.wallId, dab);
  }

  /**
   * Raycasts against the 3D oriented bounding boxes of all walls in the scene so
   * camera rays aimed at a wall always stop on the front face of the wall and never
   * pass through gaps between stones to hit the floor behind the wall.
   */
  private intersectRayWithWallPrisms(
    scene: Scene,
    ray: Ray,
  ): { point: Vector3; normal: Vector3; dist: number } | null {
    if (!this.walls || this.walls.length === 0) return null;
    let bestDist = Infinity;
    let bestPoint: Vector3 | null = null;
    let bestNormal: Vector3 = Vector3.Up();

    const ox = ray.origin.x;
    const oy = ray.origin.y;
    const oz = ray.origin.z;
    const dx = ray.direction.x;
    const dy = ray.direction.y;
    const dz = ray.direction.z;

    for (const wall of this.walls) {
      const pts = wall.points;
      if (pts.length < 2) continue;
      const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';
      const segCount = closed ? pts.length : pts.length - 1;
      const halfThick = Math.max(0.18, wall.thicknessMeters * 0.52);
      const wallH = Math.max(0.5, wall.heightMeters);
      const offsetY = wall.offsetY ?? -0.06;

      for (let i = 0; i < segCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const sdx = b[0] - a[0];
        const sdz = b[1] - a[1];
        const segLen = Math.hypot(sdx, sdz);
        if (segLen < 0.08) continue;

        const ux = sdx / segLen;
        const uz = sdz / segLen;
        const nx = -uz;
        const nz = ux;

        const midX = (a[0] + b[0]) * 0.5;
        const midZ = (a[1] + b[1]) * 0.5;
        const groundY = TerrainMeshBuilder.sampleElevationAt(scene, midX, midZ) + offsetY;
        const minY = groundY - 0.1;
        const maxY = groundY + wallH;

        // Transform ray into segment-local coordinates:
        // localX along segment [0..segLen], localZ perpendicular [-halfThick..+halfThick], localY [minY..maxY]
        const relOx = ox - a[0];
        const relOz = oz - a[1];
        const locOx = relOx * ux + relOz * uz;
        const locOz = relOx * nx + relOz * nz;
        const locDx = dx * ux + dz * uz;
        const locDz = dx * nx + dz * nz;

        let tMin = 0.01;
        let tMax = bestDist;
        let hitNormalLocal = new Vector3(0, 1, 0);

        // X slab [-0.15 .. segLen + 0.15]
        if (Math.abs(locDx) < 1e-6) {
          if (locOx < -0.15 || locOx > segLen + 0.15) continue;
        } else {
          const inv = 1 / locDx;
          let t1 = (-0.15 - locOx) * inv;
          let t2 = (segLen + 0.15 - locOx) * inv;
          let nSign = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            nSign = 1;
          }
          if (t1 > tMin) {
            tMin = t1;
            hitNormalLocal = new Vector3(ux * nSign, 0, uz * nSign);
          }
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) continue;
        }

        // Z slab [-halfThick .. +halfThick]
        if (Math.abs(locDz) < 1e-6) {
          if (locOz < -halfThick || locOz > halfThick) continue;
        } else {
          const inv = 1 / locDz;
          let t1 = (-halfThick - locOz) * inv;
          let t2 = (halfThick - locOz) * inv;
          let nSign = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            nSign = 1;
          }
          if (t1 > tMin) {
            tMin = t1;
            hitNormalLocal = new Vector3(nx * nSign, 0, nz * nSign);
          }
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) continue;
        }

        // Y slab [minY .. maxY]
        if (Math.abs(dy) < 1e-6) {
          if (oy < minY || oy > maxY) continue;
        } else {
          const inv = 1 / dy;
          let t1 = (minY - oy) * inv;
          let t2 = (maxY - oy) * inv;
          let nSign = -1;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
            nSign = 1;
          }
          if (t1 > tMin) {
            tMin = t1;
            hitNormalLocal = new Vector3(0, nSign, 0);
          }
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) continue;
        }

        if (tMin > 0.01 && tMin < bestDist) {
          bestDist = tMin;
          bestPoint = new Vector3(ox + dx * tMin, oy + dy * tMin, oz + dz * tMin);
          bestNormal = hitNormalLocal.normalize();
        }
      }
    }

    return bestPoint ? { point: bestPoint, normal: bestNormal, dist: bestDist } : null;
  }

  private resolveClosestWallBarrier(
    px: number,
    pz: number,
    cameraPos: Vector3,
  ): WallBarrierInfo | null {
    if (!this.walls || this.walls.length === 0) return null;
    let bestDist = Infinity;
    let bestBarrier: WallBarrierInfo | null = null;

    // Prefer the selected wall first if close, otherwise any wall in the scene
    const orderedWalls = this.wallId
      ? [
          ...this.walls.filter((w) => w.id === this.wallId),
          ...this.walls.filter((w) => w.id !== this.wallId),
        ]
      : this.walls;

    for (const wall of orderedWalls) {
      const pts = wall.points;
      if (pts.length < 2) continue;
      const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';
      const segCount = closed ? pts.length : pts.length - 1;
      const halfThickness = Math.max(0.18, wall.thicknessMeters * 0.5);

      for (let i = 0; i < segCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const sdx = b[0] - a[0];
        const sdz = b[1] - a[1];
        const lenSq = sdx * sdx + sdz * sdz;
        if (lenSq < 0.005) continue;

        const t = Math.max(0, Math.min(1, ((px - a[0]) * sdx + (pz - a[1]) * sdz) / lenSq));
        const cx = a[0] + sdx * t;
        const cz = a[1] + sdz * t;
        const dist = Math.hypot(px - cx, pz - cz);

        if (dist < bestDist) {
          bestDist = dist;
          const segLen = Math.sqrt(lenSq);
          const nx = -sdz / segLen;
          const nz = sdx / segLen;
          // Orient barrier normal toward the camera / user's drawing side
          const camDot = (cameraPos.x - cx) * nx + (cameraPos.z - cz) * nz;
          const sign = camDot >= 0 ? 1 : -1;
          bestBarrier = {
            normalX: nx * sign,
            normalZ: nz * sign,
            originX: cx,
            originZ: cz,
            halfThickness,
          };
        }
      }
    }

    return bestBarrier;
  }

  private showCursor(
    scene: Scene,
    point: Vector3,
    normal: Vector3,
    settings: WallBrushSettings,
  ): void {
    const axis = Math.abs(normal.y) > 0.9 ? Vector3.Right() : Vector3.Up();
    const u = Vector3.Cross(normal, axis).normalize();
    const v = Vector3.Cross(normal, u).normalize();
    const centre = point.add(normal.scale(0.032));
    const segs = 32;
    const ring = (radius: number) =>
      Array.from({ length: segs + 1 }, (_, i) => {
        const angle = (i / segs) * Math.PI * 2;
        return centre
          .add(u.scale(Math.cos(angle) * radius))
          .add(v.scale(Math.sin(angle) * radius));
      });
    this.cursor = MeshBuilder.CreateLineSystem(
      'lw-ghost-wall-brush',
      {
        lines: [ring(settings.radius), ring((settings.radius * settings.hardness) / 100)],
        updatable: true,
        instance: this.cursor && !this.cursor.isDisposed() ? this.cursor : undefined,
      },
      scene,
    );
    this.cursor.color = Color3.FromHexString('#49e892');
    this.cursor.isPickable = false;
    this.cursor.renderingGroupId = 1;
  }
}
