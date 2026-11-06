import {
  Color3,
  LinesMesh,
  MeshBuilder,
  PointerEventTypes,
  Scene,
  Vector3,
} from '@babylonjs/core';
import { WallSurfacePaint } from './wall-surface-paint';
import type { WallBrushSettings, WallPaintDab } from './wall-surface.models';

/**
 * Owns interactive 3D wall & cross-surface (wall -> floor & adjacent walls) brush strokes.
 * Uses throttled GPU raycasting and world-space volumetric shader splats for 60 FPS zero-lag painting.
 */
export class WallBrushController {
  settings: WallBrushSettings | null = null;
  wallId: string | null = null;
  onStroke: (dabs: readonly WallPaintDab[]) => void = () => {};
  private dabs: WallPaintDab[] = [];
  private dragging = false;
  private last: Vector3 | null = null;
  private cursor: LinesMesh | null = null;
  private lastPickTimeMs = 0;

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

    // Pick any wall, door casing, or the floor beneath the wall so grime/moss blends seamlessly
    // across adjacent walls and onto the floor at 60 FPS (fastCheck = true).
    const hit = scene.pick(
      scene.pointerX,
      scene.pointerY,
      (mesh) =>
        mesh.isPickable &&
        mesh.isEnabled() &&
        !mesh.name.startsWith('lw-ghost-') &&
        !mesh.name.startsWith('lw-gizmo-') &&
        (mesh.metadata?.lwKind === 'wall' ||
          mesh.metadata?.lwKind === 'door' ||
          mesh.name === 'lw-terrain-ground'),
      true,
    );

    if (!hit?.hit || !hit.pickedPoint || !hit.pickedMesh) {
      this.last = null;
      this.clearCursor();
      return;
    }

    const normal = hit.getNormal(true, false) ?? Vector3.Up();
    const point = hit.pickedPoint;
    this.showCursor(scene, point, normal, settings);
    if (previewOnly) return;

    const minSpacing = Math.max(0.08, settings.radius * 0.24);
    if (this.last && Vector3.Distance(this.last, point) < minSpacing) {
      return;
    }

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
      radius: settings.radius,
      opacity: settings.opacity,
      hardness: settings.hardness,
      colorHex: settings.colorHex,
    };
    this.last = point.clone();
    this.dabs.push(dab);
    WallSurfacePaint.apply(scene, this.wallId, dab);
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
    const centre = point.add(normal.scale(0.028));
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
