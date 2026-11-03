import {
  Color3,
  Constants,
  Effect,
  Mesh,
  MeshBuilder,
  Quaternion,
  RenderTargetTexture,
  Scene,
  ShaderMaterial,
  TransformNode,
  Vector2,
  Vector3,
} from '@babylonjs/core';
import { ProjectileCoreShape, ProjectileElement } from '../projectile-core';
import { NATIVE_BLEND_FUNCTIONS, nativeBlendModes } from './native-materials';
import { NativePoint } from './native-frame';

export interface NativeProjectile3D {
  head: NativePoint;
  prev: NativePoint;
  radius: number;
  element: ProjectileElement;
  shape: ProjectileCoreShape;
  coreScale: number;
  coronaSize: number;
  spinSpeed: number;
  orbitCount: number;
  clock: number;
  progress: number;
  color: string;
  secondaryColor: string;
}

export interface Projectile3DRig {
  root: TransformNode;
  core: Mesh;
  corona: Mesh;
  ringA: Mesh;
  ringB: Mesh;
  satellites: Mesh[];
  shape: ProjectileCoreShape;
  coreMat: ShaderMaterial;
  coronaMat: ShaderMaterial;
}

const ELEMENT_INDEX: Record<ProjectileElement, number> = {
  fire: 0,
  ice: 1,
  snow: 2,
  eldritch: 3,
  lightning: 4,
  acid: 5,
  radiant: 6,
  shadow: 7,
};

let projShadersRegistered = false;

function registerProjectile3DShaders(): void {
  if (projShadersRegistered) return;
  projShadersRegistered = true;

  Effect.ShadersStore['lwProj3dVertexShader'] = `
    precision highp float;
    attribute vec3 position;
    attribute vec3 normal;
    attribute vec2 uv;
    uniform mat4 world;
    uniform mat4 worldViewProjection;
    uniform float uProjTime;
    uniform float uElementId;
    uniform float uIsCorona;
    varying vec3 vPosLocal;
    varying vec3 vPosWorld;
    varying vec3 vNormalW;
    varying vec2 vUV;

    float hash3(vec3 p) {
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    }

    void main() {
      vUV = uv;
      vPosLocal = position;
      float t = uProjTime * (uIsCorona > 0.5 ? 6.5 : 4.8);
      float wave = sin(position.x * 6.0 + t) * cos(position.y * 5.0 - t * 1.2) * sin(position.z * 6.0 + t * 0.8);
      float spike = sin(position.x * 13.0 - t * 2.2) * sin(position.z * 13.0 + t * 1.9);

      float disp = wave * (uIsCorona > 0.5 ? 0.16 : 0.08);
      if (uElementId > 0.5 && uElementId < 1.5) {
        // Ice: sharp crystalline facets
        disp = sign(wave) * pow(abs(wave), 0.6) * 0.09;
      } else if (uElementId >= 3.5 && uElementId < 4.5) {
        // Lightning: high-frequency electric spikes
        disp = spike * 0.18;
      }

      vec3 displaced = position + normal * disp;
      // Elongate trailing hemisphere (-y in local rig space) into a 3D teardrop/comet
      if (displaced.y < 0.0 && uIsCorona > 0.5) {
        displaced.y *= 1.45;
        displaced.xz *= max(0.25, 1.0 + displaced.y * 0.35);
      }

      vec4 wp = world * vec4(displaced, 1.0);
      vPosWorld = wp.xyz;
      vNormalW = normalize(mat3(world) * normal);
      gl_Position = worldViewProjection * vec4(displaced, 1.0);
    }
  `;

  Effect.ShadersStore['lwProj3dFragmentShader'] = `
    precision highp float;
    varying vec3 vPosLocal;
    varying vec3 vPosWorld;
    varying vec3 vNormalW;
    varying vec2 vUV;

    uniform vec3 uCameraPos;
    uniform vec3 uMainCol;
    uniform vec3 uCoreCol;
    uniform float uProjTime;
    uniform float uElementId;
    uniform float uIsCorona;
    uniform float uLayerAlpha;
    uniform float uBlend;
    uniform sampler2D uBackdrop;
    uniform vec2 uViewport;

    ${NATIVE_BLEND_FUNCTIONS}

    float hash(vec3 p) {
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    }
    float noise3(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash(i);
      float n100 = hash(i + vec3(1.0, 0.0, 0.0));
      float n010 = hash(i + vec3(0.0, 1.0, 0.0));
      float n110 = hash(i + vec3(1.0, 1.0, 0.0));
      float n001 = hash(i + vec3(0.0, 0.0, 1.0));
      float n101 = hash(i + vec3(1.0, 0.0, 1.0));
      float n011 = hash(i + vec3(0.0, 1.0, 1.0));
      float n111 = hash(i + vec3(1.0, 1.0, 1.0));
      float nx00 = mix(n000, n100, f.x);
      float nx10 = mix(n010, n110, f.x);
      float nx01 = mix(n001, n101, f.x);
      float nx11 = mix(n011, n111, f.x);
      float nxy0 = mix(nx00, nx10, f.y);
      float nxy1 = mix(nx01, nx11, f.y);
      return mix(nxy0, nxy1, f.z);
    }
    float fbm3(vec3 p) {
      return 0.55 * noise3(p) + 0.30 * noise3(p * 2.1 + 3.7) + 0.15 * noise3(p * 4.3 + 7.1);
    }

    void main() {
      vec3 viewDir = normalize(uCameraPos - vPosWorld);
      float ndv = abs(dot(normalize(vNormalW), viewDir));

      // 3D animated procedural flow in local & world space
      vec3 flowCoord = vPosLocal * 3.6 + vec3(0.0, uProjTime * 5.5, 0.0);
      float n = fbm3(flowCoord);
      float detail = fbm3(flowCoord * 2.3 - vec3(uProjTime * 3.2));

      // Volumetric density: dense hot core at center (ndv -> 1), soft transparent feather at edge (ndv -> 0)
      // This completely prevents the solid white/beige "egg" silhouette!
      float centerWeight = pow(ndv, uIsCorona > 0.5 ? 2.1 : 1.35);
      float edgeFeather = smoothstep(0.04, uIsCorona > 0.5 ? 0.65 : 0.42, ndv);
      float plasma = clamp(centerWeight * (0.55 + n * 0.75) + (detail - 0.45) * 0.35, 0.0, 1.0);

      vec3 col = mix(uMainCol * 0.85, uCoreCol, smoothstep(0.32, 0.88, plasma));
      float alpha = edgeFeather * clamp(plasma * (uIsCorona > 0.5 ? 0.62 : 0.95), 0.0, 1.0);

      if (uElementId > 0.5 && uElementId < 1.5) {
        // Ice: crystalline internal refraction + sharp glint
        float glint = pow(max(0.0, sin(vPosLocal.x * 14.0 + vPosLocal.z * 14.0 + n * 4.0)), 6.0);
        col = mix(uMainCol * 0.9, uCoreCol, clamp(centerWeight * 0.75 + glint * 0.65, 0.0, 1.0));
        alpha = smoothstep(0.08, 0.38, ndv) * (uIsCorona > 0.5 ? 0.48 : 0.88);
      } else if (uElementId >= 1.5 && uElementId < 2.5) {
        // Snow: soft swirling blizzard bands
        float swirl = smoothstep(0.25, 0.8, n);
        col = mix(uMainCol, uCoreCol, swirl * 0.75 + centerWeight * 0.35);
        alpha = edgeFeather * swirl * (uIsCorona > 0.5 ? 0.52 : 0.82);
      } else if (uElementId >= 2.5 && uElementId < 3.5) {
        // Eldritch: dark void center with bright crackling arcane filaments
        float filament = pow(max(0.0, 1.0 - abs(n - 0.5) * 3.2), 4.0);
        col = mix(uMainCol * 0.28, uCoreCol, clamp(filament * 0.9 + pow(ndv, 3.0) * 0.6, 0.0, 1.0));
        alpha = edgeFeather * clamp(0.35 + filament * 0.65, 0.0, 1.0) * (uIsCorona > 0.5 ? 0.58 : 0.92);
      } else if (uElementId >= 3.5 && uElementId < 4.5) {
        // Lightning: high-contrast electric arcs
        float arc = pow(max(0.0, 1.0 - abs(detail - 0.5) * 3.6), 5.0);
        col = mix(uMainCol, uCoreCol, clamp(arc + pow(ndv, 2.2), 0.0, 1.0));
        alpha = edgeFeather * clamp(centerWeight * 0.6 + arc * 0.85, 0.0, 1.0);
      } else if (uElementId >= 6.5) {
        // Shadow: dark abyss core with glowing umbral wisps
        float wisp = pow(n, 2.2);
        col = mix(vec3(0.03, 0.015, 0.06), uMainCol * 1.15, clamp((1.0 - centerWeight) * 0.85 + wisp * 0.45, 0.0, 1.0));
        alpha = edgeFeather * (uIsCorona > 0.5 ? 0.55 : 0.88);
      }

      gl_FragColor = finishLayer(vec4(col, alpha));
    }
  `;
}

function createCoreShapeMesh(name: string, shape: ProjectileCoreShape, scene: Scene): Mesh {
  switch (shape) {
    case 'lance':
      return MeshBuilder.CreateCylinder(
        name,
        { height: 2.1, diameterTop: 0.04, diameterBottom: 0.72, tessellation: 12, subdivisions: 4 },
        scene
      );
    case 'prism':
      return MeshBuilder.CreatePolyhedron(name, { type: 1, size: 0.58 }, scene);
    case 'star':
      return MeshBuilder.CreatePolyhedron(name, { type: 4, size: 0.62 }, scene);
    case 'comet':
      return MeshBuilder.CreateSphere(name, { diameter: 0.95, segments: 20 }, scene);
    case 'sphere':
    default:
      return MeshBuilder.CreateSphere(name, { diameter: 0.9, segments: 20 }, scene);
  }
}

function createProjectile3DMaterial(
  scene: Scene,
  owner: string,
  name: string,
  isCorona: boolean,
  getBlend: () => string,
  getBackdrop: () => RenderTargetTexture | undefined
): ShaderMaterial {
  registerProjectile3DShaders();
  const mat = new ShaderMaterial(
    `${owner}-${name}`,
    scene,
    { vertex: 'lwProj3d', fragment: 'lwProj3d' },
    {
      attributes: ['position', 'normal', 'uv'],
      uniforms: [
        'world',
        'worldViewProjection',
        'uCameraPos',
        'uMainCol',
        'uCoreCol',
        'uProjTime',
        'uElementId',
        'uIsCorona',
        'uLayerAlpha',
        'uBlend',
        'uViewport',
      ],
      samplers: ['uBackdrop'],
      needAlphaBlending: true,
    }
  );
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.alphaMode = Constants.ALPHA_COMBINE;

  mat.onBindObservable.add(() => {
    const eff = mat.getEffect();
    if (!eff) return;
    const meta = (mat as any).__projMeta ?? {
      time: 0,
      elementId: 0,
      alpha: 1,
      main: new Color3(1, 0.4, 0.1),
      core: new Color3(1, 0.95, 0.75),
    };
    const camPos = scene.activeCamera?.globalPosition ?? new Vector3(0, 15, 10);
    eff.setVector3('uCameraPos', camPos);
    eff.setFloat('uProjTime', meta.time);
    eff.setFloat('uElementId', meta.elementId);
    eff.setFloat('uIsCorona', isCorona ? 1 : 0);
    eff.setFloat('uLayerAlpha', meta.alpha);
    eff.setColor3('uMainCol', meta.main);
    eff.setColor3('uCoreCol', meta.core);
    const backdrop = getBackdrop();
    eff.setFloat('uBlend', backdrop ? Math.max(0, nativeBlendModes.indexOf(getBlend() as any)) : 0);
    eff.setVector2(
      'uViewport',
      new Vector2(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight())
    );
    if (backdrop) eff.setTexture('uBackdrop', backdrop);
  });

  return mat;
}

export function buildOrUpdateProjectileRig(
  scene: Scene,
  owner: string,
  parent: TransformNode,
  order: number,
  existing: Projectile3DRig | undefined,
  spec: NativeProjectile3D,
  worldPoint: (p: NativePoint) => Vector3,
  unit: number,
  layerAlpha: number,
  getBlend: () => string,
  getBackdrop: () => RenderTargetTexture | undefined
): Projectile3DRig {
  let rig = existing;
  if (rig && rig.shape !== spec.shape) {
    rig.core.dispose();
    rig.corona.dispose();
    rig.core = createCoreShapeMesh(`${owner}-proj-core`, spec.shape, scene);
    rig.corona = createCoreShapeMesh(`${owner}-proj-corona`, spec.shape, scene);
    rig.core.parent = rig.root;
    rig.corona.parent = rig.root;
    rig.core.material = rig.coreMat;
    rig.corona.material = rig.coronaMat;
    rig.core.isPickable = false;
    rig.corona.isPickable = false;
    rig.shape = spec.shape;
  }

  if (!rig) {
    const root = new TransformNode(`${owner}-proj3d-root`, scene);
    root.parent = parent;
    const coreMat = createProjectile3DMaterial(scene, owner, 'proj3d-core-mat', false, getBlend, getBackdrop);
    const coronaMat = createProjectile3DMaterial(scene, owner, 'proj3d-corona-mat', true, getBlend, getBackdrop);
    const core = createCoreShapeMesh(`${owner}-proj-core`, spec.shape, scene);
    const corona = createCoreShapeMesh(`${owner}-proj-corona`, spec.shape, scene);
    // Two intersecting 3D spinning energy rings/shells around the core for rich 3D parallax
    const ringA = MeshBuilder.CreateTorus(
      `${owner}-proj-ringA`,
      { diameter: 1.25, thickness: 0.14, tessellation: 24 },
      scene
    );
    const ringB = MeshBuilder.CreateTorus(
      `${owner}-proj-ringB`,
      { diameter: 1.15, thickness: 0.12, tessellation: 24 },
      scene
    );
    core.parent = root;
    corona.parent = root;
    ringA.parent = root;
    ringB.parent = root;
    core.material = coreMat;
    corona.material = coronaMat;
    ringA.material = coronaMat;
    ringB.material = coronaMat;
    core.isPickable = false;
    corona.isPickable = false;
    ringA.isPickable = false;
    ringB.isPickable = false;
    rig = {
      root,
      core,
      corona,
      ringA,
      ringB,
      satellites: [],
      shape: spec.shape,
      coreMat,
      coronaMat,
    };
  }

  const headPos = worldPoint(spec.head);
  const prevPos = worldPoint(spec.prev);
  const dir = headPos.subtract(prevPos);
  if (dir.lengthSquared() < 0.00001) {
    dir.set(1, 0, 0);
  } else {
    dir.normalize();
  }

  rig.root.setEnabled(true);
  rig.root.position.copyFrom(headPos);
  const orient = Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, new Quaternion());
  rig.root.rotationQuaternion = orient;

  const baseRadius = Math.max(0.12, (spec.radius / unit) * spec.coreScale * 0.72);
  const spin = spec.clock * spec.spinSpeed * 3.4;

  const mainCol = Color3.FromHexString(spec.color);
  const coreCol = Color3.FromHexString(spec.secondaryColor);
  const elementId = ELEMENT_INDEX[spec.element] ?? 0;

  (rig.coreMat as any).__projMeta = {
    time: spec.clock,
    elementId,
    alpha: layerAlpha,
    main: mainCol,
    core: coreCol,
  };
  (rig.coronaMat as any).__projMeta = {
    time: spec.clock * 1.35 + 1.7,
    elementId,
    alpha: layerAlpha * Math.min(1, spec.coronaSize * 0.72),
    main: mainCol,
    core: coreCol,
  };

  for (const m of [rig.core, rig.corona, rig.ringA, rig.ringB]) {
    m.metadata = { lwNativeOwner: owner, lwNativeOrder: order };
  }
  rig.core.alphaIndex = order * 10;
  rig.corona.alphaIndex = order * 10 + 1;
  rig.ringA.alphaIndex = order * 10 + 1;
  rig.ringB.alphaIndex = order * 10 + 1;

  const stretchY = spec.shape === 'lance' ? 1.5 : spec.shape === 'comet' ? 1.25 : 1.0;
  rig.core.scaling.set(baseRadius, baseRadius * stretchY, baseRadius);
  rig.core.rotation.set(spin * 0.35, spin, spin * 0.2);

  const coronaScale = Math.max(0, spec.coronaSize);
  rig.corona.setEnabled(coronaScale > 0.02);
  rig.ringA.setEnabled(coronaScale > 0.15);
  rig.ringB.setEnabled(coronaScale > 0.15);
  if (coronaScale > 0.02) {
    rig.corona.scaling.set(
      baseRadius * coronaScale * 1.15,
      baseRadius * stretchY * coronaScale * (spec.shape === 'comet' ? 1.45 : 1.15),
      baseRadius * coronaScale * 1.15
    );
    rig.corona.position.set(0, spec.shape === 'comet' ? -baseRadius * 0.18 : 0, 0);
    rig.corona.rotation.set(-spin * 0.5, -spin * 1.2, spin * 0.4);

    const ringScale = baseRadius * Math.min(1.25, 0.7 + coronaScale * 0.35);
    rig.ringA.scaling.set(ringScale, ringScale, ringScale);
    rig.ringA.rotation.set(Math.PI * 0.32 + spin * 0.9, spin * 1.4, spin * 0.5);
    rig.ringB.scaling.set(ringScale * 0.92, ringScale * 0.92, ringScale * 0.92);
    rig.ringB.rotation.set(-Math.PI * 0.32 - spin * 0.8, -spin * 1.1, spin * 0.7);
  }

  const satCount = Math.max(0, Math.min(6, Math.round(spec.orbitCount)));
  while (rig.satellites.length < satCount) {
    const sat = MeshBuilder.CreatePolyhedron(
      `${owner}-proj-sat-${rig.satellites.length}`,
      { type: 1, size: 0.2 },
      scene
    );
    sat.parent = rig.root;
    sat.material = rig.coreMat;
    sat.isPickable = false;
    rig.satellites.push(sat);
  }

  for (let i = 0; i < rig.satellites.length; i++) {
    const sat = rig.satellites[i];
    if (i >= satCount) {
      sat.setEnabled(false);
      continue;
    }
    sat.setEnabled(true);
    sat.metadata = { lwNativeOwner: owner, lwNativeOrder: order };
    sat.alphaIndex = order * 10 + 2;
    const angle = spin * 1.6 + (i * Math.PI * 2) / Math.max(1, satCount);
    const orbitR = baseRadius * (1.28 + (i % 2) * 0.25);
    const axialOffset = Math.sin(spin * 2 + i) * baseRadius * 0.3;
    sat.position.set(Math.cos(angle) * orbitR, axialOffset, Math.sin(angle) * orbitR);
    const satScale = baseRadius * (spec.element === 'ice' || spec.element === 'snow' ? 0.52 : 0.42);
    sat.scaling.set(satScale, satScale * (spec.element === 'ice' ? 1.75 : 1.15), satScale);
    sat.rotation.set(angle, spin * 2, i);
  }

  return rig;
}

export function disposeProjectileRigs(rigs: Projectile3DRig[]): void {
  for (const rig of rigs) {
    rig.root.dispose(false);
    rig.coreMat.dispose(true);
    rig.coronaMat.dispose(true);
  }
}
