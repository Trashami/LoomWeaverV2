import {
  AbstractMesh,
  Color3,
  Light,
  MeshBuilder,
  Observer,
  PointLight,
  Scene,
  ShadowGenerator,
  SpotLight,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { LightSourceNode } from '../map-scene-contract';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { AoeLightEffects } from './aoe-light-effects';
import { LightSettings, resolveLightSettings } from './light-settings';

const LIGHT_PREFIXES = ['lw-point-light-', 'lw-light-core-', 'lw-light-halo-'];
const MAX_SHADOW_LIGHTS = 3;

interface FlickerTarget {
  readonly light: Light;
  readonly base: number;
  readonly amount: number;
  readonly phase: number;
}

/** Builds the emitters for scene light nodes: core + primary + feather halo, shadows and AOE particles. */
export class LightFixtureBuilder {
  private static shadowGens: ShadowGenerator[] = [];
  private static flickerObserver: Observer<Scene> | null = null;
  private static handlesVisible = true;

  static setHandlesVisible(scene: Scene, visible: boolean): void {
    this.handlesVisible = visible;
    scene.meshes
      .filter((m) => m.name.startsWith('lw-light-orb-') && m.metadata?.lwHandle)
      .forEach((m) => (m.visibility = visible ? 0.55 : 0));
  }

  static dispose(scene: Scene): void {
    if (this.flickerObserver) {
      scene.onBeforeRenderObservable.remove(this.flickerObserver);
      this.flickerObserver = null;
    }
    this.shadowGens = [];
    scene.lights
      .filter((l) => LIGHT_PREFIXES.some((p) => l.name.startsWith(p)))
      .forEach((l) => l.dispose());
    scene.meshes
      .filter((m) => m.name.startsWith('lw-light-orb-'))
      .forEach((m) => m.dispose());
    AoeLightEffects.disposeAll(scene);
  }

  static rebuild(scene: Scene, nodes: readonly LightSourceNode[]): void {
    this.dispose(scene);
    const ground = scene.getMeshByName('lw-terrain-ground');
    if (ground?.material instanceof StandardMaterial) {
      ground.material.maxSimultaneousLights = 8;
    }

    const flicker: FlickerTarget[] = [];
    let shadowBudget = MAX_SHADOW_LIGHTS;
    nodes.forEach((node, index) => {
      const s = resolveLightSettings(node);
      const groundY = TerrainMeshBuilder.sampleElevationAt(scene, node.x, node.z);
      const pos = new Vector3(node.x, groundY + s.y, node.z);
      const feather = s.featherPct / 100;

      const main = this.createLight(scene, `lw-point-light-${node.id}`, pos, s, {
        range: s.range * (1 - 0.35 * feather),
        intensity: s.intensity,
        colorHex: s.colorHex,
      });
      this.track(flicker, main, s, index);

      if (feather > 0.1) {
        const halo = this.createLight(scene, `lw-light-halo-${node.id}`, pos, s, {
          range: s.range * (1 + 1.2 * feather),
          intensity: s.intensity * 0.3 * feather,
          colorHex: s.colorHex,
        });
        this.track(flicker, halo, s, index);
      }
      if (s.kind !== 'aoe' && s.coreIntensity > 0.01) {
        const core = this.createLight(scene, `lw-light-core-${node.id}`, pos, s, {
          range: Math.max(1, (s.range * s.coreRadiusPct) / 100),
          intensity: s.coreIntensity,
          colorHex: s.coreColorHex,
        });
        this.track(flicker, core, s, index);
      }
      if (s.shadowMode !== 'none' && s.kind !== 'aoe' && shadowBudget > 0) {
        shadowBudget--;
        this.attachShadows(scene, main, s);
      }
      if (s.kind === 'aoe') {
        AoeLightEffects.build(scene, node.id, pos, s);
      }
      this.createHandle(scene, node, pos, s);
    });
    this.startFlicker(scene, flicker);
  }

  static moveLight(scene: Scene, id: string, x: number, z: number, elevation: number): void {
    const pos = new Vector3(x, TerrainMeshBuilder.sampleElevationAt(scene, x, z) + elevation, z);
    for (const light of scene.lights) {
      if (LIGHT_PREFIXES.some((p) => light.name === `${p}${id}`) && light instanceof PointLight) {
        light.position.copyFrom(pos);
      } else if (LIGHT_PREFIXES.some((p) => light.name === `${p}${id}`) && light instanceof SpotLight) {
        light.position.copyFrom(pos);
      }
    }
    scene.getMeshByName(`lw-light-orb-${id}`)?.position.copyFrom(pos);
    const fx = scene.particleSystems.find((ps) => ps.name === `lw-aoe-fx-${id}`);
    if (fx?.emitter instanceof Vector3) fx.emitter.copyFrom(pos);
  }

  /** Re-registers shadow casters after walls/objects are rebuilt. */
  static refreshCasters(scene: Scene): void {
    const casters = this.collectCasters(scene);
    for (const gen of this.shadowGens) {
      const map = gen.getShadowMap();
      if (map) map.renderList = [...casters];
    }
  }

  private static createLight(
    scene: Scene,
    name: string,
    pos: Vector3,
    s: LightSettings,
    o: { range: number; intensity: number; colorHex: string },
  ): PointLight | SpotLight {
    const col = Color3.FromHexString(o.colorHex || '#ffffff');
    const natural = s.falloff === 'natural';
    let light: PointLight | SpotLight;
    if (s.kind === 'spot' && !s.omnidirectional) {
      const angle = Math.min(Math.PI * 0.999, (s.coneAngleDeg * Math.PI) / 180);
      const softness = s.coneSoftnessPct / 100;
      light = new SpotLight(name, pos.clone(), this.aimDirection(s), angle, 0.8 + (1 - softness) * 24, scene);
      light.innerAngle = angle * (1 - softness) * 0.9;
    } else {
      light = new PointLight(name, pos.clone(), scene);
    }
    light.diffuse = col;
    light.specular = col;
    light.range = Math.max(0.5, o.range);
    light.falloffType = natural ? Light.FALLOFF_GLTF : Light.FALLOFF_STANDARD;
    // glTF falloff is inverse-square, so it needs compensation to match the linear curve's brightness.
    const compensation = natural ? Math.max(1, (light.range * 0.12) ** 2) : 1;
    light.intensity = o.intensity * compensation;
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

  private static attachShadows(scene: Scene, light: PointLight | SpotLight, s: LightSettings): void {
    const gen = new ShadowGenerator(light instanceof SpotLight ? 1024 : 512, light);
    gen.darkness = Math.max(0, Math.min(0.95, 1 - s.shadowStrengthPct / 100));
    gen.usePoissonSampling = s.shadowMode === 'soft';
    gen.bias = 0.004;
    gen.normalBias = 0.02;
    const map = gen.getShadowMap();
    if (map) map.renderList = this.collectCasters(scene);
    this.shadowGens.push(gen);
  }

  private static collectCasters(scene: Scene): AbstractMesh[] {
    return scene.meshes.filter(
      (m) =>
        m.name.startsWith('lw-wall-') ||
        m.name.startsWith('lw-door-') ||
        m.name.startsWith('lw-stamp-') ||
        (Boolean(m.metadata?.lwNodeName) && !m.name.startsWith('lw-light-')),
    );
  }

  /** Small selectable marker at the emitter; only drawn in the editing tools, never as a radius outline. */
  private static createHandle(scene: Scene, node: LightSourceNode, pos: Vector3, s: LightSettings): void {
    const showFixture = node.showFixture === true;
    const handle = MeshBuilder.CreateSphere(
      `lw-light-orb-${node.id}`,
      { diameter: showFixture ? 0.3 : 0.4, segments: 8 },
      scene,
    );
    handle.position.copyFrom(pos);
    const mat = new StandardMaterial(`lw-light-mat-${node.id}`, scene);
    mat.emissiveColor = Color3.FromHexString(s.colorHex);
    mat.disableLighting = true;
    handle.material = mat;
    handle.metadata = {
      lwNodeName: `lw-light-${node.id}`,
      lwKind: 'light' as const,
      lwEntityId: node.id,
      lwHandle: !showFixture,
    };
    handle.visibility = showFixture ? 1 : this.handlesVisible ? 0.55 : 0;
  }

  private static track(targets: FlickerTarget[], light: Light, s: LightSettings, index: number): void {
    if (!s.flicker) return;
    targets.push({ light, base: light.intensity, amount: s.flickerPct / 100, phase: index * 1.7 });
  }

  private static startFlicker(scene: Scene, targets: readonly FlickerTarget[]): void {
    if (targets.length === 0) return;
    this.flickerObserver = scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000;
      for (const f of targets) {
        const wave = Math.sin(t * 13 + f.phase) * 0.5 + Math.sin(t * 7.3 + f.phase * 2) * 0.3 + Math.sin(t * 29 + f.phase * 3) * 0.2;
        f.light.intensity = f.base * (1 + f.amount * 0.5 * wave);
      }
    });
  }
}
