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

/**
 * Drag-to-move for reference Tokens and placed 3D/2D Objects in the Map Editor.
 * Moves the live mesh smoothly across terrain, renders a 30ft (6 sq) movement range ring
 * and live movement ruler for Tokens, and commits once on pointer release without rotating the camera.
 */
export class StampDragController {
  enabled = false;
  onStart?: (id: string) => void;
  onMove?: (id: string, x: number, z: number, distFeet: number, distSquares: number) => void;
  onEnd?: (id: string, x: number, z: number, moved: boolean, distFeet: number) => void;

  private draggingId: string | null = null;
  private startPos = { x: 0, z: 0 };
  private last = { x: 0, z: 0 };
  private moved = false;

  attach(scene: Scene, canvas: HTMLCanvasElement, host: StampDragHost): void {
    scene.onPrePointerObservable.add((info) => {
      const evt = info.event as PointerEvent;
      if (info.type === PointerEventTypes.POINTERDOWN) {
        if (!this.enabled || evt.button !== 0 || evt.altKey || host.isCameraOverride()) return;
        const id = host.pickStampId();
        const node = id ? host.getStamp(id) : undefined;
        if (!id || !node) return;
        this.draggingId = id;
        this.moved = false;
        this.startPos = { x: node.x, z: node.z };
        this.last = { x: node.x, z: node.z };
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
        const ground = host.pickGround();
        const node = host.getStamp(id);
        if (!ground || !node) return;
        const x = ground.x;
        const z = ground.z;
        if (Math.abs(x - this.last.x) < 0.01 && Math.abs(z - this.last.z) < 0.01) return;
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
        this.draggingId = null;
        this.clearMovementOverlay(scene);
        const cellMeters = TerrainMeshBuilder.getCellStepMeters();
        const distMeters = Math.hypot(this.last.x - this.startPos.x, this.last.z - this.startPos.z);
        const distFeet = Math.round((distMeters / Math.max(0.1, cellMeters)) * 5);
        this.onEnd?.(id, this.last.x, this.last.z, this.moved, distFeet);
      }
    });
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
