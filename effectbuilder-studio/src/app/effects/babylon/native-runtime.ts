import {
  Color3,
  Color4,
  Constants,
  Effect,
  Mesh,
  MeshBuilder,
  PointLight,
  Quaternion,
  Scene,
  ShaderMaterial,
  StandardMaterial,
  TransformNode,
  Vector2,
  Vector3,
  VertexData,
  RenderTargetTexture,
} from '@babylonjs/core';
import { CustomMaterial } from '@babylonjs/materials/custom/customMaterial.js';
import {
  EffectDefinition,
  EffectLayer,
  effectDuration,
  parseEffect,
  createLayer,
  defaultScene,
} from '../effect-definition';
import { EffectWorld, FxPoint } from '../fireball-motion';
import { spellLights } from '../spell-lights';
import { evaluateNativeEffect, NativeLayerFrame, NativePoint } from './native-frame';
import {
  createBlendBackdrop,
  createNativeMaterial,
  nativeBlendModes,
  NATIVE_BLEND_FUNCTIONS,
} from './native-materials';
import {
  buildOrUpdateProjectileRig,
  disposeProjectileRigs,
  Projectile3DRig,
} from './projectile-3d-mesh';

interface LayerResources {
  root: TransformNode;
  particles: Mesh;
  ribbons: Mesh;
  fields: Mesh[];
  projectiles: Projectile3DRig[];
  materials: Map<string, ShaderMaterial>;
  backdrop?: RenderTargetTexture;
  blend: string;
  hand?: TransformNode;
  handMaterial?: StandardMaterial;
  vine?: Mesh;
  thorns?: Mesh[];
  vineMaterial?: StandardMaterial;
  thornMaterial?: StandardMaterial;
}

export interface NativeWorldOptions {
  pixelsPerUnit?: number;
  scale?: number;
  elevationAt?: (x: number, z: number) => number;
  lightGain?: number;
  timeScale?: number;
}

const color = (hex: string) => Color3.FromHexString(hex);
const ownerId = () => 'eb-native-' + Math.random().toString(36).slice(2);
const sceneSpellLightPool = new WeakMap<Scene, PointLight[]>();

/**
 * Ensures 4 permanent spell PointLights exist on `scene` at intensity=0 when idle.
 * Because the light count on the scene never changes when a spell starts or ends,
 * Babylon never recompiles ground, wall, or token shaders mid-combat.
 */
export function ensureSceneSpellLightPool(scene: Scene): PointLight[] {
  let pool = sceneSpellLightPool.get(scene);
  if (pool && pool.length === 4 && pool.every((l) => !l.isDisposed())) {
    return pool;
  }
  pool = [];
  for (let i = 0; i < 4; i++) {
    const light = new PointLight(`lw-vtt-spell-light-pool-${i}`, new Vector3(0, -100, 0), scene);
    light.intensity = 0;
    light.range = 0.1;
    light.diffuse = Color3.Black();
    light.specular = Color3.Black();
    light.setEnabled(true);
    pool.push(light);
  }
  sceneSpellLightPool.set(scene, pool);
  return pool;
}

/** Pre-compiles the core EffectBuilder shader families on `scene` so the first spell cast never stutters. */
export function prewarmNativeEffectShaders(scene: Scene): void {
  ensureSceneSpellLightPool(scene);
  const families: ('particle' | 'ribbon' | 'fire' | 'arcane' | 'cinematic' | 'barrier')[] = [
    'particle',
    'ribbon',
    'fire',
    'arcane',
    'cinematic',
    'barrier',
  ];
  for (const fam of families) {
    const m = createNativeMaterial(scene, fam, `lw-prewarm-${fam}`);
    m.dispose(false, false);
  }
}

/** Host-scene runtime. Owns only its meshes, materials, targets and pooled point lights. */
export class BabylonEffectRuntime {
  readonly owner = ownerId();
  private layers = new Map<string, LayerResources>();
  private lights: PointLight[] = [];
  private disposed = false;

  constructor(
    readonly scene: Scene,
    readonly options: NativeWorldOptions = {}
  ) {
    this.lights = ensureSceneSpellLightPool(scene);
  }

  private toWorld(p: NativePoint, from: FxPoint, to: FxPoint, sourceY = 0, targetY = 0): Vector3 {
    const unit = this.options.pixelsPerUnit ?? 66,
      dx = to.x - from.x,
      dy = to.y - from.y,
      t = Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / Math.max(1, dx * dx + dy * dy))),
      x = p.x / unit,
      z = p.y / unit;
    return new Vector3(
      x,
      (this.options.elevationAt?.(x, z) ?? sourceY + (targetY - sourceY) * t) + p.height / unit,
      z
    );
  }

  private mesh(name: string, root: TransformNode, order: number): Mesh {
    const m = new Mesh(this.owner + '-' + name, this.scene);
    m.parent = root;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = true;
    m.metadata = { lwNativeOwner: this.owner, lwNativeOrder: order };
    m.alphaIndex = order * 10;
    m.hasVertexAlpha = true;
    return m;
  }

  private resource(l: EffectLayer, order: number): LayerResources {
    let r = this.layers.get(l.id);
    if (!r) {
      const root = new TransformNode(this.owner + '-' + l.id, this.scene);
      r = {
        root,
        particles: this.mesh('particles', root, order),
        ribbons: this.mesh('ribbons', root, order),
        fields: [],
        projectiles: [],
        materials: new Map(),
        blend: '',
      };
      this.layers.set(l.id, r);
    }
    for (const m of r.root.getChildMeshes()) {
      m.metadata = { ...(m.metadata ?? {}), lwNativeOwner: this.owner, lwNativeOrder: order };
      m.alphaIndex = order * 10;
    }
    if (r.blend !== l.blendMode) {
      r.backdrop?.dispose();
      r.backdrop = undefined;
      r.blend = l.blendMode;
    }
    const needsCustomBackdrop =
      l.blendMode === 'overlay' ||
      l.blendMode === 'soft-light' ||
      l.blendMode === 'hard-light' ||
      l.blendMode === 'darken' ||
      l.blendMode === 'difference';
    if (needsCustomBackdrop && !r.backdrop)
      r.backdrop = createBlendBackdrop(this.scene, l.id, order, this.owner);
    if (r.backdrop)
      r.backdrop.renderListPredicate = (m) =>
        m.metadata?.lwNativeOwner !== this.owner || m.metadata.lwNativeOrder < order;
    return r;
  }

  private resolveAlphaMode(blendMode: string): number {
    switch (blendMode) {
      case 'add':
        return Constants.ALPHA_ADD;
      case 'screen':
      case 'lighten':
        return Constants.ALPHA_SCREENMODE;
      case 'multiply':
        return Constants.ALPHA_MULTIPLY;
      default:
        return Constants.ALPHA_COMBINE;
    }
  }

  private resolveBlendUniform(blendMode: string, hasBackdrop: boolean): number {
    if (hasBackdrop) {
      return nativeBlendModes.indexOf(blendMode as any);
    }
    if (blendMode === 'screen' || blendMode === 'lighten' || blendMode === 'multiply') {
      // Premultiplies c.rgb by c.a in finishLayer so ALPHA_SCREENMODE / ALPHA_MULTIPLY
      // are 100% transparent where c.a == 0 (never rendering square quad bounds).
      return -1;
    }
    return 0;
  }

  private material(
    r: LayerResources,
    family: 'particle' | 'ribbon' | 'fire' | 'arcane' | 'cinematic' | 'barrier',
    f: NativeLayerFrame,
    provided?: ShaderMaterial
  ): ShaderMaterial {
    let m = provided ?? r.materials.get(family);
    if (!m) {
      m = createNativeMaterial(this.scene, family, this.owner + '-' + family);
      r.materials.set(family, m);
    }
    const l = f.layer,
      fire = l.fireMaterial ?? l.fireHit;
    m.alphaMode = this.resolveAlphaMode(l.blendMode);
    m.setFloat('uLayerAlpha', f.alpha);
    m.setFloat('uBlend', this.resolveBlendUniform(l.blendMode, !!r.backdrop));
    m.setVector2(
      'uViewport',
      new Vector2(this.scene.getEngine().getRenderWidth(), this.scene.getEngine().getRenderHeight())
    );
    if (r.backdrop) m.setTexture('uBackdrop', r.backdrop);
    m.setColor3('uMain', color(l.color));
    m.setColor3('uFlame', color(l.color));
    m.setColor3('uCore', color(l.secondaryColor));
    m.setFloat('uClock', f.clock * l.motion.speed);
    m.setFloat('uTime', f.clock * l.motion.speed);
    m.setFloat('uProgress', f.progress);
    m.setFloat('uVariant', Math.max(0, ['straight', 'wave', 'ribbon', 'pulse', 'helix'].indexOf(l.variant)));
    m.setFloat('uStrength', 1);
    m.setFloat('uAlpha', 1);
    m.setFloat(
      'uTurbulence',
      fire?.turbulence ?? (l.kind === 'beam' || l.cinematic?.style === 'beam' ? l.motion.turbulence / 35 : l.motion.turbulence / 30 + 0.2)
    );
    m.setFloat('uStyle', 0);
    m.setFloat(
      'uElement',
      l.cinematic
        ? ['force', 'fire', 'ice', 'gas', 'radiant', 'lightning', 'acid', 'shadow'].indexOf(l.cinematic.element)
        : 0
    );
    m.setColor4('uColor', new Color4(1, 1, 1, 1));
    m.setFloat('uBloom', l.fireMaterial?.bloom ?? l.cinematic?.bloom ?? 0.65);
    m.setFloat('uDistortion', l.fireMaterial?.distortion ?? 0.45);
    m.setFloat('uScorch', l.fireMaterial?.scorch ?? 0.7);
    m.setFloat('uSeed', l.motion.seed);
    m.setFloat('uSmoke', fire?.smoke ?? 0.7);
    m.setFloat('uLight', fire?.light ?? 1);
    m.setFloat('uShadow', fire?.shadows ?? 0.65);
    m.setFloat('uEmbers', fire?.embers ?? 1);
    m.setColor3('uSmokeColor', color(fire?.smokeColor ?? '#4a4149'));
    return m;
  }

  private geometry(mesh: Mesh, positions: number[], uvs: number[], colors: number[], indices: number[]): void {
    mesh.setEnabled(indices.length > 0);
    if (!indices.length) return;
    if (mesh.getTotalVertices() === positions.length / 3 && mesh.getTotalIndices() === indices.length) {
      mesh.updateVerticesData('position', positions);
      mesh.updateVerticesData('uv', uvs);
      mesh.updateVerticesData('color', colors);
      mesh.updateIndices(indices);
    } else {
      const data = new VertexData();
      data.positions = positions;
      data.uvs = uvs;
      data.colors = colors;
      data.indices = indices;
      data.applyToMesh(mesh, true);
    }
    mesh.refreshBoundingInfo();
  }

  private createHand(r: LayerResources): TransformNode {
    const root = new TransformNode(this.owner + '-spectral-hand', this.scene);
    root.parent = r.root;
    const mat = new CustomMaterial(this.owner + '-hand', this.scene);
    mat.diffuseColor = new Color3(0.1, 0.4, 0.6);
    mat.specularColor = new Color3(0.6, 0.9, 1);
    mat.specularPower = 90;
    mat.alpha = 0.72;
    mat.backFaceCulling = false;
    r.handMaterial = mat;
    mat
      .AddUniform('uHandTime', 'float', 0)
      .AddUniform('uLayerAlpha', 'float', 1)
      .AddUniform('uBlend', 'float', 0)
      .AddUniform('uViewport', 'vec2', new Vector2(1, 1))
      .AddUniform('uBackdrop', 'sampler2D', null)
      .AddUniform('uHandColor', 'vec3', new Color3(0.2, 0.7, 1))
      .Fragment_Definitions(NATIVE_BLEND_FUNCTIONS)
      .Fragment_Before_FragColor(
        'float spectralRim=pow(1.0-abs(dot(normalW,viewDirectionW)),2.2);float veins=pow(max(0.0,1.0-abs(sin(vPositionW.x*31.0+sin(vPositionW.z*18.0)*2.5+vPositionW.y*21.0-uHandTime*2.0))),20.0);color.rgb+=uHandColor*(spectralRim*.75+veins*.24);color.a*=.75+spectralRim*.25;color=finishLayer(color);'
      );
    mat.onBindObservable.add(() => {
      const effect = mat.getEffect();
      if (!effect) return;
      effect.setFloat('uHandTime', r.root.metadata?.handClock ?? 0);
      effect.setFloat('uLayerAlpha', 1);
      effect.setColor3('uHandColor', mat.diffuseColor.scale(2));
      effect.setFloat('uBlend', r.backdrop ? nativeBlendModes.indexOf(r.blend as any) : 0);
      effect.setVector2(
        'uViewport',
        new Vector2(this.scene.getEngine().getRenderWidth(), this.scene.getEngine().getRenderHeight())
      );
      if (r.backdrop) effect.setTexture('uBackdrop', r.backdrop);
    });
    mat.onDisposeObservable.add(() => {
      delete Effect.ShadersStore[mat._createdShaderName + 'VertexShader'];
      delete Effect.ShadersStore[mat._createdShaderName + 'PixelShader'];
    });
    const ball = (name: string, p: Vector3, s: Vector3) => {
      const m = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 16 }, this.scene);
      m.position = p;
      m.scaling = s;
      m.parent = root;
      m.material = mat;
      m.isPickable = false;
      m.metadata = { lwNativeOwner: this.owner, lwNativeOrder: r.particles.metadata.lwNativeOrder };
      return m;
    };
    ball('palm', new Vector3(0, 0.04, 0), new Vector3(0.62, 0.19, 0.65));
    ball('wrist', new Vector3(0, 0, 0.43), new Vector3(0.36, 0.17, 0.47));
    for (let finger = 0; finger < 5; finger++) {
      const thumb = finger === 0,
        base = new Vector3(thumb ? -0.34 : -0.24 + (finger - 1) * 0.16, 0.04, thumb ? 0.12 : -0.25),
        length = thumb ? 0.45 : [0.66, 0.8, 0.74, 0.57][finger - 1],
        dir = new Vector3(thumb ? -0.66 : (finger - 2.5) * 0.1, 0.12, thumb ? -0.65 : -1).normalize();
      let previous = base;
      for (let joint = 0; joint < 3; joint++) {
        const end = previous.add(dir.scale(length / 3));
        end.y += joint === 2 ? -0.03 : 0.015;
        const delta = end.subtract(previous),
          bone = MeshBuilder.CreateCylinder(
            'spectral-finger',
            { height: delta.length(), diameterTop: 0.095 - joint * 0.016, diameterBottom: 0.12 - joint * 0.018, tessellation: 12 },
            this.scene
          );
        bone.position = previous.add(end).scale(0.5);
        bone.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), delta.normalize(), new Quaternion());
        bone.parent = root;
        bone.material = mat;
        bone.isPickable = false;
        bone.metadata = { lwNativeOwner: this.owner, lwNativeOrder: r.particles.metadata.lwNativeOrder };
        ball('knuckle', end, new Vector3(0.105 - joint * 0.016, 0.09 - joint * 0.012, 0.1 - joint * 0.012));
        previous = end;
      }
    }
    return root;
  }

  private solidMaterial(r: LayerResources, name: string, detail = ''): CustomMaterial {
    const mat = new CustomMaterial(this.owner + '-' + name, this.scene);
    mat
      .AddUniform('uLayerAlpha', 'float', 1)
      .AddUniform('uBlend', 'float', 0)
      .AddUniform('uViewport', 'vec2', new Vector2(1, 1))
      .AddUniform('uBackdrop', 'sampler2D', null)
      .Fragment_Definitions(NATIVE_BLEND_FUNCTIONS)
      .Fragment_Before_FragColor(detail + 'color=finishLayer(color);');
    mat.onBindObservable.add(() => {
      const effect = mat.getEffect();
      if (!effect) return;
      effect.setFloat('uLayerAlpha', 1);
      effect.setFloat('uBlend', r.backdrop ? nativeBlendModes.indexOf(r.blend as any) : 0);
      effect.setVector2(
        'uViewport',
        new Vector2(this.scene.getEngine().getRenderWidth(), this.scene.getEngine().getRenderHeight())
      );
      if (r.backdrop) effect.setTexture('uBackdrop', r.backdrop);
    });
    mat.onDisposeObservable.add(() => {
      delete Effect.ShadersStore[mat._createdShaderName + 'VertexShader'];
      delete Effect.ShadersStore[mat._createdShaderName + 'PixelShader'];
    });
    return mat;
  }

  private drawVine(r: LayerResources, f: NativeLayerFrame, worldPoint: (p: NativePoint) => Vector3, unit: number): void {
    if (!f.vine) {
      r.vine?.setEnabled(false);
      r.thorns?.forEach((m) => m.setEnabled(false));
      return;
    }
    const path = f.vine.map(worldPoint),
      length = path.slice(1).reduce((n, p, i) => n + Vector3.Distance(p, path[i]), 0);
    if (length < 0.005) {
      r.vine?.setEnabled(false);
      r.thorns?.forEach((m) => m.setEnabled(false));
      return;
    }
    if (!r.vineMaterial) {
      r.vineMaterial = this.solidMaterial(
        r,
        'vine-bark',
        'float bark=sin(vPositionW.x*90.0+sin(vPositionW.z*35.0)*2.0+vPositionW.y*55.0);color.rgb*=.8+.2*bark;'
      );
      r.vineMaterial.specularPower = 42;
      r.thornMaterial = this.solidMaterial(r, 'ivory-thorns');
      r.thornMaterial.specularPower = 75;
    }
    const l = f.layer,
      radius = (l.size / unit) * 0.65;
    r.vine = MeshBuilder.CreateTube(
      this.owner + '-living-vine',
      {
        path,
        radiusFunction: (i) => radius * (0.09 + 0.91 * (1 - i / (path.length - 1)) ** 0.7),
        tessellation: 10,
        updatable: true,
        cap: Mesh.CAP_ALL,
        instance: r.vine,
      },
      this.scene
    );
    r.vine.parent = r.root;
    r.vine.isPickable = false;
    r.vine.metadata = { lwNativeOwner: this.owner, lwNativeOrder: r.particles.metadata.lwNativeOrder };
    r.vine.material = r.vineMaterial;
    r.vine.setEnabled(true);
    r.vineMaterial.diffuseColor = color(l.color);
    r.vineMaterial.emissiveColor = color(l.color).scale(0.08);
    r.vineMaterial.alpha = f.alpha;
    r.thornMaterial!.diffuseColor = color(l.secondaryColor);
    r.thornMaterial!.alpha = f.alpha;
    r.thorns ??= [];
    const count = Math.round(l.whip.thorns);
    for (let i = 0; i < count; i++) {
      let m = r.thorns[i];
      if (!m) {
        m = MeshBuilder.CreateCylinder(
          this.owner + '-thorn',
          { height: 1, diameterBottom: 1, diameterTop: 0, tessellation: 7 },
          this.scene
        );
        m.parent = r.root;
        m.material = r.thornMaterial!;
        m.isPickable = false;
        m.metadata = r.vine.metadata;
        r.thorns.push(m);
      }
      const u = (i + 1) / (count + 1),
        index = Math.min(path.length - 2, Math.max(1, Math.round(u * (path.length - 1)))),
        tangent = path[index + 1].subtract(path[index - 1]).normalize(),
        side = Vector3.Cross(tangent, Vector3.Up()).normalize();
      if (side.lengthSquared() < 0.01) side.copyFrom(Vector3.Right());
      const normal = Vector3.Cross(side, tangent).normalize(),
        theta = i * 2.399,
        dir = side.scale(Math.cos(theta)).add(normal.scale(Math.sin(theta))).add(tangent.scale(-0.35)).normalize(),
        height = (l.whip.thornSize / unit) * (0.6 + 0.4 * (1 - u));
      m.position = path[index].add(dir.scale(height * 0.43));
      m.scaling.set(height * 0.55, height, height * 0.55);
      m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, new Quaternion());
      m.setEnabled(height > 0.0001);
    }
    for (let i = count; i < r.thorns.length; i++) r.thorns[i].setEnabled(false);
  }

  private drawProjectiles3D(
    r: LayerResources,
    f: NativeLayerFrame,
    order: number,
    worldPoint: (p: NativePoint) => Vector3,
    unit: number
  ): void {
    const specs = f.projectiles ?? [];
    for (let i = 0; i < specs.length; i++) {
      r.projectiles[i] = buildOrUpdateProjectileRig(
        this.scene,
        this.owner,
        r.root,
        order,
        r.projectiles[i],
        specs[i],
        worldPoint,
        unit,
        f.alpha,
        () => r.blend,
        () => r.backdrop
      );
    }
    for (let i = specs.length; i < r.projectiles.length; i++) {
      r.projectiles[i].root.setEnabled(false);
    }
  }

  draw(
    def: EffectDefinition,
    time: number,
    from: FxPoint,
    to: FxPoint,
    scale = 1,
    targets: FxPoint[] = [to],
    world: EffectWorld = {},
    sourceY = 0,
    targetY = 0
  ): void {
    if (this.disposed) return;
    const active = new Set(def.layers.map((l) => l.id));
    for (const [id, r] of this.layers)
      if (!active.has(id)) {
        this.release(r);
        this.layers.delete(id);
      }
    const flight = def.layers.find((l) => l.fireMaterial?.role === 'projectile');
    if (flight) world = { ...world, flight: { arrival: flight.delay + flight.duration * 0.6, arc: flight.fireMaterial!.arc } };
    const frames = evaluateNativeEffect(def, time, from, to, scale, targets, world),
      camera = this.scene.activeCamera,
      view = camera?.getWorldMatrix(),
      right = view ? Vector3.TransformNormal(Vector3.Right(), view).normalize() : Vector3.Right(),
      up = view ? Vector3.TransformNormal(Vector3.Up(), view).normalize() : Vector3.Forward();

    frames.forEach((f, order) => {
      const r = this.resource(f.layer, order);
      r.root.setEnabled(f.alpha > 0.00001);
      if (f.alpha <= 0.00001) return;
      const worldPoint = (p: NativePoint) => this.toWorld(p, from, to, sourceY, targetY),
        unit = this.options.pixelsPerUnit ?? 66;
      this.drawVine(r, f, worldPoint, unit);
      this.drawProjectiles3D(r, f, order, worldPoint, unit);

      const positions: number[] = [],
        uvs: number[] = [],
        colors: number[] = [],
        indices: number[] = [];
      for (const q of f.particles) {
        if (q.alpha < 0.0001) continue;
        const center = worldPoint(q);
        let xAxis: Vector3;
        let yAxis: Vector3;
        if (
          q.dirX !== undefined &&
          q.dirY !== undefined &&
          q.dirZ !== undefined &&
          q.stretch > 1.04
        ) {
          const worldVel = new Vector3(q.dirX, q.dirY, q.dirZ);
          const projR = Vector3.Dot(worldVel, right);
          const projU = Vector3.Dot(worldVel, up);
          const projLen = Math.hypot(projR, projU);
          if (projLen > 0.001) {
            const nr = projR / projLen;
            const nu = projU / projLen;
            yAxis = right.scale(nr).add(up.scale(nu));
            xAxis = right.scale(nu).subtract(up.scale(nr));
          } else {
            const c = Math.cos(q.rotation),
              s = Math.sin(q.rotation);
            xAxis = right.scale(c).add(up.scale(s));
            yAxis = up.scale(c).subtract(right.scale(s));
          }
        } else {
          const c = Math.cos(q.rotation),
            s = Math.sin(q.rotation);
          xAxis = right.scale(c).add(up.scale(s));
          yAxis = up.scale(c).subtract(right.scale(s));
        }
        const base = positions.length / 3,
          tint = color(q.color);
        for (const [x, y] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const v = center.add(xAxis.scale((x * q.size) / unit)).add(yAxis.scale((y * q.size * q.stretch) / unit));
          positions.push(v.x, v.y, v.z);
          uvs.push(q.tile * 2 + (x + 1) * 0.9999, (y + 1) / 2);
          colors.push(tint.r, tint.g, tint.b, q.alpha);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      this.geometry(r.particles, positions, uvs, colors, indices);
      r.particles.material = this.material(r, 'particle', f);

      const rp: number[] = [],
        ru: number[] = [],
        rc: number[] = [],
        ri: number[] = [];
      for (const ribbon of f.ribbons) {
        const base = rp.length / 3,
          tint = color(ribbon.color);
        for (let i = 0; i < ribbon.points.length; i++) {
          const center = worldPoint(ribbon.points[i]),
            before = worldPoint(ribbon.points[Math.max(0, i - 1)]),
            after = worldPoint(ribbon.points[Math.min(ribbon.points.length - 1, i + 1)]),
            tangent = after.subtract(before).normalize(),
            eye = camera?.globalPosition.subtract(center).normalize() ?? Vector3.Up();
          let side = Vector3.Cross(tangent, eye).normalize();
          if (side.lengthSquared() < 0.001) side = Vector3.Right();
          const u = i / Math.max(1, ribbon.points.length - 1),
            width = (ribbon.width / unit) * (ribbon.taper ? 0.08 + 0.92 * u : 1);
          for (const sign of [-1, 1]) {
            const v = center.add(side.scale(sign * width));
            rp.push(v.x, v.y, v.z);
            ru.push(u, (sign + 1) / 2);
            rc.push(tint.r, tint.g, tint.b, 1);
          }
          if (i > 0) {
            const a = base + i * 2;
            ri.push(a - 2, a - 1, a, a - 1, a + 1, a);
          }
        }
      }
      this.geometry(r.ribbons, rp, ru, rc, ri);
      r.ribbons.material = this.material(r, 'ribbon', f);

      const isTopDown = Math.abs(up.y) < 0.25;
      f.fields.forEach((field, i) => {
        let mesh = r.fields[i];
        if (!mesh) {
          mesh = this.mesh('field-' + i, r.root, order);
          r.fields.push(mesh);
        }
        const familyKey = field.family + '-' + i;
        let material = r.materials.get(familyKey);
        if (!material) {
          material = createNativeMaterial(this.scene, field.family, this.owner + '-' + familyKey);
          r.materials.set(familyKey, material);
        }
        this.material(r, field.family, f, material);
        material.setFloat(field.family === 'cinematic' ? 'uStyle' : 'uMode', field.mode);
        material.setFloat('uProgress', field.progress);
        material.setFloat('uVariant', field.variant);
        mesh.material = material;

        const center = worldPoint(field.point),
          c = Math.cos(field.angle),
          s = Math.sin(field.angle),
          ground =
            !field.vertical &&
            (field.family === 'cinematic' ||
              f.layer.kind === 'aura' ||
              f.layer.kind === 'ring' ||
              f.layer.kind === 'sigil'),
          axisX = field.vertical
            ? field.family === 'barrier'
              ? new Vector3(c, 0, s)
              : right
            : ground
              ? new Vector3(c, 0, s)
              : right,
          axisY = field.vertical
            ? isTopDown
              ? up
              : Vector3.Up()
            : ground
              ? new Vector3(-s, 0, c)
              : up,
          fp: number[] = [],
          fu: number[] = [],
          fc: number[] = [];
        for (const [x, y] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const v = center
            .add(axisX.scale((x * field.width) / 2 / unit))
            .add(axisY.scale((y * field.depth) / 2 / unit));
          fp.push(v.x, v.y, v.z);
          fu.push((x + 1) / 2, (y + 1) / 2);
          fc.push(1, 1, 1, 1);
        }
        this.geometry(mesh, fp, fu, fc, [0, 1, 2, 0, 2, 3]);
      });
      for (let i = f.fields.length; i < r.fields.length; i++) r.fields[i].setEnabled(false);

      if (f.hand) {
        r.root.metadata = { handClock: f.clock };
        r.hand ??= this.createHand(r);
        r.hand.setEnabled(true);
        r.hand.position = worldPoint(f.hand.point);
        r.hand.scaling.setAll(f.hand.size / unit);
        r.hand.rotation.y = -f.hand.angle - Math.PI / 2;
        r.handMaterial!.diffuseColor = color(f.layer.color).scale(0.4);
        r.handMaterial!.emissiveColor = color(f.layer.color).scale(0.2);
        r.handMaterial!.alpha = (0.45 + 0.4 * f.layer.mageHand!.wrist) * f.alpha;
      } else r.hand?.setEnabled(false);
    });

    const sources = spellLights(def, time, from, to, scale, targets, world)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 4);
    sources.forEach((s, i) => {
      let light = this.lights[i];
      if (!light) {
        light = new PointLight('eb-native-light-' + this.owner + '-' + i, Vector3.Zero(), this.scene);
        light.metadata = { lwNativeOwner: this.owner };
        this.lights.push(light);
      }
      const unit = this.options.pixelsPerUnit ?? 66;
      const groundPos = this.toWorld({ ...s, height: 0 }, from, to, sourceY, targetY);
      const lift = Math.max(0.55, (s.elevationZ ?? 28) / unit);
      light.position.set(groundPos.x, groundPos.y + lift, groundPos.z);
      const c = color(s.color);
      light.diffuse = c;
      light.specular = c;
      light.intensity = s.intensity * (this.options.lightGain ?? 3.6);
      light.range = Math.max(2.8, (s.radius / unit) * 1.65);
    });
    for (let i = sources.length; i < this.lights.length; i++) {
      this.lights[i].intensity = 0;
      this.lights[i].range = 0.1;
    }
  }

  private release(r: LayerResources) {
    r.backdrop?.dispose();
    disposeProjectileRigs(r.projectiles);
    r.root.dispose(false);
    for (const m of r.materials.values()) m.dispose();
    r.handMaterial?.dispose(true);
    r.vineMaterial?.dispose(true);
    r.thornMaterial?.dispose(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const r of this.layers.values()) this.release(r);
    this.layers.clear();
    for (const light of this.lights) {
      if (!light.isDisposed()) {
        light.intensity = 0;
        light.range = 0.1;
      }
    }
    this.lights = [];
  }
}

export function normalizeNativeDefinition(raw: any): EffectDefinition {
  if (raw?.schemaVersion === 1) return parseEffect(raw);
  return parseEffect({
    schemaVersion: 1,
    id: raw.id,
    name: raw.name || 'Spell effect',
    spellName: raw.spellName ?? '',
    description: raw.description ?? '',
    previewScene: raw.previewScene ?? defaultScene(),
    layers: (raw.layers ?? []).map((l: any) => {
      const kind = l.kind ?? l.type ?? 'burst',
        mapped = kind === 'rune' ? 'sigil' : kind === 'wave' ? 'ring' : kind,
        base = createLayer(mapped);
      return {
        ...base,
        ...l,
        kind: mapped,
        color: l.color ?? l.primaryColor ?? base.color,
        duration: l.duration ?? l.durationMs ?? base.duration,
        delay: l.delay ?? l.startTimeMs ?? 0,
        ...(l.missile
          ? {
              missile: {
                targets: [0, 1, 2],
                smokeColor: '#a59ad9',
                rise: 55,
                curve: 85,
                smokeLife: 700,
                smokeOpacity: 0.45,
                smokeSpread: 8,
                launchGap: 90,
                impactSize: 18,
                ...l.missile,
              },
            }
          : {}),
      };
    }),
  });
}

export function playNativeEffect(
  scene: Scene,
  definition: EffectDefinition,
  from: () => Vector3,
  targets: () => Vector3[],
  options: NativeWorldOptions = {}
): { dispose: () => void } {
  const runtime = new BabylonEffectRuntime(scene, options),
    unit = options.pixelsPerUnit ?? 66,
    effectScale = options.scale ?? 0.85,
    timeScale = Math.max(0.1, Math.min(3.0, options.timeScale ?? 1.0)),
    start = performance.now(),
    duration = effectDuration(definition);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.onBeforeRenderObservable.remove(observer);
    scene.onDisposeObservable.remove(disposeObserver);
    runtime.dispose();
  };
  const observer = scene.onBeforeRenderObservable.add(() => {
    const time = (performance.now() - start) * timeScale;
    if (time > duration + 40) {
      dispose();
      return;
    }
    const a = from(),
      ts = targets(),
      b = ts[0] ?? a;
    runtime.draw(
      definition,
      time,
      { x: a.x * unit, y: a.z * unit },
      { x: b.x * unit, y: b.z * unit },
      effectScale,
      ts.map((p) => ({ x: p.x * unit, y: p.z * unit })),
      {},
      a.y,
      b.y
    );
  });
  const disposeObserver = scene.onDisposeObservable.add(dispose);
  return { dispose };
}
