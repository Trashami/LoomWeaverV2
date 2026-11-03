export const WATER_VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 waterData;
attribute vec4 waterFlow;
attribute vec4 waterShallow;
attribute vec4 waterDeep;
attribute vec4 waterStyle;
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
varying vec4 vFlow;
varying vec4 vShallow;
varying vec4 vDeep;
varying vec4 vStyle;
void main() {
  vec3 p = position;
  float animSpeed = max(0.18, waterFlow.z * 0.75 + 0.25);
  float wave = sin(p.x * waterStyle.z + time * animSpeed) * cos(p.z * waterStyle.z * .72 - time * animSpeed * .82);
  p.y += wave * waterStyle.w * waterData.x * (1.0 - waterData.y * 0.65);
  vWorld = (world * vec4(p, 1.0)).xyz;
  vNormal = normalize(mat3(world) * normal);
  vUV = uv; vWater = waterData;
  vFlow = waterFlow; vShallow = waterShallow; vDeep = waterDeep; vStyle = waterStyle;
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
varying vec4 vFlow;
varying vec4 vShallow;
varying vec4 vDeep;
varying vec4 vStyle;
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
uniform float lwFogActive;
uniform sampler2D lwFogTex;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
}
float waves(vec2 p) { return noise(p)*.57 + noise(p*2.17+7.1)*.28 + noise(p*4.31-3.2)*.15; }
void main() {
  float fall = clamp(vWater.y, 0.0, 1.0);
  vec2 direction = normalize(vFlow.xy + vec2(.00001));
  vec2 flowing = vec2(dot(vWorld.xz, vec2(-direction.y, direction.x)), dot(vWorld.xz, direction));
  vec2 coord = mix(vWorld.xz, flowing, vWater.z);
  float isFlowing = step(0.02, vFlow.z);
  float speed = vFlow.z * mix(1.0, 5.2, fall);
  vec2 p = coord * vStyle.z;
  p.y -= time * speed;
  // Gentle ambient ripple drift when water is a still pond (speed == 0)
  p += (1.0 - isFlowing) * vec2(sin(time * 0.28 + coord.y * 0.7), cos(time * 0.22 + coord.x * 0.7)) * 0.14;
  p.x += sin(p.y * .6 + time * (.2 + speed * .25)) * vStyle.x * .15;
  p.y *= mix(1.0, .38, fall);
  float roughness = vStyle.x * (1.0 + fall * 2.1);
  float n = waves(p), nx = waves(p + vec2(.07, 0.)), nz = waves(p + vec2(0., .07));
  vec3 N = normalize(vNormal + vec3((n - nx) * roughness * 4.2, 0., (n - nz) * roughness * 4.2));
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.) N = -N;
  float fresnel = pow(1.0 - max(dot(N, V), 0.), 3.6);
  float depth = clamp(vWater.x, 0., 1.);
  vec3 water = mix(vShallow.rgb, vDeep.rgb, sqrt(depth) * .85);

  // Procedural river-bed caustic refraction
  float causticWave = waves(p * 1.45 + N.xz * 2.4);
  vec3 bedRefracted = mix(vDeep.rgb * 0.78, vShallow.rgb * 1.32, smoothstep(0.32, 0.78, causticWave));
  water = mix(water, bedRefracted, clamp(vFlow.w * 0.45 * (1.0 - depth * 0.35), 0.0, 0.55));

  vec3 L = normalize(lightDirection);
  float diffuse = .52 + .48 * max(dot(N, L), 0.);
  vec3 reflected = mix(vec3(.19, .34, .42), vec3(.62, .80, .88), clamp(N.y, 0., 1.));
  reflected *= max(vec3(.35), lightColor);
  vec3 color = water * diffuse * max(vec3(.45), lightColor);
  color = mix(color, reflected, vDeep.a * (.14 + fresnel * .75));
  float spec = pow(max(dot(N, normalize(L + V)), 0.), mix(160., 32., clamp(vStyle.x * .4, 0., 1.)));
  color += lightColor * spec * vDeep.a * 1.35;

  // Shoreline, Rapids & Waterfall Curtain Whitewater
  float shore = (1.0 - smoothstep(.02, .38, depth)) * (.14 + .36 * noise(coord * 5. - time * (.08 + speed * .15)));
  float streak = smoothstep(.38, .76, waves(vec2(p.x * 3.2, p.y * .28)));
  float fallCurtain = fall * (0.42 + 0.58 * smoothstep(0.35, 0.78, waves(vec2(p.x * 4.5, p.y * 0.18 - time * 1.8))));
  float currentRapids = isFlowing * clamp((vStyle.x - 0.85) * 0.9, 0., 1.) * streak * (0.45 + 0.55 * vStyle.y);
  float rapids = max(fallCurtain, currentRapids);
  float whitewater = clamp((shore * vStyle.y + rapids * max(0.45, vStyle.y)), 0., .94);
  color = mix(color, vec3(.88, .96, .99) * max(vec3(.55), lightColor), whitewater);

  float edge = smoothstep(0., .12, depth);
  gl_FragColor = vec4(color, edge * clamp(vShallow.a + fresnel * .14 + whitewater * .15, .0, 1.));
  if (lwFogActive > 0.5) {
    vec2 lwFogUv = vec2((vWorld.x + 18.0) / 36.0, 1.0 - (vWorld.z + 13.5) / 27.0);
    float lwFogOut = step(lwFogUv.x, 0.0) + step(1.0, lwFogUv.x) + step(lwFogUv.y, 0.0) + step(1.0, lwFogUv.y);
    float lwFogAlpha = lwFogOut > 0.0 ? 1.0 : texture2D(lwFogTex, clamp(lwFogUv, vec2(0.001, 0.001), vec2(0.999, 0.999))).a;
    if (lwFogAlpha > 0.68) {
      discard;
    }
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.012, 0.031, 0.024), clamp(lwFogAlpha, 0.0, 1.0));
    gl_FragColor.a *= clamp(1.0 - lwFogAlpha * 1.45, 0.0, 1.0);
  }
}`;
