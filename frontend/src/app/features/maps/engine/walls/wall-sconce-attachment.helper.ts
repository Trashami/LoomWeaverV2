import * as BABYLON from '@babylonjs/core';
import { WallSegmentNode } from '../map-scene-contract';

export interface WallSurfaceSnapResult {
  snapped: boolean;
  x: number;
  z: number;
  wallId?: string;
  outwardNormalX: number;
  outwardNormalZ: number;
  rotationYRad: number;
  rotationYDeg: number;
  suggestedElevationY: number;
}

/**
 * Checks if a world point (rawX, rawZ) is near any wall segment face.
 * If within maxSnapDistMeters, snaps the point flush against the nearest wall face
 * and computes the outward-facing normal + rotation so wall sconces, torches,
 * banners, and wall props mount naturally onto the wall.
 */
export function snapToNearestWallFace(
  walls: readonly WallSegmentNode[] | undefined,
  rawX: number,
  rawZ: number,
  surfaceClearanceMeters = 0.14,
  maxSnapDistMeters = 0.95,
): WallSurfaceSnapResult {
  const fallback: WallSurfaceSnapResult = {
    snapped: false,
    x: rawX,
    z: rawZ,
    outwardNormalX: 0,
    outwardNormalZ: 1,
    rotationYRad: 0,
    rotationYDeg: 0,
    suggestedElevationY: 1.75,
  };

  if (!walls || walls.length === 0) return fallback;

  let bestDist = maxSnapDistMeters;
  let bestResult: WallSurfaceSnapResult | null = null;

  for (const wall of walls) {
    const pts = wall.points || [];
    if (pts.length < 2) continue;
    const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';
    const segCount = closed ? pts.length : pts.length - 1;
    const thickness = Math.max(0.12, wall.thicknessMeters || 0.32);
    const height = Math.max(1.2, wall.heightMeters || 2.8);

    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ax = a[0];
      const az = a[1];
      const bx = b[0];
      const bz = b[1];
      const dx = bx - ax;
      const dz = bz - az;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.01) continue;

      const len = Math.sqrt(lenSq);
      // Clamp slightly inside segment ends so sconces don't hang off corner edges
      const marginT = Math.min(0.18, 0.22 / len);
      const rawT = ((rawX - ax) * dx + (rawZ - az) * dz) / lenSq;
      const t = Math.max(marginT, Math.min(1 - marginT, rawT));

      const projX = ax + dx * t;
      const projZ = az + dz * t;
      const toRawX = rawX - projX;
      const toRawZ = rawZ - projZ;
      const distFromCenterline = Math.hypot(toRawX, toRawZ);

      if (distFromCenterline > bestDist) continue;

      // Determine perpendicular normal pointing toward the cursor side of the wall
      const ux = dx / len;
      const uz = dz / len;
      let nx = -uz;
      let nz = ux;
      if (toRawX * nx + toRawZ * nz < 0) {
        nx = -nx;
        nz = -nz;
      }

      const mountOffset = thickness * 0.5 + surfaceClearanceMeters;
      const snappedX = Number((projX + nx * mountOffset).toFixed(3));
      const snappedZ = Number((projZ + nz * mountOffset).toFixed(3));
      const rotationYRad = Math.atan2(nx, nz);
      const rotationYDeg = Number(((rotationYRad * 180) / Math.PI).toFixed(1));

      bestDist = distFromCenterline;
      bestResult = {
        snapped: true,
        x: snappedX,
        z: snappedZ,
        wallId: wall.id,
        outwardNormalX: nx,
        outwardNormalZ: nz,
        rotationYRad,
        rotationYDeg,
        suggestedElevationY: Number(Math.min(height * 0.68, Math.max(1.45, height * 0.62)).toFixed(2)),
      };
    }
  }

  return bestResult ?? fallback;
}

/**
 * Builds a 3D wrought-iron Wall Sconce bracket + torch cup + glowing flame/crystal
 * mounted flush against a wall face when a light is placed on or near a wall.
 */
export function buildWallSconceFixtureMesh(
  scene: BABYLON.Scene,
  lightId: string,
  pos: BABYLON.Vector3,
  wallSnap: WallSurfaceSnapResult,
  lightColor: BABYLON.Color3,
  intensity: number,
  tagLightSubMesh: (m: BABYLON.Mesh) => void,
): BABYLON.Mesh {
  const ironMat = new BABYLON.StandardMaterial(`sconceIron_${lightId}`, scene);
  ironMat.diffuseColor = new BABYLON.Color3(0.16, 0.17, 0.20);
  ironMat.specularColor = new BABYLON.Color3(0.35, 0.35, 0.40);

  const brassMat = new BABYLON.StandardMaterial(`sconceBrass_${lightId}`, scene);
  brassMat.diffuseColor = new BABYLON.Color3(0.62, 0.47, 0.22);
  brassMat.specularColor = new BABYLON.Color3(0.75, 0.62, 0.34);

  const flameMat = new BABYLON.StandardMaterial(`sconceFlame_${lightId}`, scene);
  flameMat.diffuseColor = lightColor;
  flameMat.emissiveColor = lightColor.scale(Math.min(2.2, 0.95 + intensity * 0.35));
  flameMat.disableLighting = true;

  // Root flame/orb mesh at the light emission point
  const flameMesh = BABYLON.MeshBuilder.CreateCylinder(
    `mapLightSconceFlame_${lightId}`,
    { diameterTop: 0.04, diameterBottom: 0.18, height: 0.28, tessellation: 10 },
    scene,
  );
  flameMesh.position.copyFrom(pos);
  flameMesh.rotation.y = wallSnap.rotationYRad;
  flameMesh.material = flameMat;
  tagLightSubMesh(flameMesh);

  // Torch cup beneath the flame
  const cup = BABYLON.MeshBuilder.CreateCylinder(
    `mapLightSconceCup_${lightId}`,
    { diameterTop: 0.22, diameterBottom: 0.10, height: 0.16, tessellation: 10 },
    scene,
  );
  cup.parent = flameMesh;
  cup.position.set(0, -0.16, 0);
  cup.material = brassMat;
  tagLightSubMesh(cup);

  // Torch shaft extending down from cup
  const shaft = BABYLON.MeshBuilder.CreateCylinder(
    `mapLightSconceShaft_${lightId}`,
    { diameterTop: 0.07, diameterBottom: 0.045, height: 0.38, tessellation: 8 },
    scene,
  );
  shaft.parent = flameMesh;
  shaft.position.set(0, -0.32, -0.02);
  shaft.rotation.x = -0.18;
  shaft.material = ironMat;
  tagLightSubMesh(shaft);

  // Horizontal wrought-iron arm reaching back to the wall face (-Z in local space)
  const arm = BABYLON.MeshBuilder.CreateBox(
    `mapLightSconceArm_${lightId}`,
    { width: 0.05, height: 0.05, depth: 0.18 },
    scene,
  );
  arm.parent = flameMesh;
  arm.position.set(0, -0.22, -0.08);
  arm.material = ironMat;
  tagLightSubMesh(arm);

  // Wall backplate mounted flush against the wall surface
  const backplate = BABYLON.MeshBuilder.CreateBox(
    `mapLightSconcePlate_${lightId}`,
    { width: 0.16, height: 0.34, depth: 0.035 },
    scene,
  );
  backplate.parent = flameMesh;
  backplate.position.set(0, -0.22, -0.15);
  backplate.material = ironMat;
  tagLightSubMesh(backplate);

  return flameMesh;
}
