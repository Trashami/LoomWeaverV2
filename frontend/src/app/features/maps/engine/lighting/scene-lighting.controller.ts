import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { LightSourceNode } from '../map-scene-contract';
import { LightFixtureBuilder } from './light-fixture.builder';

export interface CelestialLightConfig {
  readonly mode: 'sun' | 'moon';
  readonly azimuthDeg: number;
  readonly altitudeDeg: number;
  readonly shadowDarkness: number;
  readonly showSkyOrb?: boolean;
}

export class SceneLightingController {
  private static shadowGen: ShadowGenerator | null = null;
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
  ): void {
    if (celestial) {
      this.currentCelestial = celestial;
    }

    this.syncCelestialDirectionalLight(scene, this.currentCelestial);
    LightFixtureBuilder.rebuild(scene, lightNodes);
  }

  static syncCelestialDirectionalLight(scene: Scene, config: CelestialLightConfig): void {
    this.currentCelestial = config;

    let hemi = scene.getLightByName('lw-hemi-light') as HemisphericLight | null;
    if (!hemi) {
      hemi = new HemisphericLight('lw-hemi-light', new Vector3(0, 1, 0), scene);
    }
    hemi.intensity = config.mode === 'sun' ? 0.52 : 0.28;
    hemi.diffuse = Color3.FromHexString(config.mode === 'sun' ? '#f6efe2' : '#89b4f8');
    hemi.groundColor = Color3.FromHexString(config.mode === 'sun' ? '#13241c' : '#060d14');

    const azRad = (config.azimuthDeg * Math.PI) / 180;
    const altRad = (Math.max(8, Math.min(88, config.altitudeDeg)) * Math.PI) / 180;
    const orbitRadius = 26;
    const lx = Math.cos(altRad) * Math.cos(azRad) * orbitRadius;
    const ly = Math.sin(altRad) * orbitRadius;
    const lz = Math.cos(altRad) * Math.sin(azRad) * orbitRadius;

    const lightPos = new Vector3(lx, ly, lz);
    const lightDir = lightPos.scale(-1).normalize();

    let dirLight = scene.getLightByName('lw-celestial-dir') as DirectionalLight | null;
    if (!dirLight) {
      dirLight = new DirectionalLight('lw-celestial-dir', lightDir, scene);
      this.shadowGen = new ShadowGenerator(1024, dirLight);
      this.shadowGen.useBlurExponentialShadowMap = true;
      this.shadowGen.blurKernel = 12;
    } else {
      dirLight.direction.copyFrom(lightDir);
    }

    dirLight.position.copyFrom(lightPos);
    dirLight.intensity = config.mode === 'sun' ? 1.45 : 0.88;
    dirLight.diffuse = Color3.FromHexString(config.mode === 'sun' ? '#ffefd2' : '#9cc5ff');
    dirLight.specular = Color3.FromHexString(config.mode === 'sun' ? '#ffe0a3' : '#6c9be0');

    if (this.shadowGen) {
      this.shadowGen.darkness = Math.max(0, Math.min(0.95, (100 - config.shadowDarkness) / 100));
    }

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
    if (!this.shadowGen) return;
    const shadowMap = this.shadowGen.getShadowMap();
    if (!shadowMap) return;
    shadowMap.renderList = [];
    for (const mesh of scene.meshes) {
      if (
        mesh.name.startsWith('lw-wall-') ||
        mesh.name.startsWith('lw-door-') ||
        mesh.name.startsWith('lw-stamp-') ||
        (Boolean(mesh.metadata?.lwNodeName) && !mesh.name.startsWith('lw-light-'))
      ) {
        shadowMap.renderList.push(mesh);
      }
    }
  }
}
