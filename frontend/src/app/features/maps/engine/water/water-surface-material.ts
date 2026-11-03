import { Color3, DirectionalLight, Scene, ShaderMaterial, Texture, Vector3 } from '@babylonjs/core';
import type { WaterSettings } from './water-settings';
import { WATER_FRAGMENT, WATER_VERTEX } from './water-shaders';

/** Single-pass procedural water surface material (zero extra RenderTargetTexture pass so water never turns black or stalls tool placement). */
export class WaterSurfaceMaterial {
  static configureCapture(_scene: Scene, _enabled: boolean): void {
    // No-op: procedural caustic & bed refraction is computed directly in the water shader.
  }

  static create(scene: Scene, id: string, settings: WaterSettings): ShaderMaterial {
    const mat = new ShaderMaterial(
      'lw-water-material-' + id,
      scene,
      { vertexSource: WATER_VERTEX, fragmentSource: WATER_FRAGMENT },
      {
        attributes: [
          'position',
          'normal',
          'uv',
          'waterData',
          'waterFlow',
          'waterShallow',
          'waterDeep',
          'waterStyle',
        ],
        uniforms: [
          'world',
          'worldViewProjection',
          'time',
          'waveHeight',
          'flowSpeed',
          'waveScale',
          'intensity',
          'foam',
          'opacity',
          'reflectivity',
          'refraction',
          'width',
          'shallowColor',
          'deepColor',
          'cameraPosition',
          'lightDirection',
          'lightColor',
          'lwFogActive',
        ],
        samplers: ['lwFogTex'],
        needAlphaBlending: true,
      },
    );
    mat.backFaceCulling = false;
    const initFogMeta = scene.metadata as { lwFogTex?: Texture | null; lwFogActive?: number } | null;
    mat.setFloat('lwFogActive', initFogMeta?.lwFogActive ?? 0);
    if (initFogMeta?.lwFogTex) {
      mat.setTexture('lwFogTex', initFogMeta.lwFogTex);
    }
    mat.setFloat('waveHeight', Math.min(settings.waveHeight, settings.depth * 0.08));
    mat.setFloat('flowSpeed', settings.mode === 'pond' ? 0 : settings.flowSpeed);
    for (const key of [
      'waveScale',
      'intensity',
      'foam',
      'opacity',
      'reflectivity',
      'refraction',
      'width',
    ] as const) {
      mat.setFloat(key, settings[key]);
    }
    mat.setColor3('shallowColor', Color3.FromHexString(settings.shallowColor));
    mat.setColor3('deepColor', Color3.FromHexString(settings.deepColor));

    const syncUniforms = () => {
      const nowSec = performance.now() * 0.001;
      const camPos = scene.activeCamera?.globalPosition ?? Vector3.Zero();
      const light = scene.lights.find((l) => l instanceof DirectionalLight) as
        | DirectionalLight
        | undefined;
      const lightDir = light?.direction.negate().normalize() ?? new Vector3(0.4, 1, 0.3);
      const lightCol = light
        ? light.diffuse.scale(Math.min(1.5, Math.max(0.65, light.intensity)))
        : Color3.White();
      const fogMeta = scene.metadata as { lwFogTex?: Texture | null; lwFogActive?: number } | null;
      const fogActive = fogMeta?.lwFogActive ?? 0;

      mat.setFloat('time', nowSec);
      mat.setVector3('cameraPosition', camPos);
      mat.setVector3('lightDirection', lightDir);
      mat.setColor3('lightColor', lightCol);
      mat.setFloat('lwFogActive', fogActive);
      if (fogMeta?.lwFogTex) {
        mat.setTexture('lwFogTex', fogMeta.lwFogTex);
      }
      const eff = mat.getEffect();
      if (eff) {
        eff.setFloat('time', nowSec);
        eff.setVector3('cameraPosition', camPos);
        eff.setVector3('lightDirection', lightDir);
        eff.setColor3('lightColor', lightCol);
        eff.setFloat('lwFogActive', fogActive);
        if (fogMeta?.lwFogTex) {
          eff.setTexture('lwFogTex', fogMeta.lwFogTex);
        }
      }
    };

    const beforeRenderObs = scene.onBeforeRenderObservable.add(syncUniforms);
    mat.onBindObservable.add(syncUniforms);
    mat.onDisposeObservable.add(() => {
      scene.onBeforeRenderObservable.remove(beforeRenderObs);
    });
    return mat;
  }
}
