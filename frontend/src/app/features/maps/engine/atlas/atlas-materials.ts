import { Scene, ShaderMaterial, Vector3 } from '@babylonjs/core';
export function atlasTerrainMaterial(scene: Scene): ShaderMaterial {
  return new ShaderMaterial('atlas-terrain',scene,{
    vertexSource:`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec4 color;
      uniform mat4 worldViewProjection;uniform mat4 world;varying vec3 p;varying vec3 n;varying vec4 c;
      void main(){p=position;n=normal;c=color;gl_Position=worldViewProjection*vec4(position,1.);}`,
    fragmentSource:`precision highp float;varying vec3 p;varying vec3 n;varying vec4 c;
      uniform float sea;uniform float grid;uniform float relief;uniform vec3 eye;
      float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
      void main(){vec3 nn=normalize(vec3(n.x*1.8,n.y,n.z*1.8));float h=p.y/relief-sea;if(h<-.001)discard;float rock=smoothstep(.03,.35,1.-nn.y);
        float grain=noise(p.xz*3.)*.12+noise(p.xz*.65)*.15;
        vec3 base=c.rgb*(.87+grain);base=mix(base,vec3(.43,.42,.37),rock*.85);
        base=mix(vec3(.72,.66,.46),base,smoothstep(.004,.045,h));
        base=mix(base,vec3(.83,.87,.85),smoothstep(.59,.94,h+noise(p.xz*.18)*.12)*(1.-rock*.6));
        float light=.54+.46*max(0.,dot(nn,normalize(vec3(-.5,1.,-.7))));
        float line=1.-smoothstep(.025,.07,min(abs(fract(p.x/10.+.5)-.5),abs(fract(p.z/10.+.5)-.5)));
        base=mix(base,vec3(.14,.25,.21),line*grid*.4);
        float fog=1.-exp(-distance(eye,p)*.0005);gl_FragColor=vec4(mix(base*light,vec3(.19,.28,.29),fog),1.);}`,
  },{attributes:['position','normal','color'],uniforms:['worldViewProjection','world','sea','grid','relief','eye']});
}
const oceanNoise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.03)*.27+noise(p*4.07)*.13+noise(p*8.1)*.05;}`;
export function atlasOceanMaterial(scene: Scene): ShaderMaterial {
  const material=new ShaderMaterial('atlas-ocean',scene,{
    vertexSource:`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;uniform mat4 world;varying vec3 p;varying vec3 wp;void main(){p=position;wp=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}`,
    fragmentSource:`precision highp float;varying vec3 p;varying vec3 wp;uniform float time;uniform float sea;uniform float speed;uniform float waveScale;uniform vec3 eye;uniform sampler2D elevation;
      ${oceanNoise}
      float surface(vec2 q){return fbm(q+vec2(time*speed*.065,time*speed*.025))*.6+fbm(q*1.9+vec2(-time*speed*.035,time*speed*.045))*.4;}
      void main(){vec2 uv=p.xz/240.+.5;float ground=texture2D(elevation,uv).r*4.-1.;
        float depth=sea-ground;if(depth<.0003)discard;
        vec2 q=p.xz*waveScale;float w=surface(q);
        vec3 nn=normalize(vec3((surface(q+vec2(.10,0))-w)*.48,1.,(surface(q+vec2(0,.10))-w)*.48));
        vec3 view=normalize(eye-wp),sun=normalize(vec3(-.5,1.,-.7));
        float fres=pow(1.-max(0.,dot(view,nn)),4.);
        vec3 col=mix(vec3(.18,.42,.44),vec3(.065,.22,.29),smoothstep(0.,.22,depth));
        col=mix(col,vec3(.48,.60,.65),fres*.45);
        float sparkle=pow(max(0.,dot(reflect(-sun,nn),view)),100.);
        float foam=(1.-smoothstep(.001,.014,depth))*(.35+.35*noise(q*.55)+.3*sin(depth*520.-time*speed*.65+w*3.));
        col+=vec3(.72,.79,.78)*(sparkle*.25+foam*.4);col+=(w-.5)*.065;
        gl_FragColor=vec4(col,1.);}`,
  },{attributes:['position'],uniforms:['worldViewProjection','world','time','sea','speed','eye','waveScale'],samplers:['elevation']});
  material.backFaceCulling=false;material.setVector3('eye',Vector3.Zero());material.setFloat('waveScale',2);return material;
}
export function atlasCloudMaterial(scene:Scene):ShaderMaterial {
 const material=new ShaderMaterial('atlas-clouds',scene,{
 vertexSource:`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 p;void main(){p=position;gl_Position=worldViewProjection*vec4(position,1.);}`,
 fragmentSource:`precision highp float;varying vec3 p;uniform float time;${oceanNoise}
 void main(){vec2 uv=p.xz*.027+vec2(time*.0018,time*.0007);float f=fbm(uv+fbm(uv*.6)*2.);float fine=fbm(uv*3.2);float cloud=smoothstep(.49,.72,f*.8+fine*.2);float edge=1.-smoothstep(95.,120.,max(abs(p.x),abs(p.z)));gl_FragColor=vec4(mix(vec3(.70,.76,.77),vec3(.96,.97,.94),fine),cloud*.58*edge);}`
 },{attributes:['position'],uniforms:['worldViewProjection','time'],needAlphaBlending:true});
 material.backFaceCulling=false;material.disableDepthWrite=true;return material;
}
