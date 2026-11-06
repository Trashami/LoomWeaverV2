import {
  AbstractMesh,
  Color3,
  Light,
  Mesh,
  MeshBuilder,
  Observer,
  PointLight,
  Scene,
  ShadowGenerator,
  SpotLight,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { LightSourceNode, MapWallSegmentNode } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import {
  buildWallSconceFixtureMesh,
  snapToNearestWallFace,
} from '../walls/wall-sconce-attachment.helper';
import { AoeLightEffects } from './aoe-light-effects';
import { LightSettings, resolveLightSettings } from './light-settings';

const LIGHT_PREFIXES = ['lw-point-light-', 'lw-light-core-', 'lw-light-halo-', 'lw-pool-point-'];
const MAX_SHADOW_LIGHTS = 3;
const POINT_LIGHT_POOL_SIZE = 4;

interface FlickerTarget {
  readonly light: Light;
  readonly base: number;
  readonly amount: number;
  readonly phase: number;
}

interface CachedHandleEntry {
  meshOrNode: Mesh | TransformNode;
  isWallSconce: boolean;
  sconceSig: string;
}

interface SceneLightCache {
  readonly pointPool: PointLight[];
  readonly overflowLights: Map<string, PointLight | SpotLight>;
  readonly shadowGenByLight: Map<Light, ShadowGenerator>;
  readonly handlesById: Map<string, CachedHandleEntry>;
  readonly aoeSigById: Map<string, string>;
  flickerObserver: Observer<Scene> | null;
}

/**
 * Builds and updates the emitters for scene light nodes in-place using a pre-allocated
 * PointLight pool so adding lights or dragging light sliders never triggers synchronous
 * WebGL material shader recompilation.
 */
export class LightFixtureBuilder {
  private static readonly cacheByScene = new WeakMap<Scene, SceneLightCache>();
  private static handlesVisible = true;

  private static getSceneCache(scene: Scene): SceneLightCache {
    let cache = this.cacheByScene.get(scene);
    if (!cache) {
      const pointPool: PointLight[] = [];
      for (let i = 0; i < POINT_LIGHT_POOL_SIZE; i++) {
        const pooled = new PointLight(`lw-pool-point-${i}`, new Vector3(0, -1000, 0), scene);
        pooled.intensity = 0;
        pooled.range = 0.01;
        pooled.diffuse = Color3.White();
        pooled.specular = Color3.White();
        pointPool.push(pooled);
      }
      cache = {
        pointPool,
        overflowLights: new Map(),
        shadowGenByLight: new Map(),
        handlesById: new Map(),
        aoeSigById: new Map(),
        flickerObserver: null,
      };
      this.cacheByScene.set(scene, cache);
    }
    return cache;
  }

  static setHandlesVisible(scene: Scene, visible: boolean): void {
    this.handlesVisible = visible;
    scene.meshes
      .filter((m) => m.name.startsWith('lw-light-orb-') && m.metadata?.lwHandle)
      .forEach((m) => (m.visibility = visible ? 0.55 : 0));
  }

  static dispose(scene: Scene): void {
    const cache = this.cacheByScene.get(scene);
    if (cache) {
      if (cache.flickerObserver) {
        scene.onBeforeRenderObservable.remove(cache.flickerObserver);
        cache.flickerObserver = null;
      }
      for (const gen of cache.shadowGenByLight.values()) {
        gen.dispose();
      }
      cache.shadowGenByLight.clear();
      for (const l of cache.overflowLights.values()) {
        l.dispose();
      }
      cache.overflowLights.clear();
      for (const p of cache.pointPool) {
        p.intensity = 0;
        p.range = 0.01;
        p.position.set(0, -1000, 0);
        p.metadata = null;
      }
      for (const h of cache.handlesById.values()) {
        if (!h.meshOrNode.isDisposed()) {
          h.meshOrNode.dispose();
        }
      }
      cache.handlesById.clear();
      cache.aoeSigById.clear();
    }
    AoeLightEffects.disposeAll(scene);
  }

  static rebuild(
    scene: Scene,
    nodes: readonly LightSourceNode[],
    walls?: readonly MapWallSegmentNode[],
  ): void {
    const cache = this.getSceneCache(scene);
    if (cache.flickerObserver) {
      scene.onBeforeRenderObservable.remove(cache.flickerObserver);
      cache.flickerObserver = null;
    }

    const ground = scene.getMeshByName('lw-terrain-ground');
    if (ground?.material instanceof StandardMaterial && ground.material.maxSimultaneousLights < 8) {
      ground.material.maxSimultaneousLights = 8;
    }

    const activeIds = new Set<string>(nodes.map((n) => n.id));

    // Remove overflow lights, handles, and AOE effects for deleted nodes
    for (const [id, light] of [...cache.overflowLights.entries()]) {
      if (!activeIds.has(id)) {
        const gen = cache.shadowGenByLight.get(light);
        if (gen) {
          gen.dispose();
          cache.shadowGenByLight.delete(light);
        }
        light.dispose();
        cache.overflowLights.delete(id);
      }
    }
    for (const [id, handleEntry] of [...cache.handlesById.entries()]) {
      if (!activeIds.has(id)) {
        if (!handleEntry.meshOrNode.isDisposed()) {
          handleEntry.meshOrNode.dispose();
        }
        cache.handlesById.delete(id);
      }
    }
    for (const [id] of [...cache.aoeSigById.entries()]) {
      if (!activeIds.has(id)) {
        scene.particleSystems
          .filter((ps) => ps.name === `lw-aoe-fx-${id}`)
          .forEach((ps) => ps.dispose(false));
        cache.aoeSigById.delete(id);
      }
    }

    const flicker: FlickerTarget[] = [];
    let shadowBudget = MAX_SHADOW_LIGHTS;
    let poolCursor = 0;
    const usedPoolLights = new Set<PointLight>();

    nodes.forEach((node, index) => {
      const s = resolveLightSettings(node);
      const wallSnap = snapToNearestWallFace(walls, node.x, node.z, 0.16, 0.85);
      const effectiveX = wallSnap.snapped ? wallSnap.x : node.x;
      const effectiveZ = wallSnap.snapped ? wallSnap.z : node.z;
      const groundY = TerrainMeshBuilder.sampleElevationAt(scene, effectiveX, effectiveZ);
      const pos = new Vector3(effectiveX, groundY + s.y, effectiveZ);

      const isSpot = s.kind === 'spot' && !s.omnidirectional;
      let mainLight: PointLight | SpotLight;

      if (!isSpot && poolCursor < cache.pointPool.length) {
        const existingOverflow = cache.overflowLights.get(node.id);
        if (existingOverflow) {
          const gen = cache.shadowGenByLight.get(existingOverflow);
          if (gen) {
            gen.dispose();
            cache.shadowGenByLight.delete(existingOverflow);
          }
          existingOverflow.dispose();
          cache.overflowLights.delete(node.id);
        }
        const pooled = cache.pointPool[poolCursor++];
        usedPoolLights.add(pooled);
        pooled.metadata = { lwEntityId: node.id };
        this.applyLightUniformsInPlace(pooled, pos, s);
        mainLight = pooled;
      } else {
        const existing = cache.overflowLights.get(node.id);
        const needsSpot = isSpot;
        if (
          existing &&
          !existing.isDisposed() &&
          ((needsSpot && existing instanceof SpotLight) ||
            (!needsSpot && existing instanceof PointLight))
        ) {
          this.applyLightUniformsInPlace(existing, pos, s);
          mainLight = existing;
        } else {
          if (existing) {
            const gen = cache.shadowGenByLight.get(existing);
            if (gen) {
              gen.dispose();
              cache.shadowGenByLight.delete(existing);
            }
            existing.dispose();
          }
          mainLight = this.createOverflowLight(scene, `lw-point-light-${node.id}`, pos, s);
          mainLight.metadata = { lwEntityId: node.id };
          cache.overflowLights.set(node.id, mainLight);
        }
      }

      this.track(flicker, mainLight, s, index);

      const wantsShadow = s.shadowMode !== 'none' && s.kind !== 'aoe' && shadowBudget > 0;
      if (wantsShadow) {
        shadowBudget--;
        this.syncShadowGenerator(scene, cache, mainLight, s);
      } else {
        const oldGen = cache.shadowGenByLight.get(mainLight);
        if (oldGen) {
          oldGen.dispose();
          cache.shadowGenByLight.delete(mainLight);
        }
      }

      if (s.kind === 'aoe') {
        const aoeSig = `${s.effect}|${s.effectCount}|${s.effectSpeed}|${s.effectColorHex}|${s.colorHex}|${s.effectSizeM}|${s.effectSpreadM}`;
        if (cache.aoeSigById.get(node.id) !== aoeSig) {
          scene.particleSystems
            .filter((ps) => ps.name === `lw-aoe-fx-${node.id}`)
            .forEach((ps) => ps.dispose(false));
          AoeLightEffects.build(scene, node.id, pos, s);
          cache.aoeSigById.set(node.id, aoeSig);
        } else {
          const fx = scene.particleSystems.find((ps) => ps.name === `lw-aoe-fx-${node.id}`);
          if (fx?.emitter instanceof Vector3) {
            fx.emitter.copyFrom(pos);
          }
        }
      } else if (cache.aoeSigById.has(node.id)) {
        scene.particleSystems
          .filter((ps) => ps.name === `lw-aoe-fx-${node.id}`)
          .forEach((ps) => ps.dispose(false));
        cache.aoeSigById.delete(node.id);
      }

      this.syncHandleInPlace(scene, cache, node, pos, s, wallSnap);
    });

    // Zero out any unused pooled PointLights without disposing or disabling them
    for (const pooled of cache.pointPool) {
      if (!usedPoolLights.has(pooled)) {
        const oldGen = cache.shadowGenByLight.get(pooled);
        if (oldGen) {
          oldGen.dispose();
          cache.shadowGenByLight.delete(pooled);
        }
        pooled.intensity = 0;
        pooled.range = 0.01;
        pooled.position.set(0, -1000, 0);
        pooled.metadata = null;
      }
    }

    this.startFlicker(scene, cache, flicker);
  }

  static moveLight(scene: Scene, id: string, x: number, z: number, elevation: number): void {
    const pos = new Vector3(x, TerrainMeshBuilder.sampleElevationAt(scene, x, z) + elevation, z);
    for (const light of scene.lights) {
      const matchesMeta = light.metadata?.lwEntityId === id;
      const matchesName = LIGHT_PREFIXES.some((p) => light.name === `${p}${id}`);
      if ((matchesMeta || matchesName) && (light instanceof PointLight || light instanceof SpotLight)) {
        light.position.copyFrom(pos);
      }
    }
    const cache = this.cacheByScene.get(scene);
    const handle = cache?.handlesById.get(id)?.meshOrNode ?? scene.getMeshByName(`lw-light-orb-${id}`);
    if (handle) {
      handle.position.copyFrom(pos);
    }
    const fx = scene.particleSystems.find((ps) => ps.name === `lw-aoe-fx-${id}`);
    if (fx?.emitter instanceof Vector3) fx.emitter.copyFrom(pos);
  }

  /** Re-registers shadow casters after walls/objects are rebuilt. */
  static refreshCasters(scene: Scene): void {
    const cache = this.cacheByScene.get(scene);
    if (!cache || cache.shadowGenByLight.size === 0) return;
    const casters = this.collectCasters(scene);
    for (const gen of cache.shadowGenByLight.values()) {
      const map = gen.getShadowMap();
      if (map) map.renderList = [...casters];
    }
  }

  private static computeCombinedLightParams(s: LightSettings): {
    color: Color3;
    range: number;
    intensity: number;
    natural: boolean;
  } {
    const feather = Math.max(0, Math.min(1, s.featherPct / 100));
    const coreWeight =
      s.kind !== 'aoe' && s.coreIntensity > 0.01
        ? Math.min(
            0.72,
            (s.coreIntensity / Math.max(0.1, s.intensity + s.coreIntensity)) *
              (0.35 + 0.65 * (s.coreRadiusPct / 100)),
          )
        : 0;

    const mainCol = Color3.FromHexString(s.colorHex || '#ffffff');
    const coreCol = Color3.FromHexString(s.coreColorHex || s.colorHex || '#ffffff');
    const color = Color3.Lerp(mainCol, coreCol, coreWeight);

    const effectiveRange = Math.max(0.5, s.range * (1 + 0.65 * feather));
    const natural = s.falloff === 'natural';
    const compensation = natural ? Math.max(1, (effectiveRange * 0.12) ** 2) : 1;
    const coreBoost =
      s.kind !== 'aoe' && s.coreIntensity > 0.01
        ? s.coreIntensity * (0.35 + 0.65 * (s.coreRadiusPct / 100))
        : 0;
    const rawIntensity = s.intensity * (1 + 0.22 * feather) + coreBoost;

    return {
      color,
      range: effectiveRange,
      intensity: rawIntensity * compensation,
      natural,
    };
  }

  private static applyLightUniformsInPlace(
    light: PointLight | SpotLight,
    pos: Vector3,
    s: LightSettings,
  ): void {
    const { color, range, intensity, natural } = this.computeCombinedLightParams(s);
    light.position.copyFrom(pos);
    light.diffuse.copyFrom(color);
    light.specular.copyFrom(color);
    light.range = range;
    light.falloffType = natural ? Light.FALLOFF_GLTF : Light.FALLOFF_STANDARD;
    light.intensity = intensity;

    if (light instanceof SpotLight) {
      const angle = Math.min(Math.PI * 0.999, (s.coneAngleDeg * Math.PI) / 180);
      const softness = s.coneSoftnessPct / 100;
      light.direction.copyFrom(this.aimDirection(s));
      light.angle = angle;
      light.exponent = 0.8 + (1 - softness) * 24;
      light.innerAngle = angle * (1 - softness) * 0.9;
    }
  }

  private static createOverflowLight(
    scene: Scene,
    name: string,
    pos: Vector3,
    s: LightSettings,
  ): PointLight | SpotLight {
    let light: PointLight | SpotLight;
    if (s.kind === 'spot' && !s.omnidirectional) {
      const angle = Math.min(Math.PI * 0.999, (s.coneAngleDeg * Math.PI) / 180);
      const softness = s.coneSoftnessPct / 100;
      light = new SpotLight(
        name,
        pos.clone(),
        this.aimDirection(s),
        angle,
        0.8 + (1 - softness) * 24,
        scene,
      );
      light.innerAngle = angle * (1 - softness) * 0.9;
    } else {
      light = new PointLight(name, pos.clone(), scene);
    }
    this.applyLightUniformsInPlace(light, pos, s);
    return light;
  }

  private static aimDirection(s: LightSettings): Vector3 {
    const yaw = (s.aimYawDeg * Math.PI) / 180;
    const pitch = (s.aimPitchDeg * Math.PI) / 180;
    return new Vector3(
      Math.cos(pitch) * Math.cos(yaw),
      Math.sin(pitch),
      Math.cos(pitch) * Math.sin(yaw),
    ).normalize();
  }

  private static syncShadowGenerator(
    scene: Scene,
    cache: SceneLightCache,
    light: PointLight | SpotLight,
    s: LightSettings,
  ): void {
    let gen = cache.shadowGenByLight.get(light);
    if (!gen) {
      gen = new ShadowGenerator(light instanceof SpotLight ? 1024 : 512, light);
      gen.bias = 0.004;
      gen.normalBias = 0.02;
      const map = gen.getShadowMap();
      if (map) map.renderList = this.collectCasters(scene);
      cache.shadowGenByLight.set(light, gen);
    }
    gen.darkness = Math.max(0, Math.min(0.95, 1 - s.shadowStrengthPct / 100));
    gen.usePoissonSampling = s.shadowMode === 'soft';
  }

  private static collectCasters(scene: Scene): AbstractMesh[] {
    let totalVerts = 0;
    const MAX_VERTS = 90000;
    return scene.meshes.filter((m) => {
      const matName = m.material?.name ?? '';
      if (matName.startsWith('lw-stamp-decal-mat-') || matName.startsWith('lw-token-glowmat-')) {
        return false;
      }
      const vCount = m.getTotalVertices();
      if (vCount <= 0 || vCount > 30000 || totalVerts + vCount > MAX_VERTS) {
        return false;
      }
      const isCaster =
        m.name.startsWith('lw-wall-') ||
        m.name.startsWith('lw-door-') ||
        m.name.startsWith('lw-stamp-') ||
        (Boolean(m.metadata?.lwNodeName) &&
          !m.name.startsWith('lw-light-') &&
          !m.name.startsWith('mapLightSconce'));
      if (isCaster) {
        totalVerts += vCount;
      }
      return isCaster;
    });
  }

  /** Renders or updates in-place a 3D wall sconce bracket or editor orb handle. */
  private static syncHandleInPlace(
    scene: Scene,
    cache: SceneLightCache,
    node: LightSourceNode,
    pos: Vector3,
    s: LightSettings,
    wallSnap: ReturnType<typeof snapToNearestWallFace>,
  ): void {
    const isWallSconce =
      wallSnap.snapped || Boolean(node.attachedWallId) || node.showFixture === true;
    const lightMeta = {
      lwNodeName: `lw-light-${node.id}`,
      lwKind: 'light' as const,
      lwEntityId: node.id,
      lwHandle: !isWallSconce,
    };

    const existing = cache.handlesById.get(node.id);

    if (isWallSconce) {
      const effectiveSnap = wallSnap.snapped
        ? wallSnap
        : {
            snapped: true,
            x: pos.x,
            z: pos.z,
            wallId: node.attachedWallId,
            outwardNormalX: node.wallNormalX ?? 0,
            outwardNormalZ: node.wallNormalZ ?? 1,
            rotationYRad: node.wallRotationYRad ?? 0,
            rotationYDeg: ((node.wallRotationYRad ?? 0) * 180) / Math.PI,
            suggestedElevationY: pos.y,
          };
      const sconceSig = `${effectiveSnap.rotationYRad.toFixed(3)}|${s.colorHex}|${s.intensity.toFixed(2)}`;
      if (existing && !existing.meshOrNode.isDisposed() && existing.isWallSconce && existing.sconceSig === sconceSig) {
        existing.meshOrNode.position.copyFrom(pos);
        return;
      }
      if (existing && !existing.meshOrNode.isDisposed()) {
        existing.meshOrNode.dispose();
      }
      const sconceRoot = buildWallSconceFixtureMesh(
        scene,
        node.id,
        pos,
        effectiveSnap,
        Color3.FromHexString(s.colorHex),
        s.intensity,
        (subMesh: Mesh) => {
          subMesh.isPickable = true;
          subMesh.metadata = lightMeta;
        },
      );
      sconceRoot.name = `lw-light-orb-${node.id}`;
      cache.handlesById.set(node.id, {
        meshOrNode: sconceRoot,
        isWallSconce: true,
        sconceSig,
      });
      return;
    }

    const orbCol = Color3.Lerp(
      Color3.FromHexString(s.colorHex || '#ffffff'),
      Color3.FromHexString(s.coreColorHex || s.colorHex || '#ffffff'),
      s.coreIntensity > 0.01 ? 0.55 : 0,
    );
    const orbScale = 0.78 + Math.min(0.85, (s.coreRadiusPct / 100) * 0.75);

    if (existing && !existing.meshOrNode.isDisposed() && !existing.isWallSconce && existing.meshOrNode instanceof Mesh) {
      const handle = existing.meshOrNode;
      handle.position.copyFrom(pos);
      handle.scaling.setAll(orbScale);
      handle.metadata = lightMeta;
      handle.visibility = this.handlesVisible ? 0.55 : 0;
      if (handle.material instanceof StandardMaterial) {
        handle.material.emissiveColor.copyFrom(orbCol);
      }
      return;
    }

    if (existing && !existing.meshOrNode.isDisposed()) {
      existing.meshOrNode.dispose();
    }

    const handle = MeshBuilder.CreateSphere(
      `lw-light-orb-${node.id}`,
      { diameter: 0.36, segments: 8 },
      scene,
    );
    handle.position.copyFrom(pos);
    handle.scaling.setAll(orbScale);
    const mat = new StandardMaterial(`lw-light-mat-${node.id}`, scene);
    mat.emissiveColor = orbCol;
    mat.disableLighting = true;
    handle.material = mat;
    handle.metadata = lightMeta;
    handle.visibility = this.handlesVisible ? 0.55 : 0;
    cache.handlesById.set(node.id, {
      meshOrNode: handle,
      isWallSconce: false,
      sconceSig: '',
    });
  }

  private static track(targets: FlickerTarget[], light: Light, s: LightSettings, index: number): void {
    if (!s.flicker) return;
    targets.push({ light, base: light.intensity, amount: s.flickerPct / 100, phase: index * 1.7 });
  }

  private static startFlicker(
    scene: Scene,
    cache: SceneLightCache,
    targets: readonly FlickerTarget[],
  ): void {
    if (targets.length === 0) return;
    cache.flickerObserver = scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000;
      for (const f of targets) {
        const wave =
          Math.sin(t * 13 + f.phase) * 0.5 +
          Math.sin(t * 7.3 + f.phase * 2) * 0.3 +
          Math.sin(t * 29 + f.phase * 3) * 0.2;
        f.light.intensity = f.base * (1 + f.amount * 0.5 * wave);
      }
    });
  }
}
