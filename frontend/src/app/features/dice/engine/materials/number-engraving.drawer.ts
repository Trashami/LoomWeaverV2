import { DiceBlendMode } from '../dice-physics.types';
import { DiceCustomRuntimeConfig, DiceSkinConfig } from '../skins/dice-skin.types';
import { hexWithAlpha, shiftColorBrightness } from './face-patterns.drawer';
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

export function drawEngravedLabel(
  ctx: CanvasRenderingContext2D,
  hCtx: CanvasRenderingContext2D,
  eCtx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  fontSizePx: number,
  rotationRad: number,
  skin: DiceSkinConfig,
  custom: DiceCustomRuntimeConfig,
  numberColor: string,
  glowColor: string
): void {
  const fontFamily = custom.fontFamily || skin.fontFamily || 'Cinzel, Georgia, serif';
  const fontWeight = custom.fontWeight || '700';
  const fontSpec = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  const depth = custom.numberDepth ?? (custom.recessedNumbers ? -0.75 : 0.65);
  const isRecessed = depth < -0.05;
  const numOpacity = Math.max(0.1, Math.min(1, custom.numberOpacity ?? 1.0));

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotationRad);
  ctx.font = fontSpec;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const target of [ctx, hCtx, eCtx]) {
    if ('letterSpacing' in target) target.letterSpacing = `${(custom.fontTracking ?? 0) * fontSizePx / 100}px`;
  }
  const metrics = ctx.measureText(label);
  const baseline = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  const opticalX = (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
  ctx.globalAlpha = numOpacity;
  ctx.globalCompositeOperation = mapBlendMode(custom.numberBlendMode);


  // Signed bevel: the light/dark lip reverses between carved and raised lettering.
  const relief = Math.abs(depth) * fontSizePx * 0.055;
  if (relief > 0.1) {
    ctx.lineWidth = Math.max(0.5, relief * 0.65);
    ctx.strokeStyle = isRecessed ? 'rgba(0,0,0,0.92)' : 'rgba(255,255,255,0.7)';
    ctx.strokeText(label, opticalX - relief, baseline - relief);
    ctx.strokeStyle = isRecessed ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.92)';
    ctx.strokeText(label, opticalX + relief, baseline + relief);
  }

  // Drop Shadow / Depth Bevel Shadow
  if (custom.numberDropShadowEnabled ?? true) {
    ctx.shadowColor = custom.numberShadowColorHex || (isRecessed ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.45)');
    ctx.shadowOffsetX = custom.numberShadowOffsetX ?? (isRecessed ? -2 : 2);
    ctx.shadowOffsetY = custom.numberShadowOffsetY ?? (isRecessed ? -3 : 3);
    ctx.shadowBlur = custom.numberShadowBlur ?? 5;
  }

  // Number Outer Glow
  if (custom.numberOuterGlowEnabled && (custom.numberOuterGlowOpacity ?? 0) > 0.05) {
    ctx.save();
    ctx.shadowColor = custom.numberOuterGlowColor || glowColor;
    ctx.shadowBlur = Math.max(2, (custom.numberOuterGlowSize ?? 14) * (1 + (custom.numberOuterGlowSpread ?? 0.3)));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = hexWithAlpha(custom.numberOuterGlowColor || glowColor, custom.numberOuterGlowOpacity);
    ctx.fillText(label, opticalX, baseline);
    ctx.restore();
  }

  // Outline Stroke
  const strokeWidth = (custom.numberStrokeWidth ?? skin.textStrokeWidth ?? 0) * fontSizePx / 100;
  if (strokeWidth > 0) {
    ctx.strokeStyle = custom.numberStrokeColorHex || skin.textStrokeColor || '#050806';
    ctx.lineWidth = strokeWidth * 2;
    ctx.lineJoin = 'round';
    ctx.strokeText(label, opticalX, baseline);
  }

  if (Math.abs(depth) > 0.03) {
    const inlay = ctx.createLinearGradient(0, -fontSizePx * 0.5, 0, fontSizePx * 0.5);
    inlay.addColorStop(0, shiftColorBrightness(numberColor, isRecessed ? -85 * Math.abs(depth) : 35 * depth));
    inlay.addColorStop(0.6, numberColor);
    inlay.addColorStop(1, shiftColorBrightness(numberColor, isRecessed ? -45 * Math.abs(depth) : -20 * depth));
    ctx.fillStyle = inlay;
  } else ctx.fillStyle = numberColor;
  ctx.fillText(label, opticalX, baseline);

  // Number Inner Glow
  if (custom.numberInnerGlowEnabled && (custom.numberInnerGlowOpacity ?? 0) > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = hexWithAlpha(custom.numberInnerGlowColor || glowColor, custom.numberInnerGlowOpacity * 0.75 * (1 - Math.abs(depth) * 0.6));
    ctx.shadowColor = custom.numberInnerGlowColor || glowColor;
    ctx.shadowBlur = Math.max(1, custom.numberInnerGlowSize ?? 8);
    ctx.fillText(label, opticalX, baseline);
    ctx.restore();
  }

  // 6/9 Indicator
  const indicator = custom.sixNineIndicator ?? 'dot';
  if ((label === '6' || label === '9') && indicator !== 'none') {
    if (indicator === 'underline') {
      ctx.fillRect(-fontSizePx * 0.18, fontSizePx * 0.42, fontSizePx * 0.36, Math.max(3, fontSizePx * 0.055));
    } else {
      ctx.beginPath();
      ctx.arc(0, fontSizePx * 0.44, Math.max(3, fontSizePx * 0.045), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // Height Map for Number Depth (-1.0 deep carve .. 0.0 flush .. +1.0 raised relief)
  if (Math.abs(depth) > 0.03) {
    hCtx.save();
    hCtx.translate(x, y);
    hCtx.rotate(rotationRad);
    hCtx.font = fontSpec;
    hCtx.textAlign = 'center';
    hCtx.textBaseline = 'alphabetic';
    const heightVal = Math.max(8, Math.min(248, Math.round(128 + depth * 112)));
    hCtx.shadowColor = `rgb(${heightVal},${heightVal},${heightVal})`;
    hCtx.shadowBlur = Math.max(2, Math.round(Math.abs(depth) * 6));
    hCtx.fillStyle = `rgb(${heightVal},${heightVal},${heightVal})`;
    hCtx.fillText(label, opticalX, baseline);
    hCtx.restore();
  }

  // Emissive Map for Number Outer/Inner Glow
  const emisStrength = Math.max(
    custom.glowIntensity ?? 0,
    custom.numberOuterGlowEnabled ? (custom.numberOuterGlowOpacity ?? 0) : 0,
    custom.numberInnerGlowEnabled ? (custom.numberInnerGlowOpacity ?? 0) : 0
  );
  if (emisStrength > 0.05) {
    const eColor = custom.numberOuterGlowEnabled
      ? (custom.numberOuterGlowColor || glowColor)
      : custom.numberInnerGlowEnabled
        ? (custom.numberInnerGlowColor || glowColor)
        : glowColor;
    eCtx.save();
    eCtx.translate(x, y);
    eCtx.rotate(rotationRad);
    eCtx.font = fontSpec;
    eCtx.textAlign = 'center';
    eCtx.textBaseline = 'alphabetic';
    eCtx.shadowColor = eColor;
    eCtx.shadowBlur = Math.round(18 * emisStrength);
    eCtx.fillStyle = hexWithAlpha(eColor, Math.min(0.7, emisStrength) * (1 - Math.abs(depth) * 0.35));
    eCtx.fillText(label, opticalX, baseline);
    eCtx.restore();
  }
}
