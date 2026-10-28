import { drawMaterialSurface } from './material-surface.texture';
import { DiceSkinSurfaceStyle } from '../skins/dice-skin.types';

let preloadedRockImage: HTMLImageElement | null = null;
let assetsPreloadPromise: Promise<void> | null = null;

export function preloadDiceSurfaceAssets(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (assetsPreloadPromise) {
    return assetsPreloadPromise;
  }

  assetsPreloadPromise = new Promise<void>(resolve => {
    let pending = 2;
    const done = () => {
      pending--;
      if (pending <= 0) {
        resolve();
      }
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      preloadedRockImage = img;
      done();
    };
    img.onerror = () => done();
    img.src = '/assets/dice/rock_face_diff_2k.jpg';

    if (typeof FontFace !== 'undefined' && document.fonts) {
      const font = new FontFace('Nordic Chance', 'url(/assets/dice/Nordic_Chance.ttf)');
      font
        .load()
        .then(loaded => {
          document.fonts.add(loaded);
          done();
        })
        .catch(() => done());
    } else {
      done();
    }
  });

  return assetsPreloadPromise;
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '#49e892').replace('#', '').trim();
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map(ch => ch + ch)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(normalized, 16);
  if (Number.isNaN(num)) {
    return [73, 232, 146];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function shiftColorBrightness(hex: string, delta: number): string {
  const [r, g, b] = hexToRgbTuple(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v + delta)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgbTuple(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function drawSurfaceBackground(
  ctx: CanvasRenderingContext2D,
  size: number,
  surfaceStyle: DiceSkinSurfaceStyle,
  coreColorHex: string,
  accentColorHex: string
): void {
  if (drawMaterialSurface(ctx, size, surfaceStyle, coreColorHex)) return;
  ctx.fillStyle = coreColorHex;
  ctx.fillRect(0, 0, size, size);

  switch (surfaceStyle) {
    case 'stone':
      drawStoneTexture(ctx, size, coreColorHex, accentColorHex);
      break;
    case 'obsidian':
      drawObsidianCracks(ctx, size, coreColorHex, accentColorHex);
      break;
    case 'wood':
      drawWoodGrain(ctx, size, coreColorHex, accentColorHex);
      break;
    case 'void':
      drawVoidNebula(ctx, size, coreColorHex, accentColorHex);
      break;
    case 'metal':
      drawMetalBrushing(ctx, size, coreColorHex, accentColorHex);
      break;
    case 'glass':
      drawGlassRefraction(ctx, size, coreColorHex, accentColorHex);
      break;
    case 'resin':
    default:
      drawResinSwirl(ctx, size, coreColorHex, accentColorHex);
      break;
  }
}

function drawStoneTexture(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  accentColor: string
): void {
  if (preloadedRockImage && preloadedRockImage.complete && preloadedRockImage.naturalWidth > 0) {
    ctx.save();
    ctx.drawImage(preloadedRockImage, 0, 0, size, size);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  } else {
    const grad = ctx.createRadialGradient(size * 0.4, size * 0.4, size * 0.05, size * 0.5, size * 0.5, size * 0.7);
    grad.addColorStop(0, shiftColorBrightness(baseColor, 26));
    grad.addColorStop(1, shiftColorBrightness(baseColor, -22));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  for (let i = 0; i < 420; i++) {
    const x = ((i * 73) % size) + ((i * 19) % 7);
    const y = ((i * 137) % size) + ((i * 31) % 7);
    const r = 1 + (i % 3);
    ctx.fillStyle = i % 5 === 0 ? hexWithAlpha(accentColor, 0.14) : 'rgba(0,0,0,0.22)';
    ctx.fillRect(x % size, y % size, r, r);
  }
}

function drawObsidianCracks(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  veinColor: string
): void {
  const grad = ctx.createRadialGradient(size * 0.35, size * 0.3, size * 0.05, size * 0.5, size * 0.5, size * 0.72);
  grad.addColorStop(0, shiftColorBrightness(baseColor, 28));
  grad.addColorStop(0.65, baseColor);
  grad.addColorStop(1, shiftColorBrightness(baseColor, -20));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.strokeStyle = hexWithAlpha(veinColor, 0.42);
  ctx.shadowColor = veinColor;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;

  for (let c = 0; c < 6; c++) {
    let x = ((c * 97 + 40) % (size - 80)) + 40;
    let y = ((c * 53 + 30) % (size - 60)) + 30;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let seg = 0; seg < 6; seg++) {
      const angle = ((c * 1.3 + seg * 0.85) % (Math.PI * 2));
      const len = 24 + ((c * 13 + seg * 17) % 28);
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawWoodGrain(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  sapColor: string
): void {
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 42; i++) {
    ctx.beginPath();
    ctx.strokeStyle = i % 7 === 0 ? hexWithAlpha(sapColor, 0.24) : shiftColorBrightness(baseColor, i % 2 === 0 ? -18 : 14);
    ctx.lineWidth = 1.5 + (i % 3);
    const yBase = (i / 42) * size;
    ctx.moveTo(0, yBase);
    for (let x = 0; x <= size; x += 24) {
      const wave = Math.sin(x * 0.02 + i * 0.45) * 8;
      ctx.lineTo(x, yBase + wave);
    }
    ctx.stroke();
  }
}

function drawVoidNebula(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  nebulaColor: string
): void {
  const grad = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.04, size * 0.5, size * 0.5, size * 0.65);
  grad.addColorStop(0, hexWithAlpha(nebulaColor, 0.36));
  grad.addColorStop(0.55, shiftColorBrightness(baseColor, 14));
  grad.addColorStop(1, shiftColorBrightness(baseColor, -16));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 64; i++) {
    const sx = (i * 89 + 17) % size;
    const sy = (i * 131 + 29) % size;
    const rad = i % 9 === 0 ? 2.2 : 1.1;
    ctx.fillStyle = i % 4 === 0 ? hexWithAlpha(nebulaColor, 0.85) : 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(sx, sy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMetalBrushing(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  accentColor: string
): void {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, shiftColorBrightness(baseColor, 34));
  grad.addColorStop(0.5, baseColor);
  grad.addColorStop(1, shiftColorBrightness(baseColor, -28));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = hexWithAlpha(accentColor, 0.08);
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 4) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i + ((i % 8) - 4));
    ctx.stroke();
  }
}

function drawGlassRefraction(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  causticColor: string
): void {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, hexWithAlpha(causticColor, 0.32));
  grad.addColorStop(0.45, baseColor);
  grad.addColorStop(1, shiftColorBrightness(baseColor, -24));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

function drawResinSwirl(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  swirlColor: string
): void {
  const grad = ctx.createRadialGradient(size * 0.32, size * 0.28, size * 0.06, size * 0.5, size * 0.5, size * 0.72);
  grad.addColorStop(0, shiftColorBrightness(baseColor, 32));
  grad.addColorStop(0.55, baseColor);
  grad.addColorStop(1, shiftColorBrightness(baseColor, -24));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.strokeStyle = hexWithAlpha(swirlColor, 0.22);
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.28, 0.3, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
}

export function drawSurfaceBumpHeight(
  hCtx: CanvasRenderingContext2D,
  size: number,
  surfaceStyle: DiceSkinSurfaceStyle,
  bumpIntensity = 1.0
): void {
  const amp = Math.max(0, Math.min(2.5, bumpIntensity));
  if (amp <= 0.02) {
    return;
  }
  if (drawMaterialSurface(hCtx, size, surfaceStyle, '#808080', true, amp)) return;
  hCtx.save();
  if (surfaceStyle === 'stone' || surfaceStyle === 'obsidian') {
    for (let i = 0; i < 360; i++) {
      const x = ((i * 79) % size);
      const y = ((i * 139) % size);
      const r = 1 + (i % 4);
      const delta = (i % 2 === 0 ? -1 : 1) * Math.round(28 * amp);
      const val = Math.max(20, Math.min(235, 128 + delta));
      hCtx.fillStyle = `rgb(${val},${val},${val})`;
      hCtx.fillRect(x, y, r, r);
    }
    if (surfaceStyle === 'obsidian') {
      hCtx.strokeStyle = `rgb(${Math.max(15, Math.round(128 - 48 * amp))},${Math.max(15, Math.round(128 - 48 * amp))},${Math.max(15, Math.round(128 - 48 * amp))})`;
      hCtx.lineWidth = 2.5;
      for (let c = 0; c < 5; c++) {
        let x = ((c * 97 + 40) % (size - 80)) + 40;
        let y = ((c * 53 + 30) % (size - 60)) + 30;
        hCtx.beginPath();
        hCtx.moveTo(x, y);
        for (let seg = 0; seg < 5; seg++) {
          const angle = (c * 1.3 + seg * 0.85) % (Math.PI * 2);
          x += Math.cos(angle) * 26;
          y += Math.sin(angle) * 26;
          hCtx.lineTo(x, y);
        }
        hCtx.stroke();
      }
    }
  } else if (surfaceStyle === 'wood') {
    for (let i = 0; i < 36; i++) {
      const val = Math.max(30, Math.min(225, Math.round(128 + (i % 2 === 0 ? -24 : 20) * amp)));
      hCtx.strokeStyle = `rgb(${val},${val},${val})`;
      hCtx.lineWidth = 2;
      const yBase = (i / 36) * size;
      hCtx.beginPath();
      hCtx.moveTo(0, yBase);
      for (let x = 0; x <= size; x += 24) {
        hCtx.lineTo(x, yBase + Math.sin(x * 0.02 + i * 0.45) * 7);
      }
      hCtx.stroke();
    }
  } else if (surfaceStyle === 'metal') {
    const hi = Math.min(220, Math.round(128 + 18 * amp));
    const lo = Math.max(40, Math.round(128 - 18 * amp));
    for (let i = 0; i < size; i += 4) {
      hCtx.strokeStyle = i % 8 === 0 ? `rgb(${hi},${hi},${hi})` : `rgb(${lo},${lo},${lo})`;
      hCtx.lineWidth = 1;
      hCtx.beginPath();
      hCtx.moveTo(0, i);
      hCtx.lineTo(size, i + ((i % 8) - 4));
      hCtx.stroke();
    }
  }
  hCtx.restore();
}

