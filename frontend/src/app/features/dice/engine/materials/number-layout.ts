import { diceFontFamily } from './dice-fonts';
import { DieFaceLayout, isInsideFace } from '../models/face-layout';
import { buildBabylonDieVertexData } from '../models/chamfer-geometry.builder';
import { DiceModelDefinition, DICE_SIZE_SCALE_MAP, DicePolyhedronType } from '../models/dice-model.types';
import { FACE_VALUES } from '../models/polyhedra-tables.model';
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

/** One physical em size for the entire set, bounded by its smallest printable face. */
const sizeCache = new Map<string, number>();
export function setNumberWorldSize(custom: DiceCustomRuntimeConfig, skin: DiceSkinConfig, model: DiceModelDefinition): number {
  const key = JSON.stringify([custom.fontFamily, custom.fontWeight, custom.fontScale, custom.fontTracking,
    custom.numberStrokeWidth, custom.sizePreset, custom.physics.scale, custom.chamferBevelFactor, model.id,
    skin.fontFamily, document.fonts?.check(`100px ${diceFontFamily(custom.fontFamily || skin.fontFamily)}`)]);
  const cached = sizeCache.get(key);
  if (cached !== undefined) return cached;
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = numberFont(custom, skin, 100);
  const scale = DICE_SIZE_SCALE_MAP[custom.sizePreset] * model.scaleMultiplier * (custom.physics.scale / 5);
  const chamfer = custom.chamferBevelFactor ?? model.chamferFactor;
  const types: DicePolyhedronType[] = ['d6', 'd8', 'd10', 'd12', 'd20', 'd100'];
  const layouts = types.flatMap(type => [...buildBabylonDieVertexData(type, 1.15 * scale, chamfer, model.id === 'model-custom-glb').faceLayouts.values()].map(layout => ({ layout, labels: FACE_VALUES[type].map(value => type === 'd100' ? String(value === 10 ? '00' : value * 10) : type === 'd10' && value === 10 ? '0' : String(value)) })));
  let size = 1.5 * scale;
  // Tracking is measured conservatively in the shared safe area as well as painted consistently.
  const paddingRatio = ((custom.numberStrokeWidth ?? 0) + Math.abs(custom.fontTracking ?? 0)) / 100 + 0.065;
  for (let attempt = 0; attempt < 80; attempt++) {
    const fits = layouts.every(({ layout, labels }) => {
      const candidates = layout.vertexValues ? faceNumberPlacements(layout, '')
        : labels.map(label => ({ label, x: 0.5, y: 0.5, rotation: 0 }));
      return candidates.every(placement => placementFits(ctx, layout, placement, size / layout.unitsPerUv, paddingRatio * size / layout.unitsPerUv));
    });
    if (fits) {
      if (sizeCache.size >= 32) sizeCache.delete(sizeCache.keys().next().value!);
      size *= Math.max(0.2, Math.min(1, (custom.fontScale ?? 1) / 1.4));
      sizeCache.set(key, size); return size;
    }
    size *= 0.95;
  }
  return size;
}
