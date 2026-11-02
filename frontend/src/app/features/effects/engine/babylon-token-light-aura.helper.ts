import { Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { VttTokenVm } from './effect-timeline.contract';

export function attachTokenLightAndGlowMeshes(
  scene: Scene,
  token: VttTokenVm,
  baseMesh: Mesh,
  effectiveScale: number,
  baseHeight: number,
): void {
  if (token.emitsLight) {
    const lightHex = token.lightColorHex || '#ff9922';
    const dimFeet = Math.max(10, token.lightDimFeet ?? 40);
    const rangeWorld = Math.max(2.5, dimFeet / 5);
    const pt = new PointLight(`lw-token-light-${token.key}`, new Vector3(0, 0.85, 0), scene);
    pt.parent = baseMesh;
    pt.diffuse = Color3.FromHexString(lightHex);
    pt.specular = Color3.FromHexString(lightHex).scale(0.25);
    pt.range = rangeWorld * 1.35;
    pt.intensity = 1.25;

    const auraDisc = MeshBuilder.CreateDisc(
      `lw-token-light-aura-${token.key}`,
      { radius: Math.min(4.8, rangeWorld * 0.45), tessellation: 40 },
      scene,
    );
    auraDisc.parent = baseMesh;
    auraDisc.position.set(0, -baseHeight / 2 + 0.015, 0);
    auraDisc.rotation.x = Math.PI / 2;
    auraDisc.isPickable = false;
    const auraMat = new StandardMaterial(`lw-token-light-auramat-${token.key}`, scene);
    auraMat.disableLighting = true;
    auraMat.emissiveColor = Color3.FromHexString(lightHex);
    auraMat.alpha = 0.16;
    auraMat.backFaceCulling = false;
    auraDisc.material = auraMat;
  }

  if (token.ambientGlowEnabled) {
    const glowHex = token.ambientGlowColorHex || token.colorHex || '#2ee66b';
    const glowIntensity = Math.max(0.15, Math.min(1.0, token.ambientGlowIntensity ?? 0.65));
    const glowRadiusWorld = Math.max(0.65, ((token.ambientGlowRadiusFeet ?? 10) / 5) * 0.62);
    const glowRing = MeshBuilder.CreateTorus(
      `lw-token-glow-${token.key}`,
      {
        diameter: Math.max(1.05 * effectiveScale, glowRadiusWorld * 1.4),
        thickness: 0.075 * effectiveScale,
        tessellation: 40,
      },
      scene,
    );
    glowRing.parent = baseMesh;
    glowRing.position.set(0, 0.02, 0);
    glowRing.isPickable = false;
    const glowMat = new StandardMaterial(`lw-token-glowmat-${token.key}`, scene);
    glowMat.disableLighting = true;
    glowMat.emissiveColor = Color3.FromHexString(glowHex).scale(glowIntensity * 0.95);
    glowMat.alpha = Math.min(0.88, glowIntensity * 0.78);
    glowRing.material = glowMat;
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
  outerRing.isPickable = false;

  const innerRing = MeshBuilder.CreateTorus(
    `lw-target-reticle-inner-${tokenKey}`,
    { diameter: 0.56 * effectiveScale, thickness: 0.025 * effectiveScale, tessellation: 28 },
    scene,
  );
  innerRing.parent = root;
  innerRing.material = reticleMat;
  innerRing.isPickable = false;
}
