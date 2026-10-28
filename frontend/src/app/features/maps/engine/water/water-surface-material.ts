import { Color3, DirectionalLight, RenderTargetTexture, Scene, ShaderMaterial, Vector3 } from '@babylonjs/core';
import type { WaterSettings } from './water-settings';
import { WATER_FRAGMENT, WATER_VERTEX } from './water-shaders';

/** One refraction capture per scene; the water itself and editor helpers never enter it. */
export class WaterSurfaceMaterial {
  private static captures = new WeakMap<Scene, RenderTargetTexture>();
  private static capture(scene: Scene): RenderTargetTexture {
    let target = this.captures.get(scene);
    if (!target) {
      target = new RenderTargetTexture('lw-water-refraction', 512, scene, false);
      target.renderListPredicate = mesh => mesh.isEnabled() && mesh.isVisible
        && !mesh.name.startsWith('lw-water-') && !mesh.name.startsWith('lw-ghost-')
        && !mesh.name.startsWith('lw-gizmo-') && !mesh.name.startsWith('lw-glb-tpl-');
      target.ignoreCameraViewport = true;
      scene.customRenderTargets.push(target);
      this.captures.set(scene, target);
    }
    return target;
  }
  static configureCapture(scene: Scene, enabled: boolean): void {
    const capture = this.captures.get(scene);
    if (capture) capture.refreshRate = enabled ? 1 : 0;
  }
  static create(scene: Scene, id: string, settings: WaterSettings): ShaderMaterial {
    const mat = new ShaderMaterial('lw-water-material-' + id, scene,
      { vertexSource: WATER_VERTEX, fragmentSource: WATER_FRAGMENT }, {
        attributes: ['position','normal','uv','waterData','waterFlow','waterShallow','waterDeep','waterStyle'],
        uniforms: ['world', 'worldViewProjection', 'time', 'waveHeight', 'flowSpeed', 'waveScale',
          'intensity', 'foam', 'opacity', 'reflectivity', 'refraction', 'width',
          'shallowColor', 'deepColor', 'cameraPosition', 'lightDirection', 'lightColor'],
        samplers: ['sceneColor'], needAlphaBlending: true,
      });
    mat.backFaceCulling = false;
    mat.setTexture('sceneColor', this.capture(scene));
    mat.setFloat('waveHeight', Math.min(settings.waveHeight, settings.depth*.08));
    mat.setFloat('flowSpeed', settings.mode === 'pond' ? 0 : settings.flowSpeed);
    for (const key of ['waveScale','intensity','foam','opacity','reflectivity','refraction','width'] as const) {
      mat.setFloat(key, settings[key]);
    }
    mat.setColor3('shallowColor', Color3.FromHexString(settings.shallowColor));
    mat.setColor3('deepColor', Color3.FromHexString(settings.deepColor));
    mat.onBindObservable.add(() => {
      mat.setFloat('time', performance.now()*.001);
      mat.setVector3('cameraPosition', scene.activeCamera?.globalPosition ?? Vector3.Zero());
      const light = scene.lights.find(l => l instanceof DirectionalLight) as DirectionalLight | undefined;
      mat.setVector3('lightDirection', light?.direction.negate().normalize() ?? new Vector3(.4,1,.3));
      mat.setColor3('lightColor', light ? light.diffuse.scale(Math.min(1.5,light.intensity)) : Color3.White());
    });
    return mat;
  }
}
