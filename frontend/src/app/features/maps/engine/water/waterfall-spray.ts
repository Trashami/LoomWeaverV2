import { Color4, ParticleSystem, RawTexture, Scene, Texture, Vector3 } from '@babylonjs/core';
import type { WaterProfile } from './water-profile';

const sharedSprayTexByScene = new WeakMap<Scene, RawTexture>();

function getOrCreateSprayTexture(scene: Scene): RawTexture {
  const existing = sharedSprayTexByScene.get(scene);
  if (existing && existing.getScene() === scene) {
    return existing;
  }
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const alpha = Math.max(0, 1 - Math.hypot((x - 7.5) / 7.5, (y - 7.5) / 7.5));
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(alpha * alpha * 255);
    }
  }
  const tex = RawTexture.CreateRGBATexture(
    pixels,
    16,
    16,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  );
  tex.hasAlpha = true;
  sharedSprayTexByScene.set(scene, tex);
  return tex;
}

export function createWaterfallSpray(scene: Scene, profile: WaterProfile): void {
  if (!profile.settings.spray || profile.settings.mode === 'pond') return;
  const falls = profile.samples.filter(
    (p, i, all) => p.fall > 0.18 && (!i || all[i - 1].fall <= 0.18),
  );
  const existingCount = scene.particleSystems.filter((p) =>
    p.name.startsWith('lw-water-spray-'),
  ).length;
  const maxAllowed = Math.max(0, Math.min(6, 8 - existingCount));

  for (const [index, p] of falls.slice(0, maxAllowed).entries()) {
    const below =
      profile.samples.find((s) => s.distance > p.distance + 0.45 && s.fall < 0.14) ??
      profile.samples[profile.samples.length - 1];
    const system = new ParticleSystem(`lw-water-spray-${profile.id}-${index}`, 220, scene);
    system.particleTexture = getOrCreateSprayTexture(scene);
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    system.emitter = new Vector3(
      (p.x * 0.35 + below.x * 0.65),
      below.level + 0.12,
      (p.z * 0.35 + below.z * 0.65),
    );
    system.minEmitBox = new Vector3(-profile.settings.width * 0.28, -0.05, -0.22);
    system.maxEmitBox = new Vector3(profile.settings.width * 0.28, Math.max(0.18, (p.level - below.level) * 0.45), 0.22);
    system.direction1 = new Vector3(-0.45, 0.55, -0.45);
    system.direction2 = new Vector3(0.45, 1.35, 0.45);
    system.color1 = new Color4(0.84, 0.96, 1, 0.34);
    system.color2 = new Color4(1, 1, 1, 0.52);
    system.colorDead = new Color4(0.84, 0.96, 1, 0);
    system.minSize = 0.035;
    system.maxSize = 0.16;
    system.minLifeTime = 0.35;
    system.maxLifeTime = 1.15;
    system.emitRate = profile.settings.spray * 135;
    system.minEmitPower = 0.18;
    system.maxEmitPower = 0.58;
    system.gravity = new Vector3(0, -0.65, 0);
    system.updateSpeed = 0.015;
    system.start();
  }
}
