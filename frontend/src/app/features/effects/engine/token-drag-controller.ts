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
  x: number;
  z: number;
}

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
 */
export class TokenDragController {
  private active: ActiveDrag | null = null;
  private observer: Observer<PointerInfo> | null = null;
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
        else if (info.type === PointerEventTypes.POINTERMOVE) this.handlePointerMove();
        else if (info.type === PointerEventTypes.POINTERUP) this.handlePointerUp(info);
      },
      undefined,
      true,
    );
  }

  detach(): void {
    if (this.observer) {
      this.scene.onPointerObservable.remove(this.observer);
      this.observer = null;
    }
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
    this.active = {
      key,
      startX: mesh.position.x,
      startZ: mesh.position.z,
      x: mesh.position.x,
      z: mesh.position.z,
    };
    this.handlers.onDragStart();
  }

  private handlePointerMove(): void {
    const drag = this.active;
    if (!drag) return;
    const point = this.groundPoint();
    if (!point) return;
    const snapped = snapToFiveFootGrid(point);
    if (snapped.x === drag.x && snapped.z === drag.z) return;
    drag.x = snapped.x;
    drag.z = snapped.z;
    this.placeMeshes(drag.key, snapped.x, snapped.z);
    this.handlers.onDragged({ key: drag.key, x: snapped.x, z: snapped.z });
  }

  private handlePointerUp(info: PointerInfo): void {
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
    if (Math.abs(drag.x - drag.startX) < 0.001 && Math.abs(drag.z - drag.startZ) < 0.001) return;
    this.handlers.onDropped({ key: drag.key, x: drag.x, z: drag.z });
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
      tokenMesh.position.set(x, groundY + baseHeight / 2 + 0.01, z);
    }
    const reticle = this.scene.getMeshByName(`lw-target-reticle-root-${key}`);
    if (reticle) {
      reticle.position.set(x, groundY + 0.025, z);
    }
  }
}
