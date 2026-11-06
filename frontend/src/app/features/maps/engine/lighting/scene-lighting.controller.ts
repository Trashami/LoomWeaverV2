import {
  AbstractMesh,
  Color3,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Node,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { LightSourceNode, MapWallSegmentNode } from '../map-scene-contract';
import { LightFixtureBuilder } from './light-fixture.builder';

export interface CelestialLightConfig {
  readonly mode: 'sun' | 'moon';
  readonly azimuthDeg: number;
  readonly altitudeDeg: number;
  readonly shadowDarkness: number;
  readonly showSkyOrb?: boolean;
}

export class SceneLightingController {
  private static readonly shadowGenByScene = new WeakMap<Scene, ShadowGenerator>();
  private static currentCelestial: CelestialLightConfig = {
    mode: 'sun',
    azimuthDeg: 135,
    altitudeDeg: 42,
    shadowDarkness: 72,
    showSkyOrb: false,
  };

  static syncLights(
    scene: Scene,
    lightNodes: readonly LightSourceNode[],
    celestial?: CelestialLightConfig,
    walls?: readonly MapWallSegmentNode[],
  ): void {
    if (celestial) {
      this.currentCelestial = celestial;
    }

    this.syncCelestialDirectionalLight(scene, this.currentCelestial);
    LightFixtureBuilder.rebuild(scene, lightNodes, walls);
  }

  static syncCelestialDirectionalLight(scene: Scene, config: CelestialLightConfig): void {
    this.currentCelestial = config;
    scene.shadowsEnabled = true;

    let hemi = scene.getLightByName('lw-hemi-light') as HemisphericLight | null;
    if (!hemi) {
      hemi = new HemisphericLight('lw-hemi-light', new Vector3(0, 1, 0), scene);
    }
    hemi.intensity = config.mode === 'sun' ? 0.52 : 0.32;
    hemi.diffuse = Color3.FromHexString(config.mode === 'sun' ? '#f6efe2' : '#89b4f8');
    hemi.groundColor = Color3.FromHexString(config.mode === 'sun' ? '#13241c' : '#060d14');

    const azRad = (config.azimuthDeg * Math.PI) / 180;
    const altRad = (Math.max(12, Math.min(82, config.altitudeDeg)) * Math.PI) / 180;
    const orbitRadius = 56;
    const lx = Math.cos(altRad) * Math.cos(azRad) * orbitRadius;
    const ly = Math.sin(altRad) * orbitRadius;
    const lz = Math.cos(altRad) * Math.sin(azRad) * orbitRadius;

    const lightPos = new Vector3(lx, ly, lz);
    const lightDir = lightPos.scale(-1).normalize();

    let dirLight = scene.getLightByName('lw-celestial-dir') as DirectionalLight | null;
    let shadowGen = this.shadowGenByScene.get(scene) ?? null;
    if (!dirLight || !shadowGen) {
      if (!dirLight) {
        dirLight = new DirectionalLight('lw-celestial-dir', lightDir, scene);
      } else {
        dirLight.direction.copyFrom(lightDir);
      }
      dirLight.autoUpdateExtends = true;
      dirLight.autoCalcShadowZBounds = true;
      dirLight.shadowMinZ = 1;
      dirLight.shadowMaxZ = 135;

      shadowGen = new ShadowGenerator(2048, dirLight);
      shadowGen.usePercentageCloserFiltering = true;
      shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      shadowGen.bias = 0.0012;
      shadowGen.normalBias = 0.015;
      this.shadowGenByScene.set(scene, shadowGen);
    } else {
      dirLight.direction.copyFrom(lightDir);
    }

    dirLight.position.copyFrom(lightPos);
    dirLight.intensity = config.mode === 'sun' ? 1.45 : 0.95;
    dirLight.diffuse = Color3.FromHexString(config.mode === 'sun' ? '#ffefd2' : '#9cc5ff');
    dirLight.specular = Color3.FromHexString(config.mode === 'sun' ? '#ffe0a3' : '#6c9be0');

    shadowGen.darkness = Math.max(0.08, Math.min(0.88, (100 - config.shadowDarkness) / 100));

    let skyOrb = scene.getMeshByName('lw-celestial-sky-orb') as Mesh | null;
    if (!skyOrb) {
      skyOrb = MeshBuilder.CreateSphere(
        'lw-celestial-sky-orb',
        { diameter: 1.35, segments: 12 },
        scene,
      );
      skyOrb.isPickable = false;
      const skyMat = new StandardMaterial('lw-celestial-sky-mat', scene);
      skyOrb.material = skyMat;
    }

    const skyMat = skyOrb.material as StandardMaterial | null;
    if (skyMat) {
      skyMat.emissiveColor = Color3.FromHexString(
        config.mode === 'sun' ? '#ffd269' : '#9ec8ff',
      );
      skyMat.diffuseColor = skyMat.emissiveColor;
    }
    skyOrb.position.set(lx * 0.55, Math.max(4.2, ly * 0.45), lz * 0.55);
    skyOrb.setEnabled(Boolean(config.showSkyOrb));
  }

  static refreshShadowCasters(scene: Scene): void {
    LightFixtureBuilder.refreshCasters(scene);
    const shadowGen = this.shadowGenByScene.get(scene);
    if (!shadowGen) return;
    const shadowMap = shadowGen.getShadowMap();
    if (!shadowMap) return;

    const terrainGround = scene.getMeshByName('lw-terrain-ground');
    if (terrainGround) {
      terrainGround.receiveShadows = true;
      if (terrainGround.material instanceof StandardMaterial) {
        terrainGround.material.maxSimultaneousLights = 12;
      }
    }
    const vttGround = scene.getMeshByName('lw-vtt-ground');
    if (vttGround) {
      vttGround.receiveShadows = true;
      if (vttGround.material instanceof StandardMaterial) {
        vttGround.material.maxSimultaneousLights = 12;
      }
    }

    shadowMap.renderList = [];
    for (const mesh of scene.meshes) {
      if (isScatterMesh(mesh)) continue;
      if (isNonShadowCastingVttMesh(mesh)) {
        continue;
      }
      if (
        mesh.name.startsWith('lw-wall-') ||
        mesh.name.startsWith('lw-door-') ||
        mesh.name.startsWith('lw-stamp-') ||
        mesh.name.startsWith('lw-token-') ||
        (Boolean(mesh.metadata?.lwNodeName) && !mesh.name.startsWith('lw-light-'))
      ) {
        shadowMap.renderList.push(mesh);
      }
    }
  }
}

function isNonShadowCastingVttMesh(mesh: AbstractMesh): boolean {
  const n = mesh.name;
  if (
    n.startsWith('lw-token-hitbox-') ||
    n.startsWith('lw-target-reticle-') ||
    n.startsWith('lw-token-glow-') ||
    n.startsWith('lw-token-aura-') ||
    n.startsWith('lw-token-sel-ring-') ||
    n.startsWith('lw-token-rim-') ||
    n.startsWith('lw-token-grass-') ||
    n.startsWith('lw-token-rock-') ||
    n.startsWith('lw-token-move-')
  ) {
    return true;
  }
  const matName = mesh.material?.name ?? '';
  if (matName.startsWith('lw-stamp-decal-mat-') || matName.startsWith('lw-token-glowmat-')) {
    return true;
  }
  return false;
}

/** Scatter props are numerous and tiny; re-rendering them into the shadow map each frame is the costly part. */
function isScatterMesh(mesh: AbstractMesh): boolean {
  for (let node: Node | null = mesh; node; node = node.parent) {
    if (node.name.startsWith('lw-scatter-')) return true;
  }
  return false;
}
