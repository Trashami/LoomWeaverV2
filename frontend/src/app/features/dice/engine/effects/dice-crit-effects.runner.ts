import { Color3, Color4, DynamicTexture, GlowLayer, Mesh, MeshBuilder, ParticleSystem, PointLight, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { DiceCritEffectPreset } from './dice-crit-effects.catalog';
import recipes from './effectbuilder-recipes.json';

/** Bounded 3D adapter for EffectBuilder caster/target layers. One temporary light. */
export class DiceCritEffectsRunner {
  private cleanup: (() => void) | null = null;
  triggerCritEffect(preset: DiceCritEffectPreset, origin: Vector3, scene: Scene,
    _glowLayer: GlowLayer | null, intensity = 0.55): void {
    this.clearActiveEffects();
    const recipe = recipes.find(r => r.name === preset.recipeName);
    const layers = recipe?.specs ?? [
      { kind: 'ring', variant: 'shockwave', color: preset.primaryColorHex, size: 65, opacity: 0.65 },
      { kind: 'sparks', variant: 'embers', color: preset.secondaryColorHex, count: preset.particleCount, size: 3 },
    ];
    const meshes: Mesh[] = [], systems: ParticleSystem[] = [], materials: StandardMaterial[] = [];
    const animations: ((time: number, fade: number) => void)[] = [];
    const light = new PointLight('lw-crit-light', origin.add(new Vector3(0, 1.8, 0)), scene);
    light.diffuse = Color3.FromHexString(layers[0].color); light.range = 9;
    const texture = new DynamicTexture('lw-crit-soft-particle', 32, scene, false);
    const ctx = texture.getContext();
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.35, '#ffffffaa'); gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32); texture.update();
    for (const [index, raw] of layers.slice(0, 4).entries()) {
      const layer = raw as { kind: string; variant: string; color: string; size?: number; count?: number; opacity?: number; motion?: { twirl?: number; speed?: number } };
      const color = Color3.FromHexString(layer.color);
      const orbit = layer.kind === 'aura';
      if (layer.kind === 'ring' || layer.kind === 'sigil' || orbit) {
        const radius = Math.max(1.2, (layer.size ?? 45) / 23);
        const ring = MeshBuilder.CreateTorus('lw-crit-ring', { diameter: radius * 2, thickness: layer.kind === 'sigil' ? 0.035 : 0.065, tessellation: layer.kind === 'sigil' ? 6 : 48 }, scene);
        ring.position.set(origin.x, orbit ? origin.y : 0.055 + index * 0.03, origin.z);
        if (orbit) ring.rotation.z = Math.PI / 3;
        const material = new StandardMaterial('lw-crit-ring-light', scene);
        material.disableLighting = true; material.emissiveColor = color; material.alpha = 0;
        ring.material = material; meshes.push(ring); materials.push(material);
        animations.push((time, fade) => {
          ring.scaling.setAll(layer.kind === 'ring' ? 0.3 + time * 0.65 : 1);
          ring.rotation.y = time * (layer.motion?.twirl ?? 0.2) * 3;
          material.alpha = fade * (layer.opacity ?? 0.6) * Math.min(1, intensity * 1.4);
        });
      } else {
        const cloud = layer.kind === 'cloud', shards = layer.variant === 'shatter';
        const system = new ParticleSystem('lw-crit-particles', Math.min(40, layer.count ?? 28), scene);
        system.particleTexture = texture; system.emitter = origin.clone();
        system.minEmitBox = new Vector3(-0.8, 0, -0.8); system.maxEmitBox = new Vector3(0.8, 0.3, 0.8);
        system.color1 = new Color4(color.r, color.g, color.b, cloud ? 0.16 : 0.75);
        system.color2 = system.color1; system.colorDead = new Color4(color.r, color.g, color.b, 0);
        system.minSize = cloud ? 0.8 : shards ? 0.22 : 0.08; system.maxSize = cloud ? 2.2 : shards ? 0.4 : 0.19;
        system.minLifeTime = 0.6; system.maxLifeTime = 1.6;
        system.direction1 = new Vector3(-1, 0.6, -1); system.direction2 = new Vector3(1, 2.6, 1);
        system.minEmitPower = 0.5; system.maxEmitPower = cloud ? 0.6 : 2 * (layer.motion?.speed ?? 0.65);
        system.gravity = new Vector3(0, shards ? -3 : cloud ? 0.15 : -0.6, 0);
        system.emitRate = Math.min(35, layer.count ?? 24); system.targetStopDuration = 0.7;
        system.blendMode = cloud ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD;
        system.start(); systems.push(system);
      }
    }
    const started = performance.now();
    const observer = scene.onBeforeRenderObservable.add(() => {
      const time = (performance.now() - started) / 1000;
      const fade = Math.min(1, time / 0.12) * Math.max(0, 1 - time / 2.5);
      light.intensity = Math.max(0, intensity) * 5 * fade;
      for (const animate of animations) animate(time, fade);
      if (time >= 2.5) this.clearActiveEffects();
    });
    this.cleanup = () => {
      scene.onBeforeRenderObservable.remove(observer);
      systems.forEach(system => system.dispose(false));
      meshes.forEach(mesh => mesh.dispose()); materials.forEach(material => material.dispose());
      light.dispose(); texture.dispose();
    };
  }
  clearActiveEffects(): void { this.cleanup?.(); this.cleanup = null; }
}
