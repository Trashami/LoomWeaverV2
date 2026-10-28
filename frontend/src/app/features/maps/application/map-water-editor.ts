import { signal } from '@angular/core';
import type { MapSceneGraphState } from '../engine/map-scene-contract';
import { DEFAULT_WATER, normalizeWater, WaterSettings } from '../engine/water/water-settings';
import { settingsForWater } from '../engine/water/water-profile';

export class MapWaterEditor {
  readonly settings = signal<WaterSettings>(DEFAULT_WATER);
  readonly selectedId = signal<string | null>(null);
  private activeId: string | null = null;
  private serial = 0;
  constructor(
    private readonly scene: () => MapSceneGraphState,
    private readonly commit: (update: (scene: MapSceneGraphState) => MapSceneGraphState) => void,
    private readonly history: (label: string) => void,
    private readonly ground: (x: number,z: number) => number,
  ) {}
  select(id: string): void {
    this.finish();
    const water = this.scene().waterSplines.find(w => w.id === id);
    this.selectedId.set(water?.id ?? null);
    if (water) this.settings.set(settingsForWater(water));
  }
  change(settings: WaterSettings): void {
    const next = normalizeWater(settings);
    this.settings.set(next);
    const id = this.selectedId();
    if (!this.scene().waterSplines.some(w => w.id === id)) return;
    this.history('Adjust water rendering and channel');
    this.commit(cur => ({ ...cur, revision: cur.revision+1,
      waterSplines: cur.waterSplines.map(w => w.id === id ? {
        ...w, settings: next, width: next.width, flowSpeed: next.flowSpeed, colorHex: next.shallowColor,
      } : w) }));
  }
  draw(x: number,z: number): void {
    const settings = this.settings();
    if (!this.activeId) {
      this.history(settings.mode === 'pond' ? 'Create still pond and basin' : 'Carve river channel');
      const id = `water-${Date.now()}-${++this.serial}`;
      this.activeId = id; this.selectedId.set(id);
      this.commit(cur => ({ ...cur, revision: cur.revision+1, waterSplines: [...cur.waterSplines, {
        id, name: settings.mode === 'pond' ? 'Still pond' : 'River channel', width: settings.width,
        settings, flowSpeed: settings.flowSpeed, colorHex: settings.shallowColor,
        points: [[x,this.ground(x,z),z]],
      }] }));
      return;
    }
    const water = this.scene().waterSplines.find(w => w.id === this.activeId);
    if (!water) return;
    if (settings.mode === 'pond') {
      const start = water.points[0];
      const width = Math.min(14,Math.max(settings.width,Math.hypot(x-start[0],z-start[2])*2));
      if (Math.abs(width-water.width) < .08) return;
      this.commit(cur => ({ ...cur,revision: cur.revision+1,
        waterSplines: cur.waterSplines.map(w => w.id === water.id ? {
          ...w, width, settings: { ...settings,width },
        } : w) }));
      return;
    }
    const last = water.points[water.points.length-1];
    if (Math.hypot(x-last[0],z-last[2]) < .5 || water.points.length >= 256) return;
    const point: readonly [number,number,number] = [x,this.ground(x,z),z];
    this.commit(cur => ({ ...cur,revision: cur.revision+1,
      waterSplines: cur.waterSplines.map(w => w.id === water.id ? { ...w,points: [...w.points,point] } : w) }));
  }
  finish(): void {
    const water = this.scene().waterSplines.find(w => w.id === this.activeId);
    if (water) this.settings.set(settingsForWater(water));
    this.activeId = null;
  }
  removeSelected(): void {
    const id = this.selectedId();
    if (!id) return;
    this.finish(); this.history('Remove water and restore its channel');
    this.commit(cur => ({ ...cur, revision: cur.revision+1, waterSplines: cur.waterSplines.filter(w => w.id !== id) }));
    this.selectedId.set(null);
  }
}
