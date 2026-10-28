import { Color3, LinesMesh, MeshBuilder, PointerEventTypes, Scene, Vector3 } from '@babylonjs/core';
import { WallSurfacePaint } from './wall-surface-paint';
import type { WallBrushSettings, WallPaintDab } from './wall-surface.models';

/** Owns a single brush stroke; camera overrides remain handled by the stage. */
export class WallBrushController {
  settings: WallBrushSettings | null = null;
  wallId: string | null = null;
  onStroke: (dabs: readonly WallPaintDab[]) => void = () => {};
  private dabs: WallPaintDab[] = [];
  private dragging = false;
  private last: Vector3 | null = null;
  private cursor: LinesMesh | null = null;

  clearCursor(): void { this.cursor?.dispose(); this.cursor = null; }

  get enabled(): boolean { return !!this.wallId && !!this.settings?.active; }

  finish(): void {
    this.dragging = false;
    this.last = null;
    if (this.dabs.length) this.onStroke(this.dabs);
    this.dabs = [];
  }

  handle(scene: Scene, type: number, event: PointerEvent): boolean {
    if (!this.enabled) return false;
    if (type === PointerEventTypes.POINTERDOWN && event.button === 0) {
      this.dragging = true;
      this.dabs = [];
      this.last = null;
      this.paint(scene);
    } else if (type === PointerEventTypes.POINTERMOVE) {
      this.paint(scene, !this.dragging);
    } else if (type === PointerEventTypes.POINTERUP && event.button === 0) {
      this.finish();
    }
    return true;
  }

  private paint(scene: Scene, previewOnly = false): void {
    const settings = this.settings;
    if (!settings || !this.wallId) return;
    // Pick the nearest visible surface first; never paint through an occluding object.
    const hit = scene.pick(scene.pointerX, scene.pointerY, mesh => mesh.isPickable
      && mesh.isEnabled() && !mesh.name.startsWith('lw-ghost-') && !mesh.name.startsWith('lw-gizmo-'));
    if (!hit?.hit || !hit.pickedPoint || hit.pickedMesh?.metadata?.lwKind !== 'wall'
      || hit.pickedMesh.metadata?.lwEntityId !== this.wallId) { this.last = null; this.clearCursor(); return; }
    const normal = hit.getNormal(true, true);
    if (!normal) return;
    const point = hit.pickedPoint;
    this.showCursor(scene, point, normal, settings);
    if (previewOnly) return;
    if (this.last && Vector3.Distance(this.last, point) < settings.radius * 0.18) return;
    const dab: WallPaintDab = {
      position: [point.x, point.y, point.z], normal: [normal.x, normal.y, normal.z],
      radius: settings.radius, opacity: settings.opacity, hardness: settings.hardness,
      colorHex: settings.colorHex,
    };
    this.last = point.clone();
    this.dabs.push(dab);
    WallSurfacePaint.apply(scene, this.wallId, dab);
  }
  private showCursor(scene: Scene, point: Vector3, normal: Vector3, settings: WallBrushSettings): void {
    const axis = Math.abs(normal.y) > .9 ? Vector3.Right() : Vector3.Up();
    const u = Vector3.Cross(normal, axis).normalize(), v = Vector3.Cross(normal, u).normalize();
    const centre = point.add(normal.scale(.025));
    const ring = (radius: number) => Array.from({ length: 49 }, (_, i) => {
      const angle = i / 48 * Math.PI * 2;
      return centre.add(u.scale(Math.cos(angle) * radius)).add(v.scale(Math.sin(angle) * radius));
    });
    this.cursor = MeshBuilder.CreateLineSystem('lw-ghost-wall-brush', {
      lines: [ring(settings.radius), ring(settings.radius * settings.hardness / 100)],
      updatable: true, instance: this.cursor && !this.cursor.isDisposed() ? this.cursor : undefined,
    }, scene);
    this.cursor.color = Color3.FromHexString('#49e892');
    this.cursor.isPickable = false;
    this.cursor.renderingGroupId = 1;
  }
}
