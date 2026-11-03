import {
  AbstractEngine,
  DynamicTexture,
  Material,
  MaterialDefines,
  MaterialPluginBase,
  PBRMaterial,
  Scene,
  ShaderLanguage,
  StandardMaterial,
  SubMesh,
  Texture,
  UniformBuffer,
} from '@babylonjs/core';

export interface LwSceneFogMetadata {
  lwFogTex?: Texture | null;
  lwFogActive?: number;
  lwFogObserverHooked?: boolean;
}

const FALLBACK_TEX_NAME = 'lw-fog-fallback-tex';

export function getOrCreateFallbackFogTexture(scene: Scene): Texture {
  const existing = scene.getTextureByName(FALLBACK_TEX_NAME);
  if (existing instanceof Texture) return existing;
  const tex = new DynamicTexture(FALLBACK_TEX_NAME, { width: 4, height: 4 }, scene, false);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, 4, 4);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

function resolveDiscardModeForMaterial(matName: string): number {
  if (matName === 'lw-terrain-grid-mat' || matName.startsWith('lw-aoe-') || matName.startsWith('lw-target-reticle-')) {
    return 2.0;
  }
  if (matName === 'lw-terrain-ground-mat' || matName === 'lw-map-mat') {
    return 0.0;
  }
  return 1.0;
}

/**
 * Babylon.js MaterialPlugin that injects world-space (X, Z) volumetric Fog of War
 * directly into every StandardMaterial and PBRMaterial in the 3D VTT scene.
 * Ensures that tilting or rotating the 3D camera never changes what is revealed,
 * unrevealed foreground hills never block the camera, and tall 3D assets/tokens
 * never stick out above the fog plane.
 */
export class VolumetricFogMaterialPlugin extends MaterialPluginBase {
  private readonly discardMode: number;

  constructor(material: Material) {
    super(material, 'LwVolumetricFog', 200, { LW_VOLUMETRIC_FOG: false }, true, true);
    this.registerForExtraEvents = true;
    this.doNotSerialize = true;
    this.discardMode = resolveDiscardModeForMaterial(material.name || '');
    this._enable(true);
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override getClassName(): string {
    return 'VolumetricFogMaterialPlugin';
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines['LW_VOLUMETRIC_FOG'] = true;
  }

  override getSamplers(samplers: string[]): void {
    samplers.push('lwFogTex');
  }

  override getUniforms(): {
    ubo: Array<{ name: string; size: number; type: string }>;
    fragment: string;
  } {
    return {
      ubo: [
        { name: 'lwFogActive', size: 1, type: 'float' },
        { name: 'lwFogDiscardMode', size: 1, type: 'float' },
      ],
      fragment: `#ifdef LW_VOLUMETRIC_FOG
uniform float lwFogActive;
uniform float lwFogDiscardMode;
#endif`,
    };
  }

  override bindForSubMesh(
    uniformBuffer: UniformBuffer,
    scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh,
  ): void {
    this.bindFogUniforms(uniformBuffer, scene);
  }

  override hardBindForSubMesh(
    uniformBuffer: UniformBuffer,
    scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh,
  ): void {
    this.bindFogUniforms(uniformBuffer, scene);
  }

  private bindFogUniforms(uniformBuffer: UniformBuffer, scene: Scene): void {
    const meta = (scene.metadata ?? {}) as LwSceneFogMetadata;
    const active = meta.lwFogActive ?? 0;
    const tex = meta.lwFogTex ?? getOrCreateFallbackFogTexture(scene);
    uniformBuffer.updateFloat('lwFogActive', active);
    uniformBuffer.updateFloat('lwFogDiscardMode', this.discardMode);
    uniformBuffer.setTexture('lwFogTex', tex);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `#ifdef LW_VOLUMETRIC_FOG
varying vec2 vLwFogXZ;
#endif`,
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `#ifdef LW_VOLUMETRIC_FOG
vLwFogXZ = worldPos.xz;
#endif`,
      };
    }
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `#ifdef LW_VOLUMETRIC_FOG
varying vec2 vLwFogXZ;
uniform sampler2D lwFogTex;
#endif`,
        CUSTOM_FRAGMENT_MAIN_END: `#ifdef LW_VOLUMETRIC_FOG
if (lwFogActive > 0.5) {
  vec2 lwFogUv = vec2((vLwFogXZ.x + 18.0) / 36.0, 1.0 - (vLwFogXZ.y + 13.5) / 27.0);
  float lwFogOut = step(lwFogUv.x, 0.0) + step(1.0, lwFogUv.x) + step(lwFogUv.y, 0.0) + step(1.0, lwFogUv.y);
  float lwFogAlpha = lwFogOut > 0.0 ? 1.0 : texture2D(lwFogTex, clamp(lwFogUv, vec2(0.001, 0.001), vec2(0.999, 0.999))).a;
  if (lwFogDiscardMode > 0.5 && lwFogAlpha > 0.78) {
    discard;
  }
  if (lwFogDiscardMode < 0.5 && lwFogAlpha > 0.94) {
    discard;
  }
  vec3 lwFogVoidColor = vec3(0.012, 0.031, 0.024);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, lwFogVoidColor, clamp(lwFogAlpha, 0.0, 1.0));
  if (lwFogDiscardMode > 1.5) {
    gl_FragColor.a *= (1.0 - clamp(lwFogAlpha, 0.0, 1.0));
  }
}
#endif`,
      };
    }
    return null;
  }
}

export function attachVolumetricFogToMaterial(mat: Material | null | undefined): void {
  if (!mat) return;
  if (mat.name === 'lw-fog-mat') return;
  if (!(mat instanceof StandardMaterial) && !(mat instanceof PBRMaterial)) return;
  const anyMat = mat as Material & { _lwVolumetricFogAttached?: boolean };
  if (anyMat._lwVolumetricFogAttached) return;
  if (mat.pluginManager?.getPlugin('LwVolumetricFog')) {
    anyMat._lwVolumetricFogAttached = true;
    return;
  }
  const wasFrozen = mat.isFrozen;
  if (wasFrozen) {
    mat.unfreeze();
  }
  anyMat._lwVolumetricFogAttached = true;
  new VolumetricFogMaterialPlugin(mat);
  mat.markAsDirty(Material.MiscDirtyFlag);
}

export function syncSceneVolumetricFogMaterials(
  scene: Scene,
  fogTexture: Texture | null,
  active: boolean,
): void {
  const meta = ((scene.metadata as LwSceneFogMetadata | null) ?? {}) as LwSceneFogMetadata;
  meta.lwFogTex = fogTexture ?? getOrCreateFallbackFogTexture(scene);
  meta.lwFogActive = active ? 1.0 : 0.0;
  scene.metadata = meta;

  if (!meta.lwFogObserverHooked) {
    meta.lwFogObserverHooked = true;
    scene.onNewMaterialAddedObservable.add((newMat) => {
      attachVolumetricFogToMaterial(newMat);
    });
  }

  for (const mat of scene.materials) {
    attachVolumetricFogToMaterial(mat);
  }
}
