export interface WallBrushSettings {
  readonly active: boolean;
  readonly radius: number;
  readonly opacity: number;
  readonly hardness: number;
  readonly colorHex: string;
}

export const DEFAULT_WALL_BRUSH: WallBrushSettings = {
  active: false, radius: 0.6, opacity: 35, hardness: 35, colorHex: '#4e8c57',
};

export interface WallPaintDab {
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly radius: number;
  readonly opacity: number;
  readonly hardness: number;
  readonly colorHex: string;
}
