import { RawTexture, Scene, StandardMaterial, Texture } from '@babylonjs/core';

const images = new Map<string, Promise<HTMLImageElement>>();
const requests = new WeakMap<StandardMaterial, object>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image(); image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image); image.onerror = reject; image.src = url;
    });
    images.set(url, pending);
    pending.catch(() => images.delete(url));
  }
  return pending;
}

/** Babylon's parallax shader reads height from normal-map alpha, at the same tiled UV. */
export function packFloorRelief(normal: Uint8ClampedArray, height: Uint8ClampedArray): Uint8Array {
  const packed = new Uint8Array(normal);
  for (let i = 0; i < packed.length; i += 4) packed[i + 3] = height[i];
  return packed;
}

export function configureFloorRelief(scene: Scene, mat: StandardMaterial, normalUrl: string,
  heightUrl: string, amount: number, uScale: number, vScale: number): void {
  const request = {}; requests.set(mat, request);
  mat.useParallax = false; mat.useParallaxOcclusion = false;
  mat.parallaxScaleBias = Math.max(0, Math.min(220, amount)) / 100 * .025;
  if (!normalUrl || !heightUrl || amount <= 0 || typeof document === 'undefined') return;
  void Promise.all([loadImage(normalUrl), loadImage(heightUrl)]).then(([normal, height]) => {
    if (scene.isDisposed || requests.get(mat) !== request) return;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(1024, normal.naturalWidth); canvas.height = Math.min(1024, normal.naturalHeight);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
    ctx.drawImage(normal, 0, 0, canvas.width, canvas.height);
    const normalData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.drawImage(height, 0, 0, canvas.width, canvas.height);
    const data = packFloorRelief(normalData, ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    const texture = RawTexture.CreateRGBATexture(data, canvas.width, canvas.height, scene, true, true,
      Texture.TRILINEAR_SAMPLINGMODE);
    texture.uScale = uScale; texture.vScale = vScale; texture.level = mat.bumpTexture?.level ?? 1;
    const old = mat.bumpTexture; mat.bumpTexture = texture; old?.dispose();
    mat.useParallax = true; mat.useParallaxOcclusion = true;
  }).catch(() => { /* Keep the normal map when a height asset is unavailable. Never invent terrain ridges. */ });
}
