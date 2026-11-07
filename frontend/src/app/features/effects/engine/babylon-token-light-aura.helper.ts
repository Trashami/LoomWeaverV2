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
  // Hollow-core silhouette rim gradient so the center where the character stands is never washed out
  const grad = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.49);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.02)');
  grad.addColorStop(0.24, 'rgba(255, 255, 255, 0.08)');
  grad.addColorStop(0.38, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(0.56, 'rgba(255, 255, 255, 0.40)');
  grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.12)');
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

  // Soft elliptical silhouette backlight shroud (clean core so character textures stay crisp)
  ctx.save();
  ctx.translate(size / 2, size * 0.54);
  ctx.scale(0.68, 1.0);
  const grad = ctx.createRadialGradient(0, 0, size * 0.06, 0, 0, size * 0.46);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.03)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.12)');
  grad.addColorStop(0.44, 'rgba(255, 255, 255, 0.58)');
  grad.addColorStop(0.68, 'rgba(255, 255, 255, 0.22)');
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

/**
 * Excludes the token's own miniature, puck portrait, and base meshes from its own PointLight
 * so the 3D PointLight illuminates the surrounding 3D terrain, rocks, walls, and props
 * without washing out the character itself.
 */
export function syncTokenPointLightExcludedMeshes(scene: Scene, tokenKey: string): void {
  const pt = scene.getLightByName(`lw-token-light-${tokenKey}`) as PointLight | null;
  if (!pt) return;
  const baseMesh = scene.getMeshByName(`lw-token-${tokenKey}`);
  if (!baseMesh) return;

  const excluded = new Set(pt.excludedMeshes);
  excluded.add(baseMesh);
  for (const child of baseMesh.getChildMeshes()) {
    if (
      child.name.startsWith(`lw-token-part-${tokenKey}-`) ||
      child.name.startsWith(`lw-token-mini-${tokenKey}-`) ||
      child.name.startsWith(`lw-token-puck-`)
    ) {
      excluded.add(child);
    }
  }
  pt.excludedMeshes = Array.from(excluded);
}

export function isTokenAmbientGlowActive(token: VttTokenVm): boolean {
  return token.ambientGlowEnabled === true;
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
    const rawIntensity = token.ambientGlowIntensity ?? 0.65;
    const glowIntensity = Math.max(0.15, Math.min(1.0, rawIntensity)) * tokenOpacity;
    const glowRadiusFeet = token.ambientGlowRadiusFeet ?? 10;
    const glowRadiusWorld = Math.max(0.72 * effectiveScale, (glowRadiusFeet / 5) * 0.58);

    // 1. Real 3D PointLight emitting from the character's chest when Ambient Glow is explicitly enabled
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
      auraLight.intensity = glowIntensity * 1.15;
    }

    const radialTex = getOrCreateRadialGlowTexture(scene);
    const plumeTex = getOrCreateVerticalPlumeTexture(scene);

    // 2. Volumetric 3D Body Halo billboard rendered BEHIND the character (alphaIndex = 6) so the character is never washed out
    const haloMat = new StandardMaterial(`lw-token-glowmat-halo-${token.key}`, scene);
    haloMat.disableLighting = true;
    haloMat.backFaceCulling = false;
    haloMat.diffuseTexture = radialTex;
    haloMat.emissiveTexture = radialTex;
    haloMat.useAlphaFromDiffuseTexture = true;
    haloMat.emissiveColor = glowColor.scale(glowIntensity * 0.85);
    haloMat.alpha = Math.min(0.78, glowIntensity * 0.72);
    haloMat.alphaMode = Engine.ALPHA_ADD;
    haloMat.disableDepthWrite = true;
    attachVolumetricFogToMaterial(haloMat);

    const haloSize = Math.max(1.38 * effectiveScale, glowRadiusWorld * 1.38);
    const bodyHalo = MeshBuilder.CreatePlane(
      `lw-token-glow-halo-${token.key}`,
      { width: haloSize, height: haloSize },
      scene,
    );
    bodyHalo.parent = baseMesh;
    bodyHalo.position.set(0, baseHeight / 2 + 0.54 * effectiveScale, 0);
    bodyHalo.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    bodyHalo.renderingGroupId = 0;
    bodyHalo.alphaIndex = 6;
    bodyHalo.isPickable = false;
    bodyHalo.metadata = { baseScale: 1.0, phaseOffset: (token.x * 1.7 + token.z * 2.3) % 6.28 };
    bodyHalo.material = haloMat;

    // 3. Vertical Character-Hugging Aura Plume rendered BEHIND the character (alphaIndex = 7)
    const plumeMat = new StandardMaterial(`lw-token-glowmat-plume-${token.key}`, scene);
    plumeMat.disableLighting = true;
    plumeMat.backFaceCulling = false;
    plumeMat.diffuseTexture = plumeTex;
    plumeMat.emissiveTexture = plumeTex;
    plumeMat.useAlphaFromDiffuseTexture = true;
    plumeMat.emissiveColor = glowColor.scale(glowIntensity * 0.75);
    plumeMat.alpha = Math.min(0.72, glowIntensity * 0.62);
    plumeMat.alphaMode = Engine.ALPHA_ADD;
    plumeMat.disableDepthWrite = true;
    attachVolumetricFogToMaterial(plumeMat);

    const plumeW = Math.max(1.12 * effectiveScale, glowRadiusWorld * 0.98);
    const plumeH = Math.max(1.45 * effectiveScale, glowRadiusWorld * 1.18);
    const bodyPlume = MeshBuilder.CreatePlane(
      `lw-token-glow-plume-${token.key}`,
      { width: plumeW, height: plumeH },
      scene,
    );
    bodyPlume.parent = baseMesh;
    bodyPlume.position.set(0, baseHeight / 2 + 0.56 * effectiveScale, 0);
    bodyPlume.billboardMode = AbstractMesh.BILLBOARDMODE_Y;
    bodyPlume.renderingGroupId = 0;
    bodyPlume.alphaIndex = 7;
    bodyPlume.isPickable = false;
    bodyPlume.metadata = { baseScale: 1.0, phaseOffset: (token.x * 2.1 + token.z * 1.3) % 6.28 };
    bodyPlume.material = plumeMat;

    // 4. Soft Feathered Ground Light Pool on the terrain around the base (alphaIndex = 5)
    const poolRadius = Math.max(0.72 * effectiveScale, glowRadiusWorld * 0.96);
    const groundPool = MeshBuilder.CreateDisc(
      `lw-token-glow-pool-${token.key}`,
      { radius: poolRadius, tessellation: 36, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    groundPool.parent = baseMesh;
    groundPool.position.set(0, -baseHeight / 2 + 0.018, 0);
    groundPool.rotation.x = Math.PI / 2;
    groundPool.renderingGroupId = 0;
    groundPool.alphaIndex = 5;
    groundPool.isPickable = false;
    groundPool.material = haloMat;
  }

  syncTokenPointLightExcludedMeshes(scene, token.key);
}

/**
 * Attaches or updates an optional floating 3D billboard life bar above a character/token's head.
 * Uses an unlit DynamicTexture (`disableLighting = true`) so it stays 100% crisp under any lighting.
 */
export function syncTokenFloatingHealthBarMesh(
  scene: Scene,
  token: VttTokenVm,
  baseMesh: Mesh,
  effectiveScale: number,
  baseHeight: number,
  isTopDown2D: boolean,
  showHealthBar: boolean,
  tokenOpacity: number,
): void {
  const barMeshName = `lw-token-hpbar-${token.key}`;
  const existingBar = scene.getMeshByName(barMeshName) as Mesh | null;

  if (!showHealthBar || tokenOpacity <= 0.08 || token.maxHp <= 0) {
    if (existingBar) {
      existingBar.material?.dispose(true, true);
      existingBar.dispose();
    }
    return;
  }

  const curHp = Math.max(0, Math.round(token.currentHp));
  const maxHp = Math.max(1, Math.round(token.maxHp));
  const hpRatio = Math.max(0, Math.min(1, curHp / maxHp));
  const hpSig = `${curHp}/${maxHp}|${token.name}|${token.faction}|${isTopDown2D ? '2d' : '3d'}|${effectiveScale.toFixed(2)}`;

  let barPlane = existingBar;
  if (!barPlane) {
    const planeW = 1.02 * Math.max(0.85, Math.min(1.45, effectiveScale));
    const planeH = 0.24 * Math.max(0.85, Math.min(1.45, effectiveScale));
    barPlane = MeshBuilder.CreatePlane(barMeshName, { width: planeW, height: planeH }, scene);
    barPlane.parent = baseMesh;
    barPlane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    barPlane.renderingGroupId = 0;
    barPlane.alphaIndex = 24;
    barPlane.isPickable = false;
  }

  const has3dModel = !isTopDown2D && Boolean(token.glbUrl);
  if (has3dModel) {
    barPlane.position.set(0, baseHeight / 2 + 1.24 * effectiveScale, 0);
  } else {
    barPlane.position.set(0, baseHeight / 2 + 0.28 * effectiveScale, 0.52 * effectiveScale);
  }
  barPlane.visibility = tokenOpacity;
  barPlane.isPickable = false;

  if (barPlane.metadata?.hpSig === hpSig) {
    return;
  }
  barPlane.metadata = { tokenKey: token.key, hpSig };

  const texW = 256;
  const texH = 64;
  let mat = barPlane.material as StandardMaterial | null;
  let dt: DynamicTexture;
  if (!mat || !(mat.diffuseTexture instanceof DynamicTexture)) {
    mat?.dispose(true, true);
    dt = new DynamicTexture(`lw-token-hpbar-dt-${token.key}`, { width: texW, height: texH }, scene, true);
    dt.hasAlpha = true;
    mat = new StandardMaterial(`lw-token-hpbar-mat-${token.key}`, scene);
    mat.diffuseTexture = dt;
    mat.emissiveTexture = dt;
    mat.opacityTexture = dt;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.useAlphaFromDiffuseTexture = true;
    barPlane.material = mat;
  } else {
    dt = mat.diffuseTexture as DynamicTexture;
  }

  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, texW, texH);

  const padX = 8;
  const padY = 6;
  const boxW = texW - padX * 2;
  const boxH = texH - padY * 2;
  const radius = 12;

  ctx.fillStyle = 'rgba(5, 14, 11, 0.92)';
  ctx.beginPath();
  ctx.roundRect(padX, padY, boxW, boxH, radius);
  ctx.fill();

  const borderStroke =
    token.faction === 'hostile'
      ? 'rgba(239, 93, 114, 0.72)'
      : token.faction === 'ally'
        ? 'rgba(56, 189, 248, 0.72)'
        : 'rgba(73, 232, 146, 0.72)';
  ctx.strokeStyle = borderStroke;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  const shortName = token.name.length > 13 ? `${token.name.slice(0, 12)}…` : token.name;
  ctx.font = '700 15px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#f3e8d0';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(shortName, padX + 10, padY + 17);

  ctx.font = '700 14px Inter, system-ui, sans-serif';
  ctx.fillStyle = hpRatio <= 0.25 ? '#fca5a5' : hpRatio <= 0.5 ? '#fde68a' : '#86efac';
  ctx.textAlign = 'right';
  ctx.fillText(`${curHp}/${maxHp}`, padX + boxW - 10, padY + 17);

  const trackX = padX + 10;
  const trackY = padY + 31;
  const trackW = boxW - 20;
  const trackH = 12;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.beginPath();
  ctx.roundRect(trackX, trackY, trackW, trackH, 6);
  ctx.fill();

  if (hpRatio > 0) {
    const fillW = Math.max(8, Math.round(trackW * hpRatio));
    const fillGrad = ctx.createLinearGradient(trackX, trackY, trackX + fillW, trackY);
    if (hpRatio > 0.5) {
      fillGrad.addColorStop(0, '#16a34a');
      fillGrad.addColorStop(1, '#49e892');
    } else if (hpRatio > 0.25) {
      fillGrad.addColorStop(0, '#d97706');
      fillGrad.addColorStop(1, '#fbbf24');
    } else {
      fillGrad.addColorStop(0, '#b91c1c');
      fillGrad.addColorStop(1, '#ef4444');
    }
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.roundRect(trackX, trackY, fillW, trackH, 6);
    ctx.fill();
  }

  dt.update(false);
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
  reticleMat.diffuseColor = Color3.FromHexString('#dc2626');
  reticleMat.emissiveColor = Color3.FromHexString('#ef4444').scale(0.75);
  reticleMat.specularColor = Color3.Black();
  reticleMat.alpha = 0.92;
  attachVolumetricFogToMaterial(reticleMat);

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
