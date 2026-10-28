import { DiceSkinSurfaceStyle } from '../skins/dice-skin.types';

// Matching albedo and height fields keep grain and rock relief in registration.
const cache = new Map<string, HTMLCanvasElement>();
function hash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function drawMaterialSurface(
  ctx: CanvasRenderingContext2D, size: number, style: DiceSkinSurfaceStyle,
  color: string, height = false, intensity = 1,
): boolean {
  if (!['wood', 'stone', 'obsidian', 'glass', 'plastic', 'resin'].includes(style)) return false;
  const key = `${size}:${style}:${color}:${height}:${intensity}`;
  const cached = cache.get(key);
  if (cached) { ctx.drawImage(cached, 0, 0); return true; }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const target = canvas.getContext('2d')!;
  const pixels = target.createImageData(size, size);
  const hex = color.replace('#', '');
  const rgb = /^[0-9a-f]{6}$/i.test(hex)
    ? [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)) : [40, 44, 48];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const broad = noise(u * 7, v * 7);
    const fine = noise(u * 95, v * 95);
    let relief = 0, shade = 1;
    let base = rgb;
    if (style === 'wood') {
      const warp = noise(u * 3, v * 5) * 9 + Math.sin(v * 8) * 1.4;
      const grain = Math.pow(Math.abs(Math.sin(u * 180 + warp)), 12);
      const fibre = noise(u * 210, v * 13);
      relief = (fibre - 0.5) * 0.18 - grain * 0.2;
      shade = 0.58 + fibre * 0.5 + broad * 0.25 - grain * 0.3;
      base = [113 + rgb[0] * 0.15, 51 + rgb[1] * 0.08, 22 + rgb[2] * 0.04];
    } else if (style === 'stone') {
      const middle = noise(u * 28, v * 28);
      relief = (broad - 0.5) * 0.5 + (middle - 0.5) * 0.35 + (fine - 0.5) * 0.22;
      shade = 0.48 + broad * 0.5 + middle * 0.5 + fine * 0.42;
      base = rgb.map(c => Math.max(38, c));
    } else if (style === 'obsidian') {
      // Polished volcanic glass: nearly black, smooth, faint flow bands.
      relief = (broad - 0.5) * 0.009;
      shade = 0.65 + broad * 0.3;
      base = [8 + rgb[0] * 0.025, 7 + rgb[1] * 0.025, 12 + rgb[2] * 0.025];
    } else if (style === 'resin') {
      shade = 0.7 + noise(u * 4 + broad, v * 5) * 0.5;
    } else if (style === 'glass') {
      shade = 0.97 + broad * 0.03;
      base = rgb.map(c => 215 + c * 0.14);
    }
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) pixels.data[i + c] = height
      ? Math.max(0, Math.min(255, 128 + relief * 110 * intensity))
      : Math.max(0, Math.min(255, base[c] * shade));
    pixels.data[i + 3] = 255;
  }
  target.putImageData(pixels, 0, 0);
  if (cache.size >= 48) cache.delete(cache.keys().next().value!);
  cache.set(key, canvas);
  ctx.drawImage(canvas, 0, 0);
  return true;
}
