import { DieFaceLayout } from '../models/face-layout';
import { resolveDiceModel } from '../models/dice-model.catalog';
import { faceNumberPlacements, placementFits, numberFont } from './number-layout';
import { drawEngravedLabel } from './number-engraving.drawer';
import { DiceBlendMode } from '../dice-physics.types';
import { DiceCustomRuntimeConfig, DiceSkinConfig } from '../skins/dice-skin.types';
import {
  drawSurfaceBackground,
  drawSurfaceBumpHeight,
  hexWithAlpha,
  shiftColorBrightness
} from './face-patterns.drawer';

export interface FaceCanvasPair {
  diffuseCanvas: HTMLCanvasElement;
  heightCanvas: HTMLCanvasElement;
  emissiveCanvas: HTMLCanvasElement;
}

function mapBlendMode(mode?: DiceBlendMode): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'additive':
      return 'lighter';
    default:
      return 'source-over';
  }
}

export function renderSelectedDiceTexturePreview(
  targetCanvas: HTMLCanvasElement,
  skin: DiceSkinConfig,
  custom: DiceCustomRuntimeConfig
): void {
  const size = targetCanvas.width || 128;
  // This thumbnail previews the material; openwork alpha belongs to the 3D faces.
  const pair = createFaceCanvas('', skin, { ...custom, modelId: 'model-classic-chamfer' }, size);
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(pair.diffuseCanvas, 0, 0, size, size);
}

export function createBevelCanvas(
  skin: DiceSkinConfig,
  custom: DiceCustomRuntimeConfig,
  size = 256
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const coreHex = custom.coreColorHex || skin.baseColor;
  const borderHex = custom.borderColorHex || skin.borderColor || custom.glowColorHex || skin.accentColor;
  const surfaceStyle = custom.surfaceStyleOverride ?? skin.surfaceStyle;

  drawSurfaceBackground(ctx, size, surfaceStyle, shiftColorBrightness(coreHex, -12), borderHex);
  ctx.fillStyle = hexWithAlpha(borderHex, 0.22);
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function createFaceCanvas(
  label: string,
  skin: DiceSkinConfig,
  custom: DiceCustomRuntimeConfig,
  size = 512,
  layout?: DieFaceLayout,
  worldFontSize = 0.3
): FaceCanvasPair {
  const diffuseCanvas = document.createElement('canvas');
  diffuseCanvas.width = size;
  diffuseCanvas.height = size;
  const ctx = diffuseCanvas.getContext('2d')!;

  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = size;
  heightCanvas.height = size;
  const hCtx = heightCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const coreColor = custom.coreColorHex || skin.baseColor;
  const secondaryColor = custom.coreSecondaryColorHex || skin.accentColor;
  const numberColor = custom.numberColorHex || skin.textColor;
  const glowColor = custom.glowColorHex || skin.emissiveColor;
  const borderColor = custom.borderColorHex || skin.borderColor || glowColor;
  const surfaceStyle = custom.surfaceStyleOverride ?? skin.surfaceStyle;

  drawSurfaceBackground(ctx, size, surfaceStyle, coreColor, secondaryColor);

  // Photoshop/After Effects Core Gradient & Blend Mode Layer
  if (custom.coreGradientEnabled) {
    ctx.save();
    ctx.globalCompositeOperation = mapBlendMode(custom.coreBlendMode);
    if (custom.coreGradientType === 'linear') {
      const rad = ((custom.coreGradientAngle ?? 135) * Math.PI) / 180;
      const cx = size * 0.5;
      const dx = Math.cos(rad) * cx;
      const dy = Math.sin(rad) * cx;
      const g = ctx.createLinearGradient(cx - dx, cx - dy, cx + dx, cx + dy);
      g.addColorStop(0, hexWithAlpha(coreColor, 0.85));
      g.addColorStop(1, hexWithAlpha(secondaryColor, 0.75));
      ctx.fillStyle = g;
    } else {
      const g = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.05, size * 0.5, size * 0.5, size * 0.65);
      g.addColorStop(0, hexWithAlpha(secondaryColor, 0.58));
      g.addColorStop(1, hexWithAlpha(coreColor, 0.85));
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  }

  // Initialize Height Canvas + Surface Bump Relief
  hCtx.fillStyle = 'rgb(128,128,128)';
  hCtx.fillRect(0, 0, size, size);
  drawSurfaceBumpHeight(hCtx, size, surfaceStyle, custom.bumpMapIntensity ?? 1.0);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);

  if (resolveDiceModel(custom.modelId).ornament) {
    ctx.clearRect(0, 0, size, size);
    hCtx.fillStyle = 'rgb(128,128,128)'; hCtx.fillRect(0, 0, size, size);
  }

  if (label && layout) paintFaceNumbers({ diffuseCanvas, heightCanvas, emissiveCanvas }, label, layout, worldFontSize, skin, custom);
  return { diffuseCanvas, heightCanvas, emissiveCanvas };
}

export function createD4FaceCanvas(
  layout: DieFaceLayout, skin: DiceSkinConfig, custom: DiceCustomRuntimeConfig,
  size = 512, worldFontSize = 0.3,
): FaceCanvasPair {
  const pair = createFaceCanvas('', skin, custom, size);
  paintFaceNumbers(pair, '', layout, worldFontSize, skin, custom);
  return pair;
}

function paintFaceNumbers(pair: FaceCanvasPair, label: string, layout: DieFaceLayout, worldFontSize: number,
  skin: DiceSkinConfig, custom: DiceCustomRuntimeConfig): void {
  const size = pair.diffuseCanvas.width;
  const contexts = [pair.diffuseCanvas, pair.heightCanvas, pair.emissiveCanvas].map(canvas => canvas.getContext('2d')!);
  for (const ctx of contexts) {
    ctx.save(); ctx.beginPath();
    layout.polygon.forEach(([u, v], i) => i ? ctx.lineTo(u * size, v * size) : ctx.moveTo(u * size, v * size));
    ctx.closePath(); ctx.clip();
  }
  {
    contexts[0].font = numberFont(custom, skin, 100);
    for (let i = 0; i < 80 && !faceNumberPlacements(layout, label).every(p => placementFits(contexts[0], layout, p, worldFontSize / layout.unitsPerUv, worldFontSize / layout.unitsPerUv * (((custom.numberStrokeWidth ?? 0) + Math.abs(custom.fontTracking ?? 0)) / 100 + 0.065))); i++) worldFontSize *= 0.95;
  }
  for (const placement of faceNumberPlacements(layout, label)) {
    drawEngravedLabel(contexts[0], contexts[1], contexts[2], placement.label,
      placement.x * size, placement.y * size, worldFontSize / layout.unitsPerUv * size,
      placement.rotation, skin, custom, custom.numberColorHex || skin.textColor, custom.glowColorHex || skin.emissiveColor);
  }
  contexts.forEach(ctx => ctx.restore());
}
