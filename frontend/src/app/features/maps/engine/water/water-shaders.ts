export const WATER_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 waterData;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float time;
uniform float waveHeight;
uniform float flowSpeed;
uniform float waveScale;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vWater;
varying vec4 vClip;
void main() {
  vec3 p = position;
  float wave = sin(p.x * waveScale + time * .8) * cos(p.z * waveScale * .72 - time * .65);
  p.y += wave * waveHeight * waterData.x * (1.0 - waterData.y);
  vWorld = (world * vec4(p, 1.0)).xyz;
  vNormal = normalize(mat3(world) * normal);
  vUV = uv; vWater = waterData;
  vClip = worldViewProjection * vec4(p, 1.0);
  gl_Position = vClip;
}`;

export const WATER_FRAGMENT = `
precision highp float;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vWater;
varying vec4 vClip;
uniform float time;
uniform float flowSpeed;
uniform float waveScale;
uniform float intensity;
uniform float foam;
uniform float opacity;
uniform float reflectivity;
uniform float refraction;
uniform float width;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform vec3 cameraPosition;
uniform vec3 lightDirection;
uniform vec3 lightColor;
uniform sampler2D sceneColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
float waves(vec2 p) { return noise(p)*.57 + noise(p*2.17+7.1)*.28 + noise(p*4.31-3.2)*.15; }
void main() {
  float fall = vWater.y;
  vec2 coord = mix(vWorld.xz, vec2(vUV.x * width, vUV.y), vWater.z);
  float speed = flowSpeed * mix(1.0, 2.8, fall);
  vec2 p = coord * waveScale;
  p.y -= time * speed;
  p.x += sin(p.y*.6+time*.4) * intensity*.15;
  float n = waves(p), nx = waves(p+vec2(.07,0.)), nz = waves(p+vec2(0.,.07));
  vec3 N = normalize(vNormal + vec3((n-nx)*intensity*7.0, 0., (n-nz)*intensity*7.0));
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N,V) < 0.) N = -N;
  float fresnel = pow(1.0-max(dot(N,V),0.),4.0);
  float depth = clamp(vWater.x,0.,1.);
  vec3 water = mix(shallowColor,deepColor,sqrt(depth)*.85);
  vec2 screenUV = vClip.xy/vClip.w*.5+.5;
  vec2 distortion = N.xz * refraction * .025 * depth;
  vec3 refracted = texture2D(sceneColor,clamp(screenUV+distortion,vec2(.002),vec2(.998))).rgb;
  water = mix(water,refracted * mix(vec3(1.), shallowColor*1.8,depth*.35), refraction*2.0);
  vec3 L = normalize(lightDirection);
  float diffuse = .45 + .55*max(dot(N,L),0.);
  vec3 reflected = mix(vec3(.17,.29,.36),vec3(.56,.73,.8),clamp(N.y,0.,1.));
  reflected *= max(vec3(.15),lightColor);
  vec3 color = water * diffuse * max(vec3(.15),lightColor);
  color = mix(color,reflected,reflectivity*(.12+fresnel*.8));
  float spec = pow(max(dot(N,normalize(L+V)),0.),mix(160.,32.,clamp(intensity*.4,0.,1.)));
  color += lightColor * spec * reflectivity * 1.4;
  float shore = (1.0-smoothstep(.02,.4,depth)) * (.35+.65*noise(coord*5.-time*.25));
  float streak = smoothstep(.52,.85,waves(vec2(p.x*2.8,p.y*.25)));
  float rapids = max(fall*.8,clamp(intensity-1.,0.,1.)*.5)*streak;
  float whitewater = clamp((shore + rapids)*foam,0.,.9);
  color = mix(color,vec3(.82,.94,.96)*max(vec3(.35),lightColor),whitewater);
  float edge = smoothstep(0.,.08,depth);
  gl_FragColor = vec4(color,edge * clamp(opacity + fresnel*.12 + whitewater*.1,.0,1.));
}`;
