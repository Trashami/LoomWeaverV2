import {
  Color4,
  DynamicTexture,
  ParticleSystem,
  Scene,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { LightSettings } from './light-settings';

const FX_PREFIX = 'lw-aoe-fx-';

function hexToColor4(hex: string, alpha: number): Color4 {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff';
  return new Color4(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
    alpha,
  );
}

function getSoftDotTexture(scene: Scene): Texture {
  const name = 'lw-aoe-soft-dot';
  const existing = scene.getTextureByName(name);
  if (existing) return existing as Texture;
  const tex = new DynamicTexture(name, 64, scene, false);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Ambient particle effects (fireflies, sparkles, glows, fireworks) for AOE lights. */
export class AoeLightEffects {
  static disposeAll(scene: Scene): void {
    scene.particleSystems
      .filter((ps) => ps.name.startsWith(FX_PREFIX))
      .forEach((ps) => ps.dispose(false));
  }

  static build(scene: Scene, nodeId: string, origin: Vector3, s: LightSettings): void {
    const capacity = Math.min(600, Math.max(4, Math.round(s.effectCount * 2)));
    const ps = new ParticleSystem(`${FX_PREFIX}${nodeId}`, capacity, scene);
    ps.particleTexture = getSoftDotTexture(scene);
    ps.emitter = origin.clone();
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.isLocal = false;
    ps.updateSpeed = 0.01 * Math.max(0.05, s.effectSpeed);
    ps.minEmitBox = ps.maxEmitBox = Vector3.Zero();

    const primary = hexToColor4(s.effectColorHex, 1);
    const secondary = hexToColor4(s.colorHex, 1);
    const clear = (c: Color4) => new Color4(c.r, c.g, c.b, 0);
    const size = Math.max(0.02, s.effectSizeM);
    const spread = Math.max(0.3, s.effectSpreadM);

    if (s.effect === 'firework') {
      this.configureFirework(scene, ps, s, primary, secondary, size, spread);
    } else {
      const emitter = ps.createSphereEmitter(spread, 0);
      emitter.radiusRange = 0;
      ps.minEmitPower = 0.05;
      ps.maxEmitPower = 0.35 * s.effectSpeed;
      ps.color1 = primary;
      ps.color2 = secondary;
      ps.colorDead = clear(secondary);
      ps.addColorGradient(0, clear(primary));
      ps.addColorGradient(0.25, primary);
      ps.addColorGradient(0.6, secondary);
      ps.addColorGradient(1, clear(secondary));
      if (s.effect === 'fireflies') {
        ps.minLifeTime = 2;
        ps.maxLifeTime = 4.5;
        ps.gravity = new Vector3(0, 0.05, 0);
      } else if (s.effect === 'sparkles') {
        ps.minLifeTime = 0.3;
        ps.maxLifeTime = 1.0;
        ps.addSizeGradient(0, size * 0.2);
        ps.addSizeGradient(0.4, size * 1.3);
        ps.addSizeGradient(1, 0);
      } else if (s.effect === 'motes') {
        ps.minLifeTime = 4;
        ps.maxLifeTime = 9;
        ps.gravity = new Vector3(0, 0.08, 0);
      } else {
        ps.minLifeTime = 3;
        ps.maxLifeTime = 6;
        ps.addSizeGradient(0, size * 0.6);
        ps.addSizeGradient(0.5, size * 1.1);
        ps.addSizeGradient(1, size * 0.6);
      }
      if (s.effect !== 'sparkles') {
        ps.minSize = size * 0.6;
        ps.maxSize = size * 1.4;
      }
      ps.emitRate = s.effectCount / ((ps.minLifeTime + ps.maxLifeTime) / 2);
    }
    ps.start();
  }

  private static configureFirework(
    scene: Scene,
    ps: ParticleSystem,
    s: LightSettings,
    primary: Color4,
    secondary: Color4,
    size: number,
    spread: number,
  ): void {
    const burst = ps.createSphereEmitter(0.15, 1);
    burst.directionRandomizer = 1;
    ps.emitRate = 0;
    ps.minEmitPower = spread * 0.9;
    ps.maxEmitPower = spread * 1.6;
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.7;
    ps.minSize = size;
    ps.maxSize = size * 1.8;
    ps.gravity = new Vector3(0, -spread * 0.9, 0);
    ps.updateSpeed = 0.016 * Math.max(0.2, s.effectSpeed);
    ps.color1 = primary;
    ps.color2 = secondary;
    ps.addColorGradient(0, new Color4(1, 1, 1, 1));
    ps.addColorGradient(0.2, primary);
    ps.addColorGradient(0.7, secondary);
    ps.addColorGradient(1, new Color4(secondary.r, secondary.g, secondary.b, 0));

    const intervalMs = 1700 / Math.max(0.2, s.effectSpeed);
    let sinceBurst = intervalMs;
    const observer = scene.onBeforeRenderObservable.add(() => {
      sinceBurst += scene.getEngine().getDeltaTime();
      if (sinceBurst >= intervalMs) {
        sinceBurst = 0;
        ps.manualEmitCount = s.effectCount;
      }
    });
    ps.onDisposeObservable.add(() => scene.onBeforeRenderObservable.remove(observer));
  }
}
