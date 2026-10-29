import { PointerEventTypes, Scene } from '@babylonjs/core';
import { LightSourceNode } from '../map-scene-contract';
import { LightFixtureBuilder } from '../lighting/light-fixture.builder';
import { resolveLightSettings } from '../lighting/light-settings';

export interface LightDragHost {
  pickLightId(): string | null;
  pickGround(): { x: number; z: number } | null;
  getLight(id: string): LightSourceNode | undefined;
  isCameraOverride(): boolean;
}

/** Drag-to-move for scene lights in the select tool. Moves the live emitters and commits once on release. */
export class LightDragController {
  enabled = false;
  onStart?: (id: string) => void;
  onEnd?: (id: string, x: number, z: number, moved: boolean) => void;

  private draggingId: string | null = null;
  private grabOffset = { x: 0, z: 0 };
  private last = { x: 0, z: 0 };
  private moved = false;

  attach(scene: Scene, canvas: HTMLCanvasElement, host: LightDragHost): void {
    scene.onPrePointerObservable.add((info) => {
      const evt = info.event as PointerEvent;
      if (info.type === PointerEventTypes.POINTERDOWN) {
        if (!this.enabled || evt.button !== 0 || evt.altKey || host.isCameraOverride()) return;
        const id = host.pickLightId();
        const node = id ? host.getLight(id) : undefined;
        const ground = host.pickGround();
        if (!id || !node || !ground) return;
        this.draggingId = id;
        this.moved = false;
        // The emitter floats above the floor, so keep the grab point instead of snapping to the cursor.
        this.grabOffset = { x: node.x - ground.x, z: node.z - ground.z };
        this.last = { x: node.x, z: node.z };
        try { canvas.setPointerCapture(evt.pointerId); } catch { /* Pointer already released. */ }
        info.skipOnPointerObservable = true;
        this.onStart?.(id);
        return;
      }
      const id = this.draggingId;
      if (!id) return;
      info.skipOnPointerObservable = true;
      if (info.type === PointerEventTypes.POINTERMOVE) {
        const ground = host.pickGround();
        const node = host.getLight(id);
        if (!ground || !node) return;
        const x = ground.x + this.grabOffset.x;
        const z = ground.z + this.grabOffset.z;
        if (x === this.last.x && z === this.last.z) return;
        this.last = { x, z };
        this.moved = true;
        LightFixtureBuilder.moveLight(scene, id, x, z, resolveLightSettings(node).y);
      } else if (info.type === PointerEventTypes.POINTERUP) {
        this.draggingId = null;
        this.onEnd?.(id, this.last.x, this.last.z, this.moved);
      }
    });
  }
}
