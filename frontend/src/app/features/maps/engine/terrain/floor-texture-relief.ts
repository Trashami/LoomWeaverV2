import { Material, RawTexture, Scene, StandardMaterial, Texture } from '@babylonjs/core';

const images = new Map<string, Promise<HTMLImageElement>>();
const requests = new WeakMap<StandardMaterial, object>();

export function loadFloorImage(url: string): Promise<HTMLImageElement> {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    images.set(url, pending);
    pending.catch(() => images.delete(url));
  }
  return pending;
}

export function resolveDerivedHeightUrl(
  albedoUrl?: string,
  normalUrl?: string,
  explicitHeightUrl?: string,
): string {
  if (explicitHeightUrl) return explicitHeightUrl;
  if (normalUrl && normalUrl.includes('_normal.')) {
    return normalUrl.replace('_normal.', '_height.');
  }
  if (albedoUrl && /\.(png|jpg|jpeg|webp)$/i.test(albedoUrl)) {
    return albedoUrl.replace(/\.(png|jpg|jpeg|webp)$/i, '_height.$1');
  }
  return '';
}

/**
 * Combines tangent-space normal map data with wrapped Sobel height-map gradients
 * so Bump Map Intensity increases micro-surface bump strength and Texture Height
 * exaggerates the high ridges and low crevices without shifting/sinking the floor plane.
 */
export function buildEnhancedNormalAndHeightData(
  normal: Uint8ClampedArray,
  height: Uint8ClampedArray | null,
  width: number,
  rows: number,
  bumpIntensityPct: number,
  heightScalePct: number,
): Uint8Array {
  const packed = new Uint8Array(normal.length);
  const bumpGain = Math.max(0, Math.min(3.5, bumpIntensityPct / 100));
  const heightGain = Math.max(0, Math.min(3.0, heightScalePct / 100)) * 2.4;

  for (let y = 0; y < rows; y++) {
    const yPrev = (y - 1 + rows) % rows;
    const yNext = (y + 1) % rows;
    for (let x = 0; x < width; x++) {
      const xPrev = (x - 1 + width) % width;
      const xNext = (x + 1) % width;
      const idx = (y * width + x) * 4;

      // Base tangent-space normal perturbation in [-1, 1]
      let nx = ((normal[idx] / 255) * 2 - 1) * bumpGain;
      let ny = ((normal[idx + 1] / 255) * 2 - 1) * bumpGain;
      let nz = Math.max(0.15, (normal[idx + 2] / 255) * 2 - 1);

      let hVal = 128;
      if (height && height.length === normal.length) {
        hVal = height[idx];
        if (heightGain > 0.001) {
          // Wrapped Sobel filter across tile boundaries (zero edge clamping lines)
          const hTL = height[(yPrev * width + xPrev) * 4] / 255;
          const hT = height[(yPrev * width + x) * 4] / 255;
          const hTR = height[(yPrev * width + xNext) * 4] / 255;
          const hL = height[(y * width + xPrev) * 4] / 255;
          const hR = height[(y * width + xNext) * 4] / 255;
          const hBL = height[(yNext * width + xPrev) * 4] / 255;
          const hB = height[(yNext * width + x) * 4] / 255;
          const hBR = height[(yNext * width + xNext) * 4] / 255;

          const dHdX = (hTR + 2 * hR + hBR - (hTL + 2 * hL + hBL)) * heightGain;
          const dHdY = (hBL + 2 * hB + hBR - (hTL + 2 * hT + hTR)) * heightGain;

          nx -= dHdX;
          ny -= dHdY;
        }
      }

      const invLen = 1 / Math.max(0.0001, Math.hypot(nx, ny, nz));
      packed[idx] = Math.max(0, Math.min(255, Math.round((nx * invLen * 0.5 + 0.5) * 255)));
      packed[idx + 1] = Math.max(0, Math.min(255, Math.round((ny * invLen * 0.5 + 0.5) * 255)));
      packed[idx + 2] = Math.max(128, Math.min(255, Math.round((nz * invLen * 0.5 + 0.5) * 255)));
      packed[idx + 3] = hVal;
    }
  }
  return packed;
}

export function configureFloorRelief(
  scene: Scene,
  mat: StandardMaterial,
  normalUrl: string,
  heightUrl: string,
  heightAmountPct: number,
  uScale: number,
  vScale: number,
  bumpIntensityPct = 135,
): void {
  const request = {};
  requests.set(mat, request);

  // Never use UV-shifting parallax occlusion on the ground plane: it shifts the floor relative to the 3D grid
  // and makes the floor appear to sink/rise when adjusting height. Instead we bake true height-map high/low
  // slope relief into a wrapped normal map and cavity-shaded albedo texture.
  mat.useParallax = false;
  mat.useParallaxOcclusion = false;
  mat.parallaxScaleBias = 0;

  if (!normalUrl || typeof document === 'undefined') return;

  const effectiveHeightUrl = resolveDerivedHeightUrl(undefined, normalUrl, heightUrl);
  const normalPromise = loadFloorImage(normalUrl);
  const heightPromise = effectiveHeightUrl
    ? loadFloorImage(effectiveHeightUrl).catch(() => null)
    : Promise.resolve(null);

  void Promise.all([normalPromise, heightPromise])
    .then(([normalImg, heightImg]) => {
      if (scene.isDisposed || requests.get(mat) !== request) return;
      const w = Math.min(512, normalImg.naturalWidth || 512);
      const h = Math.min(512, normalImg.naturalHeight || 512);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(normalImg, 0, 0, w, h);
      const normalData = ctx.getImageData(0, 0, w, h).data;

      let heightData: Uint8ClampedArray | null = null;
      if (heightImg) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(heightImg, 0, 0, w, h);
        heightData = ctx.getImageData(0, 0, w, h).data;
      }

      const data = buildEnhancedNormalAndHeightData(
        normalData,
        heightData,
        w,
        h,
        bumpIntensityPct,
        heightAmountPct,
      );
      const texture = RawTexture.CreateRGBATexture(
        data,
        w,
        h,
        scene,
        true,
        true,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.wrapR = Texture.WRAP_ADDRESSMODE;
      const internalTex = texture.getInternalTexture();
      if (internalTex) {
        internalTex.wrapU = Texture.WRAP_ADDRESSMODE;
        internalTex.wrapV = Texture.WRAP_ADDRESSMODE;
        internalTex._cachedWrapU = null;
        internalTex._cachedWrapV = null;
      }
      texture.uScale = uScale;
      texture.vScale = vScale;
      texture.level = Math.max(0, (bumpIntensityPct / 100) * 1.65);

      const old = mat.bumpTexture;
      mat.bumpTexture = texture;
      mat.markAsDirty(Material.TextureDirtyFlag | Material.MiscDirtyFlag);
      if (old && old !== texture && old.name.startsWith('RawTexture')) {
        old.dispose();
      }
    })
    .catch(() => {
      // Keep base normal texture if image reading is unavailable
    });
}
