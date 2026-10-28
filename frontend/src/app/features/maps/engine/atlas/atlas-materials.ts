import { Scene, ShaderMaterial, Vector3 } from '@babylonjs/core';
export function atlasTerrainMaterial(scene: Scene): ShaderMaterial {
  return new ShaderMaterial('atlas-terrain',scene,{
    vertexSource:`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec4 color;
      uniform mat4 worldViewProjection;varying vec3 p;varying vec3 n;varying vec4 c;
      void main(){p=position;n=normal;c=color;gl_Position=worldViewProjection*vec4(position,1.);}`,
    fragmentSource:`precision highp float;varying vec3 p;varying vec3 n;varying vec4 c;
      uniform float sea;uniform float grid;uniform float relief;uniform vec3 eye;
      float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
      void main(){vec3 nn=normalize(n);float h=p.y/relief-sea;if(h<-.001)discard;float rock=smoothstep(.18,.7,1.-nn.y);
        float grain=noise(p.xz*3.)*.12+noise(p.xz*.65)*.15;
        vec3 base=c.rgb*(.87+grain);base=mix(base,vec3(.43,.42,.37),rock*.85);
        base=mix(vec3(.72,.66,.46),base,smoothstep(.004,.045,h));
        base=mix(base,vec3(.83,.87,.85),smoothstep(.59,.94,h+noise(p.xz*.18)*.12)*(1.-rock*.6));
        float light=.39+.61*max(0.,dot(nn,normalize(vec3(-.5,1.,-.7))));
        float line=1.-smoothstep(.025,.07,min(abs(fract(p.x/10.+.5)-.5),abs(fract(p.z/10.+.5)-.5)));
        base=mix(base,vec3(.14,.25,.21),line*grid*.4);
        float fog=1.-exp(-distance(eye,p)*.0005);gl_FragColor=vec4(mix(base*light,vec3(.19,.28,.29),fog),1.);}`,
  },{attributes:['position','normal','color'],uniforms:['worldViewProjection','sea','grid','relief','eye']});
}
export function atlasOceanMaterial(scene: Scene): ShaderMaterial {
  const material=new ShaderMaterial('atlas-ocean',scene,{
    vertexSource:`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 p;void main(){p=position;gl_Position=worldViewProjection*vec4(position,1.);}`,
    fragmentSource:`precision highp float;varying vec3 p;uniform float time;uniform float sea;uniform float speed;
      uniform vec3 eye;uniform sampler2D elevation;
      float wave(vec2 q){return sin(q.x*1.3+sin(q.y*.9+time*.4))*cos(q.y*1.8+time*.6);}
      void main(){vec2 uv=p.xz/240.+.5;float ground=texture2D(elevation,uv).r*4.-1.;
        float depth=sea-ground;if(depth<.001)discard;
        vec2 q=p.xz*.7+vec2(time*speed*.28,time*speed*.13);
        float w=wave(q);vec3 nn=normalize(vec3(wave(q+vec2(.08,0))-w,.28,wave(q+vec2(0,.08))-w));
        vec3 view=normalize(eye-p);float fres=pow(1.-max(0.,dot(view,nn)),3.);
        vec3 col=mix(vec3(.10,.37,.38),vec3(.035,.16,.23),smoothstep(0.,.35,depth));
        col=mix(col,vec3(.48,.65,.69),fres*.65);
        float shine=pow(max(0.,dot(reflect(-normalize(vec3(-.5,1.,-.7)),nn),view)),60.);
        float foam=(1.-smoothstep(.003,.025,depth))*(.65+.35*sin(depth*700.-time*speed*1.8+w*2.));
        col+=vec3(.8,.86,.78)*(shine*.6+foam*.45);col+=w*.012;
        gl_FragColor=vec4(col,1.);}`,
  },{attributes:['position'],uniforms:['worldViewProjection','time','sea','speed','eye'],samplers:['elevation']});
  material.backFaceCulling=false;material.setVector3('eye',Vector3.Zero());return material;
}
