import {
  AbstractMesh,
  Observer,
  PointerEventTypes,
  PointerInfo,
  Scene,
} from '@babylonjs/core';
import { snapToFiveFootGrid } from '../../arcane-screen/engine/vtt-los-and-grid.engine';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';

export interface TokenPlacement {
  readonly key: string;
  readonly x: number;
  readonly z: number;
}

export interface TokenRightClickEvent {
  readonly key: string;
  readonly clientX: number;
  readonly clientY: number;
}

export interface TokenDragHandlers {
  onDragStart(): void;
  onDragEnd(): void;
  canStartTokenDrag?(key: string, evt: PointerEvent): boolean;
  onTokenSelected?(key: string, shiftKey: boolean, ctrlKey?: boolean): void;
  onGroundClicked?(point: { x: number; z: number }, evt: PointerEvent): void;
  onTokenRightClicked?(event: TokenRightClickEvent): void;
  onDragged(placement: TokenPlacement): void;
  onDropped(placement: TokenPlacement): void;
}

interface ActiveDrag {
  readonly key: string;
  readonly startX: number;
  readonly startZ: number;
  readonly downTimeMs: number;
  x: number;
  z: number;
  velX: number;
  velZ: number;
  lifted: boolean;
  liftProgress: number;
}

interface SettlingToken {
  readonly key: string;
  readonly startMs: number;
  readonly fromLiftY: number;
  readonly fromRotX: number;
  readonly fromRotZ: number;
  readonly wobbleAxisAngle: number;
}

const HOLD_TO_LIFT_MS = 140;
const LIFT_HEIGHT_WORLD = 0.44;
const TILT_20_DEG_RAD = (20 * Math.PI) / 180; // ~0.349066 rad (20 degrees)
const DROP_FALL_MS = 105;
const WOBBLE_DURATION_MS = 560;

export function sampleTokenFootprintElevation(
  scene: Scene,
  x: number,
  z: number,
  radius: number = 0.34,
): number {
  const c = TerrainMeshBuilder.sampleElevationAt(scene, x, z);
  const n = TerrainMeshBuilder.sampleElevationAt(scene, x, z - radius);
  const s = TerrainMeshBuilder.sampleElevationAt(scene, x, z + radius);
  const e = TerrainMeshBuilder.sampleElevationAt(scene, x + radius, z);
  const w = TerrainMeshBuilder.sampleElevationAt(scene, x - radius, z);
  return Math.max(c, n, s, e, w);
}

/**
 * Selects, right-clicks, and drags token meshes across the flat ground plane or sculpted 3D terrain.
 * When clicked and held (or dragged), lifts the token off the board, tilts it ~20 degrees, and
 * wobbles naturally upon drop before settling flat.
 */
export class TokenDragController {
  private active: ActiveDrag | null = null;
  private observer: Observer<PointerInfo> | null = null;
  private renderObserver: Observer<Scene> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly settlingTokens = new Map<string, SettlingToken>();
  private downClientX = 0;
  private downClientY = 0;
  private downHadToken = false;

  constructor(
    private readonly scene: Scene,
    private readonly ground: AbstractMesh,
    private readonly handlers: TokenDragHandlers,
  ) {}

  isDragging(): boolean {
    return this.active !== null;
  }

  attach(): void {
    this.detach();
    this.observer = this.scene.onPointerObservable.add(
      (info) => {
        if (info.type === PointerEventTypes.POINTERDOWN) this.handlePointerDown(info);
        else if (info.type === PointerEventTypes.POINTERMOVE) this.handlePointerMove(info);
        else if (info.type === PointerEventTypes.POINTERUP) this.handlePointerUp(info);
      },
      undefined,
      true,
    );
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.stepLiftAndWobbleAnimations();
    });
  }

  detach(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.observer) {
      this.scene.onPointerObservable.remove(this.observer);
      this.observer = null;
    }
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    this.settlingTokens.clear();
    this.active = null;
  }

  private pickTokenKey(evt?: PointerEvent): string | null {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    const rect = canvas?.getBoundingClientRect();
    const cx = evt && rect ? evt.clientX - rect.left : this.scene.pointerX;
    const cy = evt && rect ? evt.clientY - rect.top : this.scene.pointerY;
    const pick = this.scene.pick(
      cx,
      cy,
      (mesh) => mesh.isPickable && typeof mesh.metadata?.tokenKey === 'string',
    );
    if (pick?.hit && typeof pick.pickedMesh?.metadata?.tokenKey === 'string') {
      return pick.pickedMesh.metadata.tokenKey;
    }
    const gPick = this.scene.pick(
      cx,
      cy,
      (mesh) => mesh === this.ground || mesh.name === 'lw-terrain-ground',
    );
    if (gPick?.hit && gPick.pickedPoint) {
      let bestKey: string | null = null;
      let bestDist = 0.78;
      for (const m of this.scene.meshes) {
        if (
          !m.isPickable ||
          !m.name.startsWith('lw-token-') ||
          m.name.startsWith('lw-token-hitbox-') ||
          m.name.startsWith('lw-token-puck-') ||
          m.name.startsWith('lw-token-part-')
        ) {
          continue;
        }
        const tk = m.metadata?.tokenKey as string | undefined;
        if (!tk) continue;
        const d = Math.hypot(gPick.pickedPoint.x - m.position.x, gPick.pickedPoint.z - m.position.z);
        if (d <= bestDist) {
          bestDist = d;
          bestKey = tk;
        }
      }
      return bestKey;
    }
    return null;
  }

  private handlePointerDown(info: PointerInfo): void {
    const evt = info.event as PointerEvent;
    this.downClientX = evt.clientX;
    this.downClientY = evt.clientY;
    this.downHadToken = false;
    if (evt.button === 2) return;
    const key =
      (typeof info.pickInfo?.pickedMesh?.metadata?.tokenKey === 'string'
        ? (info.pickInfo.pickedMesh.metadata.tokenKey as string)
        : null) ?? this.pickTokenKey(evt);

    if (evt.button !== 0 || !key) return;
    this.downHadToken = true;

    this.handlers.onTokenSelected?.(
      key,
      evt.shiftKey === true,
      evt.ctrlKey === true || evt.metaKey === true,
    );

    if (this.handlers.canStartTokenDrag && !this.handlers.canStartTokenDrag(key, evt)) {
      return;
    }

    const mesh = this.scene.getMeshByName(`lw-token-${key}`);
    if (!mesh) return;
    this.settlingTokens.delete(key);
    this.active = {
      key,
      startX: mesh.position.x,
      startZ: mesh.position.z,
      downTimeMs: performance.now(),
      x: mesh.position.x,
      z: mesh.position.z,
      velX: 0,
      velZ: 0,
      lifted: false,
      liftProgress: 0,
    };
    if (this.holdTimer !== null) clearTimeout(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      if (this.active && this.active.key === key) {
        this.activateTokenLift(this.active);
      }
    }, HOLD_TO_LIFT_MS);
    this.handlers.onDragStart();
  }

  private activateTokenLift(drag: ActiveDrag): void {
    if (drag.lifted) return;
    drag.lifted = true;
    const tokenMesh = this.scene.getMeshByName(`lw-token-${drag.key}`);
    if (tokenMesh) {
      tokenMesh.metadata = { ...(tokenMesh.metadata ?? {}), isLiftedOrWobbling: true };
    }
  }

  private handlePointerMove(info: PointerInfo): void {
    const drag = this.active;
    if (!drag) return;
    const evt = info.event as PointerEvent | undefined;
    if (!drag.lifted && evt) {
      const distPx = Math.hypot(evt.clientX - this.downClientX, evt.clientY - this.downClientY);
      if (distPx >= 4) {
        this.activateTokenLift(drag);
      }
    }
    const point = this.groundPoint();
    if (!point) return;
    const snapped = snapToFiveFootGrid(point);
    if (snapped.x === drag.x && snapped.z === drag.z) return;
    this.activateTokenLift(drag);
    const dx = snapped.x - drag.x;
    const dz = snapped.z - drag.z;
    drag.velX = drag.velX * 0.45 + Math.max(-1, Math.min(1, dx)) * 0.55;
    drag.velZ = drag.velZ * 0.45 + Math.max(-1, Math.min(1, dz)) * 0.55;
    drag.x = snapped.x;
    drag.z = snapped.z;
    this.placeMeshes(drag.key, snapped.x, snapped.z);
    this.handlers.onDragged({ key: drag.key, x: snapped.x, z: snapped.z });
  }

  private handlePointerUp(info: PointerInfo): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    const evt = info.event as PointerEvent;
    const drag = this.active;
    if (!drag) {
      if (evt.button === 0 && !this.downHadToken && this.handlers.onGroundClicked) {
        const distPx = Math.hypot(evt.clientX - this.downClientX, evt.clientY - this.downClientY);
        if (distPx <= 8) {
          const pt = this.groundPoint();
          if (pt) this.handlers.onGroundClicked(pt, evt);
        }
      }
      return;
    }
    this.active = null;
    this.handlers.onDragEnd();

    if (drag.lifted || drag.liftProgress > 0.05) {
      const tokenMesh = this.scene.getMeshByName(`lw-token-${drag.key}`);
      const axisAngle =
        Math.hypot(drag.velX, drag.velZ) > 0.05
          ? Math.atan2(drag.velZ, drag.velX)
          : Math.PI * 0.22;
      this.settlingTokens.set(drag.key, {
        key: drag.key,
        startMs: performance.now(),
        fromLiftY: Math.max(0.14, drag.liftProgress * LIFT_HEIGHT_WORLD),
        fromRotX: tokenMesh?.rotation.x ?? TILT_20_DEG_RAD * 0.85,
        fromRotZ: tokenMesh?.rotation.z ?? -TILT_20_DEG_RAD * 0.5,
        wobbleAxisAngle: axisAngle,
      });
    }

    if (Math.abs(drag.x - drag.startX) < 0.001 && Math.abs(drag.z - drag.startZ) < 0.001) return;
    this.handlers.onDropped({ key: drag.key, x: drag.x, z: drag.z });
  }

  private stepLiftAndWobbleAnimations(): void {
    const now = performance.now();

    // 1. Animate active click-and-hold lifted token (smooth lift + 20-degree tilt)
    if (this.active && this.active.lifted) {
      const drag = this.active;
      drag.liftProgress = Math.min(1, drag.liftProgress + 0.16);
      drag.velX *= 0.88;
      drag.velZ *= 0.88;
      const ease = 1 - Math.pow(1 - drag.liftProgress, 3);
      const tokenMesh = this.scene.getMeshByName(`lw-token-${drag.key}`);
      if (tokenMesh) {
        const radius =
          typeof tokenMesh.metadata?.footprintRadius === 'number'
            ? tokenMesh.metadata.footprintRadius
            : 0.34;
        const baseHeight =
          typeof tokenMesh.metadata?.baseHeight === 'number' ? tokenMesh.metadata.baseHeight : 0.06;
        const groundY = sampleTokenFootprintElevation(this.scene, drag.x, drag.z, radius);
        const hoverBob = Math.sin(now * 0.007) * 0.022 * ease;
        tokenMesh.position.set(
          drag.x,
          groundY + baseHeight / 2 + 0.01 + LIFT_HEIGHT_WORLD * ease + hoverBob,
          drag.z,
        );
        // 20-degree board-piece tilt (pitched toward camera + slight roll/bank with drag velocity)
        const targetRotX = (TILT_20_DEG_RAD * 0.88 + drag.velZ * 0.14) * ease;
        const targetRotZ = (-TILT_20_DEG_RAD * 0.46 - drag.velX * 0.14) * ease;
        tokenMesh.rotation.x += (targetRotX - tokenMesh.rotation.x) * 0.28;
        tokenMesh.rotation.z += (targetRotZ - tokenMesh.rotation.z) * 0.28;
      }
    }

    // 2. Animate dropped tokens falling to the board and wobbling naturally on their base rim
    if (this.settlingTokens.size === 0) return;
    for (const [key, st] of this.settlingTokens.entries()) {
      const tokenMesh = this.scene.getMeshByName(`lw-token-${key}`);
      if (!tokenMesh || tokenMesh.isDisposed()) {
        this.settlingTokens.delete(key);
        continue;
      }
      const radius =
        typeof tokenMesh.metadata?.footprintRadius === 'number'
          ? tokenMesh.metadata.footprintRadius
          : 0.34;
      const baseHeight =
        typeof tokenMesh.metadata?.baseHeight === 'number' ? tokenMesh.metadata.baseHeight : 0.06;
      const groundY = sampleTokenFootprintElevation(
        this.scene,
        tokenMesh.position.x,
        tokenMesh.position.z,
        radius,
      );
      const baseRestY = groundY + baseHeight / 2 + 0.01;
      const elapsed = now - st.startMs;

      if (elapsed < DROP_FALL_MS) {
        const u = Math.max(0, Math.min(1, elapsed / DROP_FALL_MS));
        const dropFrac = 1 - u * u;
        tokenMesh.position.y = baseRestY + st.fromLiftY * dropFrac;
        tokenMesh.rotation.x = st.fromRotX * (1 - u * 0.45);
        tokenMesh.rotation.z = st.fromRotZ * (1 - u * 0.45);
      } else if (elapsed < DROP_FALL_MS + WOBBLE_DURATION_MS) {
        const wt = (elapsed - DROP_FALL_MS) / 1000;
        const decay = Math.exp(-wt * 7.8);
        const phase = wt * 31.0;
        const tiltMag = TILT_20_DEG_RAD * 0.72 * decay * Math.cos(phase);
        const perpMag = TILT_20_DEG_RAD * 0.28 * decay * Math.sin(phase * 1.15);
        const c = Math.cos(st.wobbleAxisAngle);
        const s = Math.sin(st.wobbleAxisAngle);
        const rotX = tiltMag * c - perpMag * s;
        const rotZ = tiltMag * s + perpMag * c;
        // Slight vertical rim-pivot lift so the miniature rocks on its bottom edge instead of clipping the floor
        const rimLift = Math.abs(Math.hypot(rotX, rotZ)) * radius * 0.65;
        tokenMesh.position.y = baseRestY + rimLift;
        tokenMesh.rotation.x = rotX;
        tokenMesh.rotation.z = rotZ;
      } else {
        tokenMesh.position.y = baseRestY;
        tokenMesh.rotation.x = 0;
        tokenMesh.rotation.z = 0;
        tokenMesh.metadata = { ...(tokenMesh.metadata ?? {}), isLiftedOrWobbling: false };
        this.settlingTokens.delete(key);
      }
    }
  }

  private groundPoint(): { x: number; z: number } | null {
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh === this.ground || mesh.name === 'lw-terrain-ground',
    );
    return pick?.hit && pick.pickedPoint
      ? { x: pick.pickedPoint.x, z: pick.pickedPoint.z }
      : null;
  }

  private placeMeshes(key: string, x: number, z: number): void {
    const tokenMesh = this.scene.getMeshByName(`lw-token-${key}`);
    const radius =
      typeof tokenMesh?.metadata?.footprintRadius === 'number'
        ? tokenMesh.metadata.footprintRadius
        : 0.34;
    const groundY = sampleTokenFootprintElevation(this.scene, x, z, radius);
    if (tokenMesh) {
      const baseHeight =
        typeof tokenMesh.metadata?.baseHeight === 'number' ? tokenMesh.metadata.baseHeight : 0.06;
      const liftOffset =
        this.active && this.active.key === key && this.active.lifted
          ? LIFT_HEIGHT_WORLD * (1 - Math.pow(1 - this.active.liftProgress, 3))
          : 0;
      tokenMesh.position.set(x, groundY + baseHeight / 2 + 0.01 + liftOffset, z);
    }
    const reticle = this.scene.getMeshByName(`lw-target-reticle-root-${key}`);
    if (reticle) {
      reticle.position.set(x, groundY + 0.025, z);
    }
  }
}
