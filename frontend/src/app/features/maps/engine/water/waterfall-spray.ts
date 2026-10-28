import { Color4, ParticleSystem, RawTexture, Scene, Texture, Vector3 } from '@babylonjs/core';
import type { WaterProfile } from './water-profile';

export function createWaterfallSpray(scene: Scene, profile: WaterProfile): void {
  if (!profile.settings.spray || profile.settings.mode === 'pond') return;
  const falls = profile.samples.filter((p, i, all) => p.fall > .2 && (!i || all[i-1].fall <= .2));
  for (const [index, p] of falls.slice(0, Math.max(0, Math.min(6,8-scene.particleSystems.filter(p=>p.name.startsWith('lw-water-spray-')).length))).entries()) {
    const below = profile.samples.find(s => s.distance > p.distance + .5 && s.fall === 0)
      ?? profile.samples[profile.samples.length - 1];
    const system = new ParticleSystem(`lw-water-spray-${profile.id}-${index}`, 160, scene);
    const pixels = new Uint8Array(16*16*4);
    for (let y=0;y<16;y++) for (let x=0;x<16;x++) {
      const i=(y*16+x)*4, alpha=Math.max(0,1-Math.hypot((x-7.5)/7.5,(y-7.5)/7.5));
      pixels[i]=pixels[i+1]=pixels[i+2]=255; pixels[i+3]=Math.round(alpha*alpha*255);
    }
    system.particleTexture = RawTexture.CreateRGBATexture(pixels,16,16,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
    system.emitter = new Vector3(below.x,below.level+.08,below.z);
    system.minEmitBox = new Vector3(-profile.settings.width*.2,0,-.15);
    system.maxEmitBox = new Vector3(profile.settings.width*.2,.1,.15);
    system.direction1 = new Vector3(-.4,.6,-.4); system.direction2 = new Vector3(.4,1.2,.4);
    system.color1 = new Color4(.8,.94,1,.25); system.color2 = new Color4(1,1,1,.4);
    system.colorDead = new Color4(.8,.94,1,0);
    system.minSize = .04; system.maxSize = .2;
    system.minLifeTime = .3; system.maxLifeTime = 1;
    system.emitRate = profile.settings.spray*100;
    system.minEmitPower = .4; system.maxEmitPower = 1.4;
    system.gravity = new Vector3(0,-1.5,0); system.updateSpeed = .015;
    system.start();
  }
}
