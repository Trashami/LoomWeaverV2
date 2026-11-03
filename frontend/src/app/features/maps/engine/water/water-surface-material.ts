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
    mat.setFloat('lwFogActive', 0);
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
    mat.onBindObservable.add(() => {
      mat.setFloat('time', performance.now() * 0.001);
      mat.setVector3('cameraPosition', scene.activeCamera?.globalPosition ?? Vector3.Zero());
      const light = scene.lights.find((l) => l instanceof DirectionalLight) as
        | DirectionalLight
        | undefined;
      mat.setVector3(
        'lightDirection',
        light?.direction.negate().normalize() ?? new Vector3(0.4, 1, 0.3),
      );
      mat.setColor3(
        'lightColor',
        light ? light.diffuse.scale(Math.min(1.5, Math.max(0.65, light.intensity))) : Color3.White(),
      );
      const fogMeta = scene.metadata as { lwFogTex?: Texture | null; lwFogActive?: number } | null;
      mat.setFloat('lwFogActive', fogMeta?.lwFogActive ?? 0);
      if (fogMeta?.lwFogTex) {
        mat.setTexture('lwFogTex', fogMeta.lwFogTex);
      }
    });
    return mat;
  }
}
