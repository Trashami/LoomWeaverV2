import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  Engine,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { VttTokenVm, getTokenRimColorHex } from './effect-timeline.contract';
import { attachVolumetricFogToMaterial } from './babylon-volumetric-fog.plugin';

const radialGlowTexByScene = new WeakMap<Scene, DynamicTexture>();
const verticalPlumeTexByScene = new WeakMap<Scene, DynamicTexture>();

function getOrCreateRadialGlowTexture(scene: Scene): DynamicTexture {
  const existing = radialGlowTexByScene.get(scene);
  if (existing) return existing;

  const size = 256;
  const dt = new DynamicTexture('lw-shared-token-radial-glow-dt', { width: size, height: size }, scene, true);
  dt.hasAlpha = true;
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, size * 0.48);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
  grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.68)');
  grad.addColorStop(0.48, 'rgba(255, 255, 255, 0.30)');
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.08)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  dt.update(false);

  radialGlowTexByScene.set(scene, dt);
  return dt;
}

function getOrCreateVerticalPlumeTexture(scene: Scene): DynamicTexture {
  const existing = verticalPlumeTexByScene.get(scene);
  if (existing) return existing;

  const size = 256;
  const dt = new DynamicTexture('lw-shared-token-plume-glow-dt', { width: size, height: size }, scene, true);
  dt.hasAlpha = true;
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);

  // Soft elliptical character-hugging vertical aura shroud
  ctx.save();
  ctx.translate(size / 2, size * 0.54);
  ctx.scale(0.68, 1.0);
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, size * 0.46);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.90)');
  grad.addColorStop(0.32, 'rgba(255, 255, 255, 0.52)');
  grad.addColorStop(0.64, 'rgba(255, 255, 255, 0.16)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  dt.update(false);

  verticalPlumeTexByScene.set(scene, dt);
  return dt;
}

export function isTokenAmbientGlowActive(token: VttTokenVm): boolean {
  return token.ambientGlowEnabled !== false;
}

export function resolveTokenAmbientGlowColorHex(token: VttTokenVm): string {
  return token.ambientGlowColorHex || getTokenRimColorHex(token);
}

export function attachTokenLightAndGlowMeshes(
  scene: Scene,
  token: VttTokenVm,
  baseMesh: Mesh,
  effectiveScale: number,
  baseHeight: number,
  tokenOpacity = 1.0,
): void {
  if (token.emitsLight) {
    const lightHex = token.lightColorHex || '#ff9922';
    const dimFeet = Math.max(10, token.lightDimFeet ?? 40);
    const rangeWorld = Math.max(2.5, dimFeet / 5);
    const pt = new PointLight(`lw-token-light-${token.key}`, new Vector3(0, 0.85 * effectiveScale, 0), scene);
    pt.parent = baseMesh;
    pt.diffuse = Color3.FromHexString(lightHex);
    pt.specular = Color3.FromHexString(lightHex).scale(0.25);
    pt.range = rangeWorld * 1.35;
    pt.intensity = 1.25 * tokenOpacity;
  }

  if (isTokenAmbientGlowActive(token)) {
    const glowHex = resolveTokenAmbientGlowColorHex(token);
    const glowColor = Color3.FromHexString(glowHex);
    const rawIntensity = token.ambientGlowEnabled
      ? (token.ambientGlowIntensity ?? 0.72)
      : (token.ambientGlowIntensity ?? 0.52);
    const glowIntensity = Math.max(0.15, Math.min(1.0, rawIntensity)) * tokenOpacity;
    const glowRadiusFeet = token.ambientGlowRadiusFeet ?? 10;
    const glowRadiusWorld = Math.max(0.72 * effectiveScale, (glowRadiusFeet / 5) * 0.58);

    // 1. Real 3D PointLight emitting from the character's chest to illuminate miniature, grass/rocks, and terrain
    if (!token.emitsLight) {
      const auraLight = new PointLight(
        `lw-token-light-${token.key}`,
        new Vector3(0, baseHeight / 2 + 0.58 * effectiveScale, 0),
        scene,
      );
      auraLight.parent = baseMesh;
      auraLight.diffuse = glowColor;
      auraLight.specular = glowColor.scale(0.32);
      auraLight.range = Math.max(2.4 * effectiveScale, glowRadiusWorld * 2.3);
      auraLight.intensity = glowIntensity * 1.35;
    }

    const radialTex = getOrCreateRadialGlowTexture(scene);
    const plumeTex = getOrCreateVerticalPlumeTexture(scene);

    // 2. Volumetric 3D Body Halo billboard centered on the character's torso
    const haloMat = new StandardMaterial(`lw-token-glowmat-halo-${token.key}`, scene);
    haloMat.disableLighting = true;
    haloMat.backFaceCulling = false;
    haloMat.diffuseTexture = radialTex;
    haloMat.emissiveTexture = radialTex;
    haloMat.useAlphaFromDiffuseTexture = true;
    haloMat.emissiveColor = glowColor.scale(glowIntensity * 1.15);
    haloMat.alpha = Math.min(0.92, glowIntensity * 0.85);
    haloMat.alphaMode = Engine.ALPHA_ADD;
    haloMat.disableDepthWrite = true;
    attachVolumetricFogToMaterial(haloMat);

    const haloSize = Math.max(1.28 * effectiveScale, glowRadiusWorld * 1.35);
    const bodyHalo = MeshBuilder.CreatePlane(
      `lw-token-glow-halo-${token.key}`,
      { width: haloSize, height: haloSize },
      scene,
    );
    bodyHalo.parent = baseMesh;
    bodyHalo.position.set(0, baseHeight / 2 + 0.54 * effectiveScale, 0);
    bodyHalo.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    bodyHalo.renderingGroupId = 0;
    bodyHalo.alphaIndex = 14;
    bodyHalo.isPickable = false;
    bodyHalo.metadata = { baseScale: 1.0, phaseOffset: (token.x * 1.7 + token.z * 2.3) % 6.28 };
    bodyHalo.material = haloMat;

    // 3. Vertical Character-Hugging Aura Plume rising from base to head
    const plumeMat = new StandardMaterial(`lw-token-glowmat-plume-${token.key}`, scene);
    plumeMat.disableLighting = true;
    plumeMat.backFaceCulling = false;
    plumeMat.diffuseTexture = plumeTex;
    plumeMat.emissiveTexture = plumeTex;
    plumeMat.useAlphaFromDiffuseTexture = true;
    plumeMat.emissiveColor = glowColor.scale(glowIntensity * 0.95);
    plumeMat.alpha = Math.min(0.88, glowIntensity * 0.72);
    plumeMat.alphaMode = Engine.ALPHA_ADD;
    plumeMat.disableDepthWrite = true;
    attachVolumetricFogToMaterial(plumeMat);

    const plumeW = Math.max(1.05 * effectiveScale, glowRadiusWorld * 0.95);
    const plumeH = Math.max(1.42 * effectiveScale, glowRadiusWorld * 1.15);
    const bodyPlume = MeshBuilder.CreatePlane(
      `lw-token-glow-plume-${token.key}`,
      { width: plumeW, height: plumeH },
      scene,
    );
    bodyPlume.parent = baseMesh;
    bodyPlume.position.set(0, baseHeight / 2 + 0.56 * effectiveScale, 0);
    bodyPlume.billboardMode = AbstractMesh.BILLBOARDMODE_Y;
    bodyPlume.renderingGroupId = 0;
    bodyPlume.alphaIndex = 15;
    bodyPlume.isPickable = false;
    bodyPlume.metadata = { baseScale: 1.0, phaseOffset: (token.x * 2.1 + token.z * 1.3) % 6.28 };
    bodyPlume.material = plumeMat;

    // 4. Soft Feathered Ground Light Pool (no hard torus ring!)
    const poolRadius = Math.max(0.68 * effectiveScale, glowRadiusWorld * 0.92);
    const groundPool = MeshBuilder.CreateDisc(
      `lw-token-glow-pool-${token.key}`,
      { radius: poolRadius, tessellation: 36, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    groundPool.parent = baseMesh;
    groundPool.position.set(0, -baseHeight / 2 + 0.018, 0);
    groundPool.rotation.x = Math.PI / 2;
    groundPool.renderingGroupId = 0;
    groundPool.alphaIndex = 12;
    groundPool.isPickable = false;
    groundPool.material = haloMat;
  }
}

export function animateTokenAmbientGlows(scene: Scene, nowMs: number): void {
  const t = nowMs * 0.0028;
  for (const m of scene.meshes) {
    if (m.name.startsWith('lw-token-glow-halo-')) {
      const phase = typeof m.metadata?.phaseOffset === 'number' ? m.metadata.phaseOffset : 0;
      const pulse = 1.0 + Math.sin(t + phase) * 0.065;
      m.scaling.set(pulse, pulse, pulse);
    } else if (m.name.startsWith('lw-token-glow-plume-')) {
      const phase = typeof m.metadata?.phaseOffset === 'number' ? m.metadata.phaseOffset : 0;
      const sx = 1.0 + Math.sin(t * 1.15 + phase) * 0.05;
      const sy = 1.0 + Math.cos(t * 0.9 + phase) * 0.07;
      m.scaling.set(sx, sy, 1.0);
    }
  }
}

export function createSpinningBaseTargetReticleMesh(
  scene: Scene,
  tokenKey: string,
  x: number,
  groundY: number,
  z: number,
  effectiveScale: number,
): void {
  const root = new Mesh(`lw-target-reticle-root-${tokenKey}`, scene);
  root.position.set(x, groundY + 0.025, z);
  root.isPickable = false;

  const reticleMat = new StandardMaterial(`lw-target-reticle-mat-${tokenKey}`, scene);
  reticleMat.diffuseColor = Color3.FromHexString('#881313');
  reticleMat.emissiveColor = Color3.FromHexString('#7f1d1d').scale(0.4);
  reticleMat.specularColor = Color3.Black();
  reticleMat.alpha = 0.88;

  const outerRing = MeshBuilder.CreateTorus(
    `lw-target-reticle-outer-${tokenKey}`,
    { diameter: 1.05 * effectiveScale, thickness: 0.035 * effectiveScale, tessellation: 36 },
    scene,
  );
  outerRing.parent = root;
  outerRing.material = reticleMat;
  outerRing.renderingGroupId = 0;
  outerRing.alphaIndex = 10;
  outerRing.isPickable = false;

  const innerRing = MeshBuilder.CreateTorus(
    `lw-target-reticle-inner-${tokenKey}`,
    { diameter: 0.56 * effectiveScale, thickness: 0.025 * effectiveScale, tessellation: 28 },
    scene,
  );
  innerRing.parent = root;
  innerRing.material = reticleMat;
  innerRing.renderingGroupId = 0;
  innerRing.alphaIndex = 10;
  innerRing.isPickable = false;
}
