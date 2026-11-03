import { Constants, Effect, RenderTargetTexture, Scene, ShaderMaterial, Texture, Vector2 } from '@babylonjs/core';
import { EffectBlendMode } from '../effect-definition';
import { ARCANE_FRAGMENT, CINEMATIC_FRAGMENT, FIRE_FRAGMENT } from './native-shaders';

const vertex = `precision highp float;
 attribute vec3 position; attribute vec2 uv; attribute vec4 color;
 uniform mat4 worldViewProjection; varying vec2 vUV; varying vec4 vColor;
 void main(){vUV=uv;vColor=color;gl_Position=worldViewProjection*vec4(position,1.0);}`;

const blend = `
 uniform float uLayerAlpha; uniform float uBlend; uniform sampler2D uBackdrop; uniform vec2 uViewport;
 vec3 blendColor(vec3 b,vec3 s){
  if(uBlend<.5)return s;
  if(uBlend<1.5)return b+s;
  if(uBlend<2.5)return 1.0-(1.0-b)*(1.0-s);
  if(uBlend<3.5)return b*s;
  if(uBlend<4.5)return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(.5),b));
  if(uBlend<5.5){vec3 d=mix(((16.0*b-12.0)*b+4.0)*b,sqrt(max(b,vec3(0.0))),step(vec3(.25),b));return mix(b-(1.0-2.0*s)*b*(1.0-b),b+(2.0*s-1.0)*(d-b),step(vec3(.5),s));}
  if(uBlend<6.5)return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(.5),s));
  if(uBlend<7.5)return min(b,s);
  if(uBlend<8.5)return max(b,s);
  return abs(b-s);
 }
 vec4 finishLayer(vec4 c){
  c.a=clamp(c.a*uLayerAlpha,0.0,1.0);
  if(uBlend>.5){vec3 back=texture2D(uBackdrop,gl_FragCoord.xy/uViewport).rgb;c.rgb=blendColor(back,c.rgb);}
  else if(uBlend<-.5){vec3 s=1.0-exp(-max(c.rgb,vec3(0.0))*1.15);c.rgb=s*c.a;}
  return c;
 }
`;

export const NATIVE_BLEND_FUNCTIONS = blend.replace(/uniform[^;]+;/g, '');

const particle = `precision highp float; varying vec2 vUV; varying vec4 vColor; uniform vec3 uMain; uniform vec3 uCore; uniform float uClock;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
 float fbm(vec2 p){return noise(p)*.55+noise(p*2.15+vec2(3.7,1.4))*.3+noise(p*4.4-vec2(1.9,5.1))*.15;}
 void main(){
  float tile=floor(vUV.x/2.0);
  vec2 p=vec2(fract(vUV.x/2.0)*2.0-1.0,vUV.y*2.0-1.0);
  float r=length(p),a=0.0,coreMix=0.0;
  if(tile<.5){
   // Tile 0: Volumetric Lit Smoke Plume
   float n=fbm(p*2.6+vec2(uClock*.28,-uClock*.35));
   float billow=fbm(p*5.2-vec2(uClock*.2,uClock*.4));
   float shape=max(0.0,1.0-r*1.05+(n-.5)*.48);
   a=pow(shape,1.45)*smoothstep(.12,.78,n*.7+billow*.3);
   coreMix=clamp((1.0-r)*billow*.42,0.0,0.45);
  }
  else if(tile<1.5){
   // Tile 1: Hot Plasma Core Orb
   float corona=fbm(p*3.8+uClock*1.9);
   float glow=exp(-dot(p,p)*4.2)*(0.75+0.45*corona);
   a=clamp(glow*max(0.0,1.0-r*.92),0.0,1.0);
   coreMix=clamp(exp(-dot(p,p)*7.5)+corona*.25,0.0,1.0);
  }
  else if(tile<2.5){
   // Tile 2: Ballistic Ember Spark Streak
   float headY=p.y-0.22;
   float streak=exp(-(p.x*p.x*32.0*(1.4-p.y*0.45)+p.y*p.y*3.8));
   float hotHead=exp(-(p.x*p.x*22.0+headY*headY*14.0));
   float flicker=0.78+0.22*noise(vec2(p.y*6.0-uClock*16.0,uClock*5.0));
   a=clamp((streak*0.85+hotHead*0.95)*flicker*max(0.0,1.0-r*0.95),0.0,1.0);
   coreMix=clamp(hotHead*1.15+streak*0.45,0.0,1.0);
  }
  else if(tile<3.5){
   // Tile 3: Expanding Supersonic Shock Ring
   float warp=noise(p*5.4+uClock*2.2)*.14;
   float ringDist=abs(r-0.62+warp);
   float ring=exp(-ringDist*ringDist*42.0);
   float inner=exp(-dot(p,p)*5.5)*0.35;
   a=clamp((ring+inner)*max(0.0,1.0-r*0.98),0.0,1.0);
   coreMix=clamp(ring*0.85,0.0,1.0);
  }
  else if(tile<4.5){
   // Tile 4: Multi-Tongue Animated Flame Wisp (Trapcode Particular Flame Sprite)
   float ang=atan(p.y,p.x);
   float adv=fbm(p*3.4+vec2(sin(ang*3.0)*0.4, -uClock*4.2));
   float detail=noise(p*7.8+vec2(uClock*2.5,-uClock*6.5));
   float lobes=0.18*sin(ang*5.0+uClock*4.0+adv*4.2)+0.1*cos(ang*8.0-uClock*5.5);
   float flameR=r*(0.92-0.16*p.y)+lobes-(adv-0.48)*0.42;
   float body=max(0.0,1.0-flameR*1.08);
   a=pow(body,1.35)*smoothstep(0.08,0.68,adv*0.65+detail*0.35+body*0.45);
   coreMix=clamp(pow(max(0.0,1.0-flameR*1.35),1.8)*0.92+detail*0.2,0.0,1.0);
  }
  else if(tile<5.5){
   // Tile 5: Faceted Crystal / Ice Shard
   float facet=abs(p.x)*0.82+abs(p.y)*0.44;
   float internal=noise(p*9.0+vec2(1.7,3.1))*0.18;
   float edge=1.0-smoothstep(0.28,0.52,facet-internal*0.3);
   float spec=exp(-(p.x*p.x*48.0+p.y*p.y*12.0));
   a=clamp((edge*0.88+spec*0.6)*max(0.0,1.0-r),0.0,1.0);
   coreMix=clamp(spec+internal*0.7,0.0,1.0);
  }
  else if(tile<6.5){
   // Tile 6: Celestial Star Flare (Anamorphic 4+4 Ray Star)
   float rayMain=exp(-abs(p.x)*10.5)*exp(-abs(p.y)*2.1)+exp(-abs(p.y)*10.5)*exp(-abs(p.x)*2.1);
   vec2 rotP=vec2(p.x*0.7071-p.y*0.7071,p.x*0.7071+p.y*0.7071);
   float rayDiag=(exp(-abs(rotP.x)*14.0)*exp(-abs(rotP.y)*3.2)+exp(-abs(rotP.y)*14.0)*exp(-abs(rotP.x)*3.2))*0.55;
   float core=exp(-dot(p,p)*9.0);
   a=clamp((rayMain*0.75+rayDiag+core)*max(0.0,1.0-r*0.95),0.0,1.0);
   coreMix=clamp(core*1.1+rayMain*0.45,0.0,1.0);
  }
  else if(tile<7.5){
   // Tile 7: Crackling Electric Arc Filament
   float jolt=(noise(vec2(p.y*8.5+uClock*14.0,uClock*6.0))-0.5)*0.34;
   float bolt=exp(-abs(p.x-jolt)*18.0)*max(0.0,1.0-abs(p.y)*0.95);
   float branch=exp(-abs(p.x+jolt*1.3-p.y*0.35)*24.0)*max(0.0,0.75-abs(p.y));
   a=clamp((bolt+branch*0.7)*max(0.0,1.0-r*0.96),0.0,1.0);
   coreMix=clamp(bolt*0.95,0.0,1.0);
  }
  else {
   // Tile 8: Molten Magma Slag Glob
   float crust=fbm(p*4.5+vec2(uClock*0.9,-uClock*1.2));
   float blob=max(0.0,1.0-r*1.1+(crust-0.5)*0.36);
   float veins=smoothstep(0.42,0.78,crust);
   a=smoothstep(0.08,0.45,blob)*max(0.0,1.0-r*0.96);
   coreMix=clamp(veins*0.92+exp(-dot(p,p)*6.0)*0.45,0.0,1.0);
  }
  vec3 tint=mix(vColor.rgb,uCore,coreMix);
  gl_FragColor=vec4(tint,a*vColor.a);
 }`;

const ribbon = `precision highp float;varying vec2 vUV;varying vec4 vColor;uniform vec3 uMain;uniform vec3 uCore;uniform float uClock;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
 void main(){
  float curl=sin(vUV.x*22.0-uClock*14.0)*.12;
  float d=abs(vUV.y*2.0-1.0+curl);
  float n=noise(vec2(vUV.x*16.0-uClock*9.0,vUV.y*8.0));
  float edge=pow(max(0.0,1.0-d-n*.15),1.35)*smoothstep(0.0,0.08,vUV.x);
  float hot=exp(-d*d*38.0);
  float strands=.72+.28*sin(vUV.x*95.0-uClock*18.0+n*4.0);
  vec3 col=mix(vColor.rgb,uCore,clamp(hot*.85,0.0,1.0));
  gl_FragColor=vec4(col,edge*(.65+strands*.35)*vColor.a);
 }`;

const barrier = `precision highp float;varying vec2 vUV;uniform vec3 uMain;uniform vec3 uCore;uniform float uClock;uniform float uVariant;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
 void main(){vec2 p=vUV;float n=noise(p*vec2(16.,8.)+vec2(0.,-uClock*2.));float detail=noise(p*40.+n*2.);float edge=smoothstep(0.,.035,p.x)*smoothstep(0.,.035,1.-p.x)*smoothstep(0.,.035,p.y)*smoothstep(0.,.06,1.-p.y);float a=.2+n*.4,hot=pow(detail,5.);
 if(uVariant<.5){vec2 cell=abs(fract(p*vec2(14.,6.))-.5);hot+=pow(max(cell.x,cell.y)*2.,18.);}
 else if(uVariant<1.5){a=smoothstep(.1,.8,n+(1.-p.y)*.65)*edge;hot=pow(max(0.,1.-p.y+n*.4),3.);}
 else if(uVariant<2.5){hot+=pow(1.-abs(sin(p.x*90.+p.y*43.+n*2.)),20.);a=.5+detail*.3;}
 else if(uVariant<3.5){a=pow(max(0.,1.-abs(sin(p.x*39.+sin(p.y*9.)*3.))),5.);hot=a*.4;}
 else {vec2 brick=fract(p*vec2(12.,5.)+vec2(step(.5,fract(p.y*5.))*.5,0.));float seam=step(.04,brick.x)*step(.04,brick.y);a=.85;hot=seam*.15+detail*.1;}
 gl_FragColor=vec4(mix(uMain*(.4+detail*.6),uCore,clamp(hot,0.,1.)),a*edge);}`;

let registered = false;
function register() {
  if (registered) return;
  registered = true;
  for (const [name, fragment] of Object.entries({
    fire: FIRE_FRAGMENT,
    cinematic: CINEMATIC_FRAGMENT,
    arcane: ARCANE_FRAGMENT,
    particle,
    ribbon,
    barrier,
  })) {
    Effect.ShadersStore['lwNative' + name + 'VertexShader'] = vertex;
    const source = fragment.replace(/gl_FragColor\s*=\s*([^;]+);/g, 'gl_FragColor = finishLayer($1);');
    Effect.ShadersStore['lwNative' + name + 'FragmentShader'] = source.replace('void main()', blend + '\nvoid main()');
  }
}

export const nativeBlendModes: EffectBlendMode[] = [
  'normal',
  'add',
  'screen',
  'multiply',
  'overlay',
  'soft-light',
  'hard-light',
  'darken',
  'lighten',
  'difference',
];

export function createNativeMaterial(
  scene: Scene,
  family: 'fire' | 'arcane' | 'cinematic' | 'particle' | 'ribbon' | 'barrier',
  name: string
): ShaderMaterial {
  register();
  const m = new ShaderMaterial(
    name,
    scene,
    { vertex: 'lwNative' + family, fragment: 'lwNative' + family },
    {
      attributes: ['position', 'uv', 'color'],
      uniforms: [
        'worldViewProjection',
        'uLayerAlpha',
        'uBlend',
        'uViewport',
        'uMain',
        'uCore',
        'uClock',
        'uProgress',
        'uMode',
        'uVariant',
        'uStrength',
        'uTime',
        'uStyle',
        'uElement',
        'uTurbulence',
        'uAlpha',
        'uColor',
        'uBloom',
        'uDistortion',
        'uScorch',
        'uSeed',
        'uSmoke',
        'uLight',
        'uShadow',
        'uEmbers',
        'uFlame',
        'uSmokeColor',
      ],
      samplers: ['uBackdrop'],
      needAlphaBlending: true,
    }
  );
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  m.alphaMode = Constants.ALPHA_COMBINE;
  m.setFloat('uLayerAlpha', 1);
  m.setFloat('uBlend', 0);
  m.setVector2('uViewport', new Vector2(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight()));
  m.onBindObservable.add(() =>
    m.getEffect()?.setVector2('uViewport', new Vector2(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight()))
  );
  return m;
}

/** Artistic blends snapshot the scene plus preceding effect layers. They retain depth-tested
 * world meshes; no canvas texture or Pixi overlay is used. Allocated only when requested. */
export function createBlendBackdrop(scene: Scene, id: string, order: number, owner: string): RenderTargetTexture {
  const engine = scene.getEngine(),
    scale = Math.min(1, 1024 / Math.max(engine.getRenderWidth(), engine.getRenderHeight()));
  const r = new RenderTargetTexture(
    'lw-blend-' + id,
    {
      width: Math.max(1, Math.round(engine.getRenderWidth() * scale)),
      height: Math.max(1, Math.round(engine.getRenderHeight() * scale)),
    },
    scene,
    false,
    true,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    true
  );
  r.renderListPredicate = (mesh) => {
    const meta = mesh.metadata;
    return meta?.lwNativeOwner !== owner || meta.lwNativeOrder < order;
  };
  r.ignoreCameraViewport = true;
  scene.customRenderTargets.push(r);
  return r;
}
