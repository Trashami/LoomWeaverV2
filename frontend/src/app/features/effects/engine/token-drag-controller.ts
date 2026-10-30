import {
  AbstractMesh,
  Observer,
  PointerEventTypes,
  PointerInfo,
  Scene,
} from '@babylonjs/core';
import { snapToFiveFootGrid } from '../../arcane-screen/engine/vtt-los-and-grid.engine';

export interface TokenPlacement {
  readonly key: string;
  readonly x: number;
  readonly z: number;
}

export interface TokenDragHandlers {
  onDragStart(): void;
  onDragEnd(): void;
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

/**
 * Drags token meshes across the ground plane. Positions use the same world units as the 2D SVG
 * (snapped to the shared grid), so 2D and 3D clients agree on where a token stands.
 */
export class TokenDragController {
  private active: ActiveDrag | null = null;
  private observer: Observer<PointerInfo> | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly ground: AbstractMesh,
    private readonly handlers: TokenDragHandlers,
  ) {}

  attach(): void {
    this.detach();
    this.observer = this.scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERDOWN) this.handlePointerDown(info);
      else if (info.type === PointerEventTypes.POINTERMOVE) this.handlePointerMove();
      else if (info.type === PointerEventTypes.POINTERUP) this.handlePointerUp();
    });
  }

  detach(): void {
    if (this.observer) {
      this.scene.onPointerObservable.remove(this.observer);
      this.observer = null;
    }
    this.active = null;
  }

  private handlePointerDown(info: PointerInfo): void {
    if ((info.event as PointerEvent).button !== 0) return;
    const key: unknown = info.pickInfo?.pickedMesh?.metadata?.tokenKey;
    if (typeof key !== 'string') return;
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

  private handlePointerUp(): void {
    const drag = this.active;
    if (!drag) return;
    this.active = null;
    this.handlers.onDragEnd();
    if (drag.x === drag.startX && drag.z === drag.startZ) return;
    this.handlers.onDropped({ key: drag.key, x: drag.x, z: drag.z });
  }

  private groundPoint(): { x: number; z: number } | null {
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh === this.ground,
    );
    return pick?.hit && pick.pickedPoint
      ? { x: pick.pickedPoint.x, z: pick.pickedPoint.z }
      : null;
  }

  private placeMeshes(key: string, x: number, z: number): void {
    for (const name of [`lw-token-${key}`, `lw-target-reticle-root-${key}`]) {
      const mesh = this.scene.getMeshByName(name);
      if (mesh) mesh.position.set(x, mesh.position.y, z);
    }
  }
}
