import { AbstractEngine, Color3, Color4, Material, MaterialPluginBase, PBRMaterial, Scene, SubMesh, UniformBuffer } from '@babylonjs/core';
import { DiceCustomRuntimeConfig } from '../skins/dice-skin.types';
import { evaluateDicePulse } from './dice-pulse';

const plugins = new WeakMap<PBRMaterial, DiceLightPlugin>();
/** One analytic light core per solid, plus a texture mask for the engraved numbers.
 * No extra meshes, shadow maps, lights or render targets per die. */
export class DiceLightPlugin extends MaterialPluginBase {
  private core: Color3;
  private ink: Color3;
  private coreLevel = 0;
  private inkLevel = 0;
  constructor(material: PBRMaterial, private readonly config: DiceCustomRuntimeConfig) {
    super(material, 'LoomDiceLight', 200, {}, true, true);
    this.core = Color3.FromHexString(config.coreInnerGlowColor || config.glowColorHex);
    this.ink = Color3.FromHexString(config.numberOuterGlowEnabled ? config.numberOuterGlowColor
      : config.coreOuterGlowEnabled ? config.coreOuterGlowColor : config.numberInnerGlowColor || config.glowColorHex);
    plugins.set(material, this); this.update(0);
  }
  update(seconds: number): void {
    const c = this.config;
    if (seconds > 0 && !c.corePulseEnabled && !c.numberPulseEnabled) return;
    const corePulse = c.corePulseEnabled ? evaluateDicePulse(c.corePulseWaveform, seconds, c.corePulseSpeed, c.corePulseMin, c.corePulseMax) : 1;
    const inkPulse = c.numberPulseEnabled ? evaluateDicePulse(c.numberPulseWaveform, seconds, c.numberPulseSpeed, c.numberPulseMin, c.numberPulseMax) : 1;
    this.coreLevel = c.coreInnerGlowEnabled ? Math.max(0, Math.min(1, c.coreInnerGlowOpacity)) * corePulse * 0.38 : 0;
    this.inkLevel = Math.max(c.numberOuterGlowEnabled ? c.numberOuterGlowOpacity : 0,
      c.numberInnerGlowEnabled ? c.numberInnerGlowOpacity : 0, c.coreOuterGlowEnabled ? c.coreOuterGlowOpacity : 0) * inkPulse * 0.8;
  }
  halo(result: Color4): void { result.set(this.ink.r * this.inkLevel, this.ink.g * this.inkLevel, this.ink.b * this.inkLevel, 1); }
  override getUniforms() { return { externalUniforms: ['lwCoreColor', 'lwInkColor', 'lwCenter', 'lwRadius', 'lwCoreLevel', 'lwInkLevel'] }; }
  override bindForSubMesh(_buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh): void {
    const effect = subMesh.effect;
    const bounds = subMesh.getRenderingMesh().getBoundingInfo().boundingSphere;
    effect?.setColor3('lwCoreColor', this.core); effect?.setColor3('lwInkColor', this.ink);
    effect?.setVector3('lwCenter', bounds.centerWorld);
    effect?.setFloat('lwRadius', Math.max(0.01, bounds.radiusWorld * (0.4 + Math.min(64, this.config.coreInnerGlowSize) / 160)));
    effect?.setFloat('lwCoreLevel', this.coreLevel); effect?.setFloat('lwInkLevel', this.inkLevel);
  }
  override getCustomCode(shaderType: string) {
    if (shaderType !== 'fragment') return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `uniform vec3 lwCoreColor; uniform vec3 lwInkColor; uniform vec3 lwCenter;
        uniform float lwRadius; uniform float lwCoreLevel; uniform float lwInkLevel;`,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        vec3 lwOffset = vPositionW - lwCenter;
        vec3 lwRay = normalize(vEyePosition.xyz - vPositionW);
        vec3 lwClosest = lwOffset - lwRay * dot(lwOffset, lwRay);
        float lwFalloff = exp(-3.0 * dot(lwClosest,lwClosest) / (lwRadius * lwRadius));
        float lwMask = 0.0;
        #ifdef EMISSIVE
          lwMask = finalEmissive.r;
        #endif
        finalEmissive = lwInkColor * lwMask * lwInkLevel + lwCoreColor * lwFalloff * lwCoreLevel;`,
    };
  }
}
export function updateDiceLight(materials: PBRMaterial[], seconds: number): void {
  for (const material of materials) plugins.get(material)?.update(seconds);
}
export function diceHaloColor(material: Material, result: Color4): void {
  const plugin = plugins.get(material as PBRMaterial);
  if (plugin) plugin.halo(result); else result.set(0, 0, 0, 1);
}
