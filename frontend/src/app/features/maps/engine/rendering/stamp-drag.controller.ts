import { Color3, MeshBuilder, PointerEventTypes, Scene, Vector3 } from '@babylonjs/core';
import { MapStampNode } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { StampSceneBuilder } from './stamp-scene.builder';

export interface StampDragHost {
  pickStampId(): string | null;
  pickGround(): { x: number; z: number } | null;
  getStamp(id: string): MapStampNode | undefined;
  isCameraOverride(): boolean;
}

const HOLD_TO_LIFT_MS = 140;
const LIFT_HEIGHT_WORLD = 0.44;
const TILT_20_DEG_RAD = (20 * Math.PI) / 180;
const DROP_FALL_MS = 105;
const WOBBLE_DURATION_MS = 560;

interface SettlingStampToken {
  readonly id: string;
  readonly startMs: number;
  readonly fromLiftY: number;
  readonly fromRotX: number;
  readonly fromRotZ: number;
  readonly wobbleAxisAngle: number;
}

/**
 * Drag-to-move for reference Tokens and placed 3D/2D Objects in the Map Editor.
 * Moves the live mesh smoothly across terrain, lifts & tilts Tokens 20 degrees when held/dragged,
 * wobbles naturally upon drop, and commits once on pointer release without rotating the camera.
 */
export class StampDragController {
  enabled = false;
  onStart?: (id: string) => void;
  onMove?: (id: string, x: number, z: number, distFeet: number, distSquares: number) => void;
  onEnd?: (id: string, x: number, z: number, moved: boolean, distFeet: number) => void;

  private draggingId: string | null = null;
  private draggingIsToken = false;
  private lifted = false;
  private liftProgress = 0;
  private velX = 0;
  private velZ = 0;
  private downClientX = 0;
  private downClientY = 0;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly settlingTokens = new Map<string, SettlingStampToken>();
  private startPos = { x: 0, z: 0 };
  private last = { x: 0, z: 0 };
  private moved = false;

  attach(scene: Scene, canvas: HTMLCanvasElement, host: StampDragHost): void {
    scene.onBeforeRenderObservable.add(() => {
      this.stepLiftAndWobble(scene, host);
    });

    scene.onPrePointerObservable.add((info) => {
      const evt = info.event as PointerEvent;
      if (info.type === PointerEventTypes.POINTERDOWN) {
        if (!this.enabled || evt.button !== 0 || evt.altKey || host.isCameraOverride()) return;
        const id = host.pickStampId();
        const node = id ? host.getStamp(id) : undefined;
        if (!id || !node) return;
        this.draggingId = id;
        this.draggingIsToken = node.category === 'Token';
        this.lifted = false;
        this.liftProgress = 0;
        this.velX = 0;
        this.velZ = 0;
        this.downClientX = evt.clientX;
        this.downClientY = evt.clientY;
        this.moved = false;
        this.startPos = { x: node.x, z: node.z };
        this.last = { x: node.x, z: node.z };
        this.settlingTokens.delete(id);
        if (this.holdTimer !== null) clearTimeout(this.holdTimer);
        if (this.draggingIsToken) {
          this.holdTimer = setTimeout(() => {
            this.holdTimer = null;
            if (this.draggingId === id) {
              this.activateLift(scene, id);
            }
          }, HOLD_TO_LIFT_MS);
        }
        try {
          canvas.setPointerCapture(evt.pointerId);
        } catch {
          // Pointer already released
        }
        info.skipOnPointerObservable = true;
        this.onStart?.(id);
        if (node.category === 'Token') {
          this.renderMovementOverlay(scene, this.startPos.x, this.startPos.z, node.x, node.z);
        }
        return;
      }

      const id = this.draggingId;
      if (!id) return;
      info.skipOnPointerObservable = true;

      if (info.type === PointerEventTypes.POINTERMOVE) {
        if (this.draggingIsToken && !this.lifted) {
          const distPx = Math.hypot(evt.clientX - this.downClientX, evt.clientY - this.downClientY);
          if (distPx >= 4) {
            this.activateLift(scene, id);
          }
        }
        const ground = host.pickGround();
        const node = host.getStamp(id);
        if (!ground || !node) return;
        const x = ground.x;
        const z = ground.z;
        if (Math.abs(x - this.last.x) < 0.01 && Math.abs(z - this.last.z) < 0.01) return;
        if (this.draggingIsToken) {
          this.activateLift(scene, id);
          const dx = x - this.last.x;
          const dz = z - this.last.z;
          this.velX = this.velX * 0.45 + Math.max(-1, Math.min(1, dx)) * 0.55;
          this.velZ = this.velZ * 0.45 + Math.max(-1, Math.min(1, dz)) * 0.55;
        }
        this.last = { x, z };
        this.moved = true;
        StampSceneBuilder.moveStamp(scene, node, x, z);

        const cellMeters = TerrainMeshBuilder.getCellStepMeters();
        const distMeters = Math.hypot(x - this.startPos.x, z - this.startPos.z);
        const distSquares = distMeters / Math.max(0.1, cellMeters);
        const distFeet = Math.round(distSquares * 5);

        if (node.category === 'Token') {
          this.renderMovementOverlay(scene, this.startPos.x, this.startPos.z, x, z);
        }
        this.onMove?.(id, x, z, distFeet, distSquares);
      } else if (info.type === PointerEventTypes.POINTERUP) {
        if (this.holdTimer !== null) {
          clearTimeout(this.holdTimer);
          this.holdTimer = null;
        }
        if (this.draggingIsToken && (this.lifted || this.liftProgress > 0.05)) {
          const tokenNode = scene.getTransformNodeByName(`lw-stamp-node-${id}`);
          const axisAngle =
            Math.hypot(this.velX, this.velZ) > 0.05
              ? Math.atan2(this.velZ, this.velX)
              : Math.PI * 0.22;
          this.settlingTokens.set(id, {
            id,
            startMs: performance.now(),
            fromLiftY: Math.max(0.14, this.liftProgress * LIFT_HEIGHT_WORLD),
            fromRotX: tokenNode?.rotation.x ?? TILT_20_DEG_RAD * 0.85,
            fromRotZ: tokenNode?.rotation.z ?? -TILT_20_DEG_RAD * 0.5,
            wobbleAxisAngle: axisAngle,
          });
        }
        this.draggingId = null;
        this.draggingIsToken = false;
        this.lifted = false;
        this.clearMovementOverlay(scene);
        const cellMeters = TerrainMeshBuilder.getCellStepMeters();
        const distMeters = Math.hypot(this.last.x - this.startPos.x, this.last.z - this.startPos.z);
        const distFeet = Math.round((distMeters / Math.max(0.1, cellMeters)) * 5);
        this.onEnd?.(id, this.last.x, this.last.z, this.moved, distFeet);
      }
    });
  }

  private activateLift(scene: Scene, id: string): void {
    if (this.lifted) return;
    this.lifted = true;
    const tokenNode = scene.getTransformNodeByName(`lw-stamp-node-${id}`);
    if (tokenNode) {
      tokenNode.metadata = { ...(tokenNode.metadata ?? {}), isLiftedOrWobbling: true };
    }
  }

  private stepLiftAndWobble(scene: Scene, host: StampDragHost): void {
    const now = performance.now();

    if (this.draggingId && this.draggingIsToken && this.lifted) {
      this.liftProgress = Math.min(1, this.liftProgress + 0.16);
      this.velX *= 0.88;
      this.velZ *= 0.88;
      const ease = 1 - Math.pow(1 - this.liftProgress, 3);
      const tokenNode = scene.getTransformNodeByName(`lw-stamp-node-${this.draggingId}`);
      const st = host.getStamp(this.draggingId);
      if (tokenNode && st) {
        const groundY = TerrainMeshBuilder.sampleElevationAt(scene, this.last.x, this.last.z);
        const offsetY = st.placementMode === 'custom' ? (st.offsetY ?? 0) : 0;
        const hoverBob = Math.sin(now * 0.007) * 0.022 * ease;
        tokenNode.position.set(
          this.last.x,
          groundY + offsetY + LIFT_HEIGHT_WORLD * ease + hoverBob,
          this.last.z,
        );
        const targetRotX = (TILT_20_DEG_RAD * 0.88 + this.velZ * 0.14) * ease;
        const targetRotZ = (-TILT_20_DEG_RAD * 0.46 - this.velX * 0.14) * ease;
        tokenNode.rotation.x += (targetRotX - tokenNode.rotation.x) * 0.28;
        tokenNode.rotation.z += (targetRotZ - tokenNode.rotation.z) * 0.28;
      }
    }

    if (this.settlingTokens.size === 0) return;
    for (const [id, s] of this.settlingTokens.entries()) {
      const tokenNode = scene.getTransformNodeByName(`lw-stamp-node-${id}`);
      const st = host.getStamp(id);
      if (!tokenNode || tokenNode.isDisposed() || !st) {
        this.settlingTokens.delete(id);
        continue;
      }
      const groundY = TerrainMeshBuilder.sampleElevationAt(
        scene,
        tokenNode.position.x,
        tokenNode.position.z,
      );
      const offsetY = st.placementMode === 'custom' ? (st.offsetY ?? 0) : 0;
      const baseRestY = groundY + offsetY;
      const elapsed = now - s.startMs;

      if (elapsed < DROP_FALL_MS) {
        const u = Math.max(0, Math.min(1, elapsed / DROP_FALL_MS));
        const dropFrac = 1 - u * u;
        tokenNode.position.y = baseRestY + s.fromLiftY * dropFrac;
        tokenNode.rotation.x = s.fromRotX * (1 - u * 0.45);
        tokenNode.rotation.z = s.fromRotZ * (1 - u * 0.45);
      } else if (elapsed < DROP_FALL_MS + WOBBLE_DURATION_MS) {
        const wt = (elapsed - DROP_FALL_MS) / 1000;
        const decay = Math.exp(-wt * 7.8);
        const phase = wt * 31.0;
        const tiltMag = TILT_20_DEG_RAD * 0.72 * decay * Math.cos(phase);
        const perpMag = TILT_20_DEG_RAD * 0.28 * decay * Math.sin(phase * 1.15);
        const c = Math.cos(s.wobbleAxisAngle);
        const sn = Math.sin(s.wobbleAxisAngle);
        const rotX = tiltMag * c - perpMag * sn;
        const rotZ = tiltMag * sn + perpMag * c;
        const rimLift = Math.abs(Math.hypot(rotX, rotZ)) * 0.28;
        tokenNode.position.y = baseRestY + rimLift;
        tokenNode.rotation.x = rotX;
        tokenNode.rotation.z = rotZ;
      } else {
        tokenNode.position.y = baseRestY;
        tokenNode.rotation.x = 0;
        tokenNode.rotation.z = 0;
        tokenNode.metadata = { ...(tokenNode.metadata ?? {}), isLiftedOrWobbling: false };
        this.settlingTokens.delete(id);
      }
    }
  }

  clearMovementOverlay(scene: Scene): void {
    scene.meshes
      .filter((m) => m.name.startsWith('lw-token-move-'))
      .forEach((m) => m.dispose());
  }

  private renderMovementOverlay(
    scene: Scene,
    startX: number,
    startZ: number,
    curX: number,
    curZ: number,
  ): void {
    this.clearMovementOverlay(scene);
    const cellMeters = TerrainMeshBuilder.getCellStepMeters();
    const moveRangeMeters = cellMeters * 6; // 30 ft = 6 grid squares

    // 1. 30ft Movement Range Ring around starting position
    const ringPts: Vector3[] = [];
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = Math.max(-18, Math.min(18, startX + Math.cos(a) * moveRangeMeters));
      const pz = Math.max(-13.5, Math.min(13.5, startZ + Math.sin(a) * moveRangeMeters));
      const py = TerrainMeshBuilder.sampleElevationAt(scene, px, pz) + 0.08;
      ringPts.push(new Vector3(px, py, pz));
    }
    const rangeRing = MeshBuilder.CreateLines(
      'lw-token-move-range',
      { points: ringPts },
      scene,
    );
    const distMeters = Math.hypot(curX - startX, curZ - startZ);
    rangeRing.color = Color3.FromHexString(
      distMeters <= moveRangeMeters + 0.2 ? '#49e892' : '#d9b77a',
    );
    rangeRing.isPickable = false;

    // 2. Movement path line from start to current position
    if (distMeters > 0.1) {
      const pathPts: Vector3[] = [];
      const segs = Math.max(4, Math.ceil(distMeters / 0.4));
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const lx = startX + (curX - startX) * t;
        const lz = startZ + (curZ - startZ) * t;
        const ly = TerrainMeshBuilder.sampleElevationAt(scene, lx, lz) + 0.12;
        pathPts.push(new Vector3(lx, ly, lz));
      }
      const line = MeshBuilder.CreateLines('lw-token-move-path', { points: pathPts }, scene);
      line.color = Color3.FromHexString(
        distMeters <= moveRangeMeters + 0.2 ? '#49e892' : '#f59e0b',
      );
      line.isPickable = false;
    }
  }
}
