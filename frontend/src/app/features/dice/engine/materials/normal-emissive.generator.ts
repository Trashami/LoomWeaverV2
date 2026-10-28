import { DynamicTexture, Scene } from '@babylonjs/core';

export function createBabylonDynamicTextureFromCanvas(
  name: string,
  sourceCanvas: HTMLCanvasElement,
  scene: Scene
): DynamicTexture {
  const size = sourceCanvas.width;
  const tex = new DynamicTexture(name, size, scene, true);
  const ctx = tex.getContext();
  ctx.drawImage(sourceCanvas, 0, 0, size, size);
  tex.update(false);
  return tex;
}

export function createBabylonNormalTextureFromHeightCanvas(
  name: string,
  heightCanvas: HTMLCanvasElement,
  scene: Scene,
  strength = 2.8
): DynamicTexture {
  const size = heightCanvas.width;
  const hCtx = heightCanvas.getContext('2d')!;
  const src = hCtx.getImageData(0, 0, size, size).data;

  const normalTex = new DynamicTexture(name, size, scene, true);
  const nCtx = normalTex.getContext() as unknown as CanvasRenderingContext2D;
  const outImg = nCtx.createImageData(size, size);
  const dst = outImg.data;

  const sampleHeight = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(size - 1, x));
    const cy = Math.max(0, Math.min(size - 1, y));
    return src[(cy * size + cx) * 4] / 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleHeight(x - 1, y - 1);
      const t = sampleHeight(x, y - 1);
      const tr = sampleHeight(x + 1, y - 1);
      const l = sampleHeight(x - 1, y);
      const r = sampleHeight(x + 1, y);
      const bl = sampleHeight(x - 1, y + 1);
      const b = sampleHeight(x, y + 1);
      const br = sampleHeight(x + 1, y + 1);

      const dX = tr + 2 * r + br - (tl + 2 * l + bl);
      const dY = bl + 2 * b + br - (tl + 2 * t + tr);

      let nx = -dX * strength;
      let ny = -dY * strength;
      let nz = 1.0;

      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      dst[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst[idx + 3] = src[idx];
    }
  }

  nCtx.putImageData(outImg, 0, 0);
  normalTex.gammaSpace = false;
  normalTex.update(false);
  return normalTex;
}
