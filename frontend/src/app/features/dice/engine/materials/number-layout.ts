import { diceFontFamily } from './dice-fonts';
import { DieFaceLayout, isInsideFace } from '../models/face-layout';
import { DiceModelDefinition, DICE_SIZE_SCALE_MAP } from '../models/dice-model.types';
import { DiceCustomRuntimeConfig, DiceSkinConfig } from '../skins/dice-skin.types';

export interface NumberPlacement { label: string; x: number; y: number; rotation: number; }
export function faceNumberPlacements(layout: DieFaceLayout, label: string): NumberPlacement[] {
  if (!layout.vertexValues) return [{ label, x: 0.5, y: 0.5, rotation: 0 }];
  return layout.polygon.map((vertex, i) => ({
    label: String(layout.vertexValues![i]),
    x: 0.5 + (vertex[0] - 0.5) * 0.55,
    y: 0.5 + (vertex[1] - 0.5) * 0.55,
    rotation: Math.atan2(vertex[1] - 0.5, vertex[0] - 0.5) + Math.PI / 2,
  }));
}

export function numberFont(custom: DiceCustomRuntimeConfig, skin: DiceSkinConfig, pixels: number): string {
  return `${custom.fontWeight || '700'} ${pixels}px ${diceFontFamily(custom.fontFamily || skin.fontFamily || 'Georgia, serif')}`;
}

export function placementFits(ctx: CanvasRenderingContext2D, layout: DieFaceLayout,
  placement: NumberPlacement, fontUv: number, padding: number): boolean {
  const metrics = ctx.measureText(placement.label);
  const width = Math.max(metrics.width, metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) / 100 * fontUv;
  const height = ((metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) || 100) / 100 * fontUv;
  const cos = Math.cos(placement.rotation), sin = Math.sin(placement.rotation);
  for (const x of [-width / 2 - padding, width / 2 + padding]) {
    for (const y of [-height / 2 - padding, height / 2 + padding]) {
      if (!isInsideFace([placement.x + x * cos - y * sin, placement.y + x * sin + y * cos], layout.polygon, 0.012)) return false;
    }
  }
  return true;
}

export function fitFaceNumberSize(ctx: CanvasRenderingContext2D, layout: DieFaceLayout, label: string,
  requested: number, custom: DiceCustomRuntimeConfig): number {
  const placements = faceNumberPlacements(layout, label);
  const padding = ((custom.numberStrokeWidth ?? 0) + Math.abs(custom.fontTracking ?? 0)) / 100 + 0.065;
  let maximum = Math.max(requested, layout.unitsPerUv * 1.5);
  for (let i = 0; i < 80 && !placements.every(p => placementFits(ctx, layout, p,
    maximum / layout.unitsPerUv, padding * maximum / layout.unitsPerUv)); i++) maximum *= 0.95;
  return Math.min(requested, maximum * Math.min(1, 0.5 + (custom.fontScale ?? 1) / 6));
}

/** Shared physical type size; each face only shrinks when its own ink would clip.
 * A wide percentile label must not make every other die unnecessarily tiny. */
export function setNumberWorldSize(custom: DiceCustomRuntimeConfig, skin: DiceSkinConfig, model: DiceModelDefinition): number {
  const scale = DICE_SIZE_SCALE_MAP[custom.sizePreset] * model.scaleMultiplier * (custom.physics.scale / 5);
  return 0.68 * scale * Math.max(0.4, Math.min(3, custom.fontScale ?? 1));
}
