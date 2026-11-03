import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { BASE_GRID_CELL_SVG_PX, setActiveGridCalibration } from '../engine/vtt-los-and-grid.engine';

export type VttMapQuality = 'performance' | 'balanced' | 'visual';

export interface VttMapQualityOption {
  readonly id: VttMapQuality;
  readonly label: string;
  readonly hint: string;
}

export const VTT_MAP_QUALITY_OPTIONS: readonly VttMapQualityOption[] = [
  { id: 'performance', label: 'Performance', hint: 'Low-resolution map art. Best for older hardware and slow connections.' },
  { id: 'balanced', label: 'Balanced', hint: 'Medium-resolution map art. A good default for most devices.' },
  { id: 'visual', label: 'Visual', hint: 'Full-resolution map art for the best look.' },
];

const QUALITY_SUFFIX: Readonly<Record<VttMapQuality, string>> = {
  performance: '-low',
  balanced: '-mid',
  visual: '',
};

const STORAGE_KEY = 'lw.vtt.mapQuality';
const GRID_SCALE_STORAGE_KEY = 'lw.vtt.gridScale';
const GRID_OFFSET_X_STORAGE_KEY = 'lw.vtt.gridOffsetX';
const GRID_OFFSET_Y_STORAGE_KEY = 'lw.vtt.gridOffsetY';

export interface UserVttPreferencesDto {
  readonly mapQuality?: string | null;
  readonly gridScale?: number | null;
  readonly gridOffsetX?: number | null;
  readonly gridOffsetY?: number | null;
}

export function mapVariantUrl(baseUrl: string, suffix: string): string {
  if (!suffix || baseUrl.startsWith('data:') || baseUrl.startsWith('blob:')) return baseUrl;
  return baseUrl.replace(/(\.[a-z0-9]+)(\?.*)?$/i, `${suffix}$1$2`);
}

@Injectable({ providedIn: 'root' })
export class VttDisplaySettingsService {
  private readonly http = inject(HttpClient);

  readonly mapQuality = signal<VttMapQuality>(readStoredQuality());
  readonly gridScale = signal<number>(readStoredNumber(GRID_SCALE_STORAGE_KEY, 1.0, 0.25, 3.0));
  readonly gridOffsetX = signal<number>(readStoredNumber(GRID_OFFSET_X_STORAGE_KEY, 0.0, -200, 200));
  readonly gridOffsetY = signal<number>(readStoredNumber(GRID_OFFSET_Y_STORAGE_KEY, 0.0, -200, 200));
  readonly calibratingGrid = signal<boolean>(false);

  private readonly failedVariants = signal<ReadonlySet<string>>(new Set());
  private readonly probed = new Set<string>();

  constructor() {
    this.syncCalibrationEngine();
    this.loadAccountPreferences();
  }

  loadAccountPreferences(): void {
    if (typeof window === 'undefined') return;
    this.http.get<UserVttPreferencesDto>('/api/v2/auth/preferences').subscribe({
      next: (prefs) => {
        if (!prefs) return;
        const q = (prefs.mapQuality ?? '').toLowerCase();
        if (VTT_MAP_QUALITY_OPTIONS.some((o) => o.id === q)) {
          this.mapQuality.set(q as VttMapQuality);
          writeStorage(STORAGE_KEY, q);
        }
        if (typeof prefs.gridScale === 'number' && prefs.gridScale >= 0.25 && prefs.gridScale <= 3.0) {
          this.gridScale.set(Math.round(prefs.gridScale * 100) / 100);
          writeStorage(GRID_SCALE_STORAGE_KEY, String(this.gridScale()));
        }
        if (typeof prefs.gridOffsetX === 'number' && isFinite(prefs.gridOffsetX)) {
          this.gridOffsetX.set(Math.round(prefs.gridOffsetX * 10) / 10);
          writeStorage(GRID_OFFSET_X_STORAGE_KEY, String(this.gridOffsetX()));
        }
        if (typeof prefs.gridOffsetY === 'number' && isFinite(prefs.gridOffsetY)) {
          this.gridOffsetY.set(Math.round(prefs.gridOffsetY * 10) / 10);
          writeStorage(GRID_OFFSET_Y_STORAGE_KEY, String(this.gridOffsetY()));
        }
        this.syncCalibrationEngine();
      },
      error: () => {
        // Unauthenticated or offline: keep localStorage defaults
      },
    });
  }

  setMapQuality(quality: VttMapQuality): void {
    this.mapQuality.set(quality);
    writeStorage(STORAGE_KEY, quality);
    this.persistAccountPreferences();
  }

  setGridScale(scale: number): void {
    const clamped = Math.max(0.25, Math.min(3.0, Math.round(scale * 100) / 100));
    this.gridScale.set(clamped);
    writeStorage(GRID_SCALE_STORAGE_KEY, clamped.toString());
    this.syncCalibrationEngine();
    this.persistAccountPreferences();
  }

  setGridOffset(offsetX: number, offsetY: number): void {
    const stepPx = BASE_GRID_CELL_SVG_PX * this.gridScale();
    const normX = Math.round((((offsetX % stepPx) + stepPx) % stepPx) * 10) / 10;
    const normY = Math.round((((offsetY % stepPx) + stepPx) % stepPx) * 10) / 10;
    this.gridOffsetX.set(normX);
    this.gridOffsetY.set(normY);
    writeStorage(GRID_OFFSET_X_STORAGE_KEY, normX.toString());
    writeStorage(GRID_OFFSET_Y_STORAGE_KEY, normY.toString());
    this.syncCalibrationEngine();
    this.persistAccountPreferences();
  }

  resetGridCalibration(): void {
    this.gridScale.set(1.0);
    this.gridOffsetX.set(0.0);
    this.gridOffsetY.set(0.0);
    this.calibratingGrid.set(false);
    writeStorage(GRID_SCALE_STORAGE_KEY, '1');
    writeStorage(GRID_OFFSET_X_STORAGE_KEY, '0');
    writeStorage(GRID_OFFSET_Y_STORAGE_KEY, '0');
    this.syncCalibrationEngine();
    this.persistAccountPreferences();
  }

  /**
   * MythWeaver-style "Draw 1 Square" calibration:
   * Given a drawn square in SVG coordinates (x1, y1) -> (x2, y2),
   * extrapolates the grid cell size and phase offsets so the entire table grid aligns to the map.
   */
  applyDrawnSquareCalibration(svgX1: number, svgY1: number, svgX2: number, svgY2: number): void {
    const widthPx = Math.abs(svgX2 - svgX1);
    const heightPx = Math.abs(svgY2 - svgY1);
    const avgCellPx = (widthPx + heightPx) / 2;
    if (avgCellPx < 10) return;

    const newScale = Math.max(0.25, Math.min(3.0, Math.round((avgCellPx / BASE_GRID_CELL_SVG_PX) * 100) / 100));
    const stepPx = BASE_GRID_CELL_SVG_PX * newScale;
    const minX = Math.min(svgX1, svgX2);
    const minY = Math.min(svgY1, svgY2);
    const offsetX = Math.round((((minX % stepPx) + stepPx) % stepPx) * 10) / 10;
    const offsetY = Math.round((((minY % stepPx) + stepPx) % stepPx) * 10) / 10;

    this.gridScale.set(newScale);
    this.gridOffsetX.set(offsetX);
    this.gridOffsetY.set(offsetY);
    this.calibratingGrid.set(false);

    writeStorage(GRID_SCALE_STORAGE_KEY, newScale.toString());
    writeStorage(GRID_OFFSET_X_STORAGE_KEY, offsetX.toString());
    writeStorage(GRID_OFFSET_Y_STORAGE_KEY, offsetY.toString());
    this.syncCalibrationEngine();
    this.persistAccountPreferences();
  }

  /**
   * 3D/2D Babylon world-space "Draw 1 Square" calibration:
   * Given two picked ground corners `p1` and `p2` in Babylon world meters,
   * computes `gridScale` and phase offsets so the 5-foot terrain grid (`1.5m` base on 3D terrain, `1.0m` on flat)
   * matches the drawn square across the entire floor and elevation contours.
   */
  applyDrawnWorldSquareCalibration(
    p1: { x: number; z: number },
    p2: { x: number; z: number },
    is3dTerrain: boolean,
  ): void {
    const dx = Math.abs(p2.x - p1.x);
    const dz = Math.abs(p2.z - p1.z);
    const avgWorldSide = (dx + dz) / 2;
    if (avgWorldSide < 0.2) return;

    const baseMeters = is3dTerrain ? 1.5 : 1.0;
    const newScale = Math.max(0.25, Math.min(3.0, Math.round((avgWorldSide / baseMeters) * 100) / 100));
    const stepWorld = baseMeters * newScale;
    const halfW = is3dTerrain ? 18.0 : 12.0;
    const halfH = is3dTerrain ? 13.5 : 8.0;
    const minX = Math.min(p1.x, p2.x) + halfW;
    const minZ = Math.min(p1.z, p2.z) + halfH;
    const remXWorld = ((minX % stepWorld) + stepWorld) % stepWorld;
    const remZWorld = ((minZ % stepWorld) + stepWorld) % stepWorld;
    const offsetX = Math.round((remXWorld / baseMeters) * BASE_GRID_CELL_SVG_PX * 10) / 10;
    const offsetY = Math.round((remZWorld / baseMeters) * BASE_GRID_CELL_SVG_PX * 10) / 10;

    this.gridScale.set(newScale);
    this.gridOffsetX.set(offsetX);
    this.gridOffsetY.set(offsetY);
    this.calibratingGrid.set(false);

    writeStorage(GRID_SCALE_STORAGE_KEY, newScale.toString());
    writeStorage(GRID_OFFSET_X_STORAGE_KEY, offsetX.toString());
    writeStorage(GRID_OFFSET_Y_STORAGE_KEY, offsetY.toString());
    this.syncCalibrationEngine();
    this.persistAccountPreferences();
  }

  backdropUrl(baseUrl: string | null | undefined): string {
    if (!baseUrl) return '';
    const variant = mapVariantUrl(baseUrl, QUALITY_SUFFIX[this.mapQuality()]);
    if (variant === baseUrl) return baseUrl;
    if (this.failedVariants().has(variant)) return baseUrl;
    this.probe(variant);
    return variant;
  }

  private syncCalibrationEngine(): void {
    setActiveGridCalibration(this.gridScale(), this.gridOffsetX(), this.gridOffsetY());
  }

  private persistAccountPreferences(): void {
    if (typeof window === 'undefined') return;
    const body: UserVttPreferencesDto = {
      mapQuality: this.mapQuality(),
      gridScale: this.gridScale(),
      gridOffsetX: this.gridOffsetX(),
      gridOffsetY: this.gridOffsetY(),
    };
    this.http.put('/api/v2/auth/preferences', body).subscribe({ error: () => {} });
  }

  private probe(url: string): void {
    if (this.probed.has(url) || typeof Image === 'undefined') return;
    this.probed.add(url);
    const img = new Image();
    img.onerror = () => this.failedVariants.update((set) => new Set([...set, url]));
    img.src = url;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable
  }
}

function readStoredQuality(): VttMapQuality {
  try {
    const raw = (localStorage.getItem(STORAGE_KEY) || localStorage.getItem('lw.session.visualMode') || '').toLowerCase();
    return VTT_MAP_QUALITY_OPTIONS.some((o) => o.id === raw) ? (raw as VttMapQuality) : 'balanced';
  } catch {
    return 'balanced';
  }
}

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = parseFloat(localStorage.getItem(key) || String(fallback));
    return isFinite(raw) && raw >= min && raw <= max ? raw : fallback;
  } catch {
    return fallback;
  }
}
