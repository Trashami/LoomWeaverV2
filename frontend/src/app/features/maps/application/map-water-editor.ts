import { signal } from '@angular/core';
import type { MapSceneGraphState } from '../engine/map-scene-contract';
import { DEFAULT_WATER, normalizeWater, WaterSettings } from '../engine/water/water-settings';
import { settingsForWater } from '../engine/water/water-profile';

export class MapWaterEditor {
  readonly settings = signal<WaterSettings>(DEFAULT_WATER);
  readonly selectedId = signal<string | null>(null);
  private drawing = false;
  private activeId: string | null = null;
  private serial = 0;

  constructor(
    private readonly scene: () => MapSceneGraphState,
    private readonly commit: (update: (scene: MapSceneGraphState) => MapSceneGraphState) => void,
    private readonly history: (label: string) => void,
    private readonly ground: (x: number, z: number) => number,
  ) {}

  beginStroke(): void {
    this.finish();
    this.drawing = true;
  }

  select(id: string): void {
    this.finish();
    const water = this.scene().waterSplines.find((w) => w.id === id);
    this.selectedId.set(water?.id ?? null);
    if (water) this.settings.set(settingsForWater(water));
  }

  change(settings: WaterSettings): void {
    const next = normalizeWater(settings);
    this.settings.set(next);
    const splines = this.scene().waterSplines;
    if (splines.length === 0) return;

    const currentSelected = this.selectedId();
    const hasExplicitSelection = Boolean(
      currentSelected && splines.some((w) => w.id === currentSelected),
    );
    const targetId = hasExplicitSelection
      ? currentSelected
      : splines[splines.length - 1].id;

    if (!hasExplicitSelection && targetId) {
      this.selectedId.set(targetId);
    }

    this.history('Adjust water rendering and channel');
    this.commit((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      waterSplines: cur.waterSplines.map((w) => {
        // Update the selected waterbody (or all waterbodies if only 1 exists or none was isolated)
        if (!hasExplicitSelection || cur.waterSplines.length === 1 || w.id === targetId) {
          return {
            ...w,
            name: next.mode === 'pond' ? 'Still pond' : 'River channel',
            settings: next,
            width: next.width,
            flowSpeed: next.mode === 'pond' ? 0 : next.flowSpeed,
            colorHex: next.shallowColor,
          };
        }
        return w;
      }),
    }));
  }

  draw(x: number, z: number): void {
    if (!this.drawing) return;
    const settings = this.settings();
    if (!this.activeId) {
      this.history(
        settings.mode === 'pond' ? 'Create still pond basin' : 'Carve river channel',
      );
      const id = `water-${Date.now()}-${++this.serial}`;
      this.activeId = id;
      this.selectedId.set(id);
      this.commit((cur) => ({
        ...cur,
        revision: cur.revision + 1,
        waterSplines: [
          ...cur.waterSplines,
          {
            id,
            name: settings.mode === 'pond' ? 'Still pond' : 'River channel',
            width: settings.width,
            settings,
            flowSpeed: settings.mode === 'pond' ? 0 : settings.flowSpeed,
            colorHex: settings.shallowColor,
            points: [[x, this.ground(x, z), z]],
          },
        ],
      }));
      return;
    }

    const water = this.scene().waterSplines.find((w) => w.id === this.activeId);
    if (!water) return;

    const last = water.points[water.points.length - 1];
    if (
      Math.hypot(x - last[0], z - last[2]) < Math.max(0.06, settings.width * 0.025) ||
      water.points.length >= 512
    ) {
      return;
    }
    const point: readonly [number, number, number] = [x, this.ground(x, z), z];
    this.commit((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      waterSplines: cur.waterSplines.map((w) =>
        w.id === water.id ? { ...w, points: [...w.points, point] } : w,
      ),
    }));
  }

  finish(): void {
    this.drawing = false;
    const water = this.scene().waterSplines.find((w) => w.id === this.activeId);
    if (water) this.settings.set(settingsForWater(water));
    this.activeId = null;
  }

  removeSelected(): void {
    const id = this.selectedId();
    if (!id) return;
    this.finish();
    this.history('Remove water and restore its channel');
    this.commit((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      waterSplines: cur.waterSplines.filter((w) => w.id !== id),
    }));
    const remaining = this.scene().waterSplines;
    this.selectedId.set(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
  }
}
