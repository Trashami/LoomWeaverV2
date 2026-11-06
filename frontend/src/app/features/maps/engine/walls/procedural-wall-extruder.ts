import * as BABYLON from '@babylonjs/core';
import { WallSegmentNode } from '../map-scene-contract';
import { ProceduralWallStyleSpec } from './procedural-wall-catalog';
import { getOrCreateProceduralWallMaterial, sampleProceduralWallRelief } from './procedural-wall-textures';

export interface ProceduralWallSpanOptions {
  spanId: string;
  centerX: number;
  centerZ: number;
  groundY: number;
  baseElevationY: number;
  spanLength: number;
  spanHeight: number;
  thickness: number;
  angleY: number;
  worldStartDistMeters: number;
  style: ProceduralWallStyleSpec;
  includePlinth: boolean;
  includeCoping: boolean;
}

const cachedTrimMaterials = new Map<string, BABYLON.PBRMaterial>();

export function getOrCreateWallTrimMaterial(
  scene: BABYLON.Scene,
  style: ProceduralWallStyleSpec,
): BABYLON.PBRMaterial {
  const key = `${scene.uid}|trim|${style.id}`;
  const cached = cachedTrimMaterials.get(key);
  if (cached) return cached;

  const mat = new BABYLON.PBRMaterial(`procWallTrim_${style.id}`, scene);
  mat.albedoColor = BABYLON.Color3.FromHexString(style.plinthColorHex);
  mat.roughness = Math.max(0.25, style.roughness - 0.08);
  mat.metallic = style.metallic;
  cachedTrimMaterials.set(key, mat);
  return mat;
}

/**
 * Builds a subdivided 3D procedural wall span with real vertex stone/brick/plank relief,
 * world-space continuous UVs, base plinth molding, and top coping ledge.
 */
export function buildProceduralWallSpan(
  scene: BABYLON.Scene,
  wall: WallSegmentNode,
  opts: ProceduralWallSpanOptions,
): BABYLON.Mesh[] {
  const created: BABYLON.Mesh[] = [];
  const {
    spanId,
    centerX,
    centerZ,
    groundY,
    baseElevationY,
    spanLength,
    spanHeight,
    thickness,
    angleY,
    worldStartDistMeters,
    style,
    includePlinth,
    includeCoping,
  } = opts;

  const wallMeta = {
    lwNodeName: `lw-wall-${wall.id}`,
    lwKind: 'wall' as const,
    lwEntityId: wall.id,
    wallId: wall.id,
    proceduralWallStyleId: style.id,
  };

  const bodyMesh = buildSubdividedReliefWallBox(
    `lw-wall-proc-body-${wall.id}-${spanId}`,
    scene,
    spanLength,
    spanHeight,
    thickness,
    worldStartDistMeters,
    baseElevationY,
    style,
    wall.wallDisplacementScale ?? 1.0,
  );

  bodyMesh.position.set(centerX, groundY + baseElevationY + spanHeight * 0.5, centerZ);
  bodyMesh.rotation.y = angleY;
  bodyMesh.isPickable = true;
  bodyMesh.checkCollisions = true;
  bodyMesh.receiveShadows = true;
  bodyMesh.metadata = wallMeta;

  const normalStrength = Math.max(0.35, Math.min(2.5, wall.wallNormalStrength ?? 1.35));
  bodyMesh.material = getOrCreateProceduralWallMaterial(
    scene,
    style,
    wall.colorHex || wall.tintColorHex,
    normalStrength,
  );
  created.push(bodyMesh);

  const trimMat = getOrCreateWallTrimMaterial(scene, style);

  if (includePlinth && spanHeight >= 0.45) {
    const plinthH = Math.min(0.22, spanHeight * 0.16);
    const plinth = BABYLON.MeshBuilder.CreateBox(
      `lw-wall-proc-plinth-${wall.id}-${spanId}`,
      {
        width: spanLength + 0.02,
        height: plinthH,
        depth: thickness * 1.18,
      },
      scene,
    );
    plinth.position.set(centerX, groundY + baseElevationY + plinthH * 0.5, centerZ);
    plinth.rotation.y = angleY;
    plinth.isPickable = true;
    plinth.receiveShadows = true;
    plinth.metadata = wallMeta;
    plinth.material = trimMat;
    created.push(plinth);
  }

  if (includeCoping && spanHeight >= 0.4) {
    const copingH = 0.11;
    const coping = BABYLON.MeshBuilder.CreateBox(
      `lw-wall-proc-coping-${wall.id}-${spanId}`,
      {
        width: spanLength + 0.03,
        height: copingH,
        depth: thickness * 1.20,
      },
      scene,
    );
    coping.position.set(centerX, groundY + baseElevationY + spanHeight - copingH * 0.35, centerZ);
    coping.rotation.y = angleY;
    coping.isPickable = true;
    coping.receiveShadows = true;
    coping.metadata = wallMeta;
    coping.material = trimMat;
    created.push(coping);
  }

  return created;
}

/**
 * Constructs a custom subdivided box with high-density front/back faces so
 * stone blocks, bricks, timbers, and cavern rock physically protrude in 3D.
 */
function buildSubdividedReliefWallBox(
  name: string,
  scene: BABYLON.Scene,
  width: number,
  height: number,
  depth: number,
  worldStartDistMeters: number,
  baseElevationY: number,
  style: ProceduralWallStyleSpec,
  userReliefMultiplier: number,
): BABYLON.Mesh {
  const cols = Math.max(4, Math.min(44, Math.ceil(width / 0.18)));
  const rows = Math.max(4, Math.min(24, Math.ceil(height / 0.20)));
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const halfD = depth * 0.5;
  const maxRelief = style.reliefMeters * Math.max(0.2, Math.min(2.5, userReliefMultiplier));

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addGridFace = (frontSign: 1 | -1) => {
    const baseVertex = positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      const v01 = r / rows;
      const localY = -halfH + v01 * height;
      const worldV = baseElevationY + v01 * height;
      const edgeV = Math.min(v01 * 5.0, (1 - v01) * 5.0, 1.0);

      for (let c = 0; c <= cols; c++) {
        const u01 = c / cols;
        const localX = -halfW + u01 * width;
        const worldU = worldStartDistMeters + u01 * width;
        const edgeU = Math.min(u01 * 6.0, (1 - u01) * 6.0, 1.0);
        const taper = Math.min(edgeU, edgeV);

        const sample = sampleProceduralWallRelief(
          style.pattern,
          worldU + (frontSign < 0 ? 1.37 : 0),
          worldV,
        );
        const disp = sample * maxRelief * taper;
        const localZ = frontSign * (halfD + disp);

        positions.push(localX, localY, localZ);
        uvs.push(worldU / style.tileWidthMeters, worldV / style.tileHeightMeters);
      }
    }

    const stride = cols + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i0 = baseVertex + r * stride + c;
        const i1 = i0 + 1;
        const i2 = i0 + stride;
        const i3 = i2 + 1;
        if (frontSign > 0) {
          indices.push(i0, i1, i2, i1, i3, i2);
        } else {
          indices.push(i0, i2, i1, i1, i2, i3);
        }
      }
    }
  };

  // Front (+Z) and Back (-Z) high-relief faces
  addGridFace(1);
  addGridFace(-1);

  // Top, Bottom, Left, Right end caps
  const addQuadCap = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    uSpan: number,
    vSpan: number,
  ) => {
    const b = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    uvs.push(0, 0, uSpan, 0, uSpan, vSpan, 0, vSpan);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };

  // Top cap (+Y)
  addQuadCap(
    [-halfW, halfH, halfD],
    [halfW, halfH, halfD],
    [halfW, halfH, -halfD],
    [-halfW, halfH, -halfD],
    width / style.tileWidthMeters,
    depth / style.tileHeightMeters,
  );
  // Bottom cap (-Y)
  addQuadCap(
    [-halfW, -halfH, -halfD],
    [halfW, -halfH, -halfD],
    [halfW, -halfH, halfD],
    [-halfW, -halfH, halfD],
    width / style.tileWidthMeters,
    depth / style.tileHeightMeters,
  );
  // Left cap (-X)
  addQuadCap(
    [-halfW, -halfH, -halfD],
    [-halfW, -halfH, halfD],
    [-halfW, halfH, halfD],
    [-halfW, halfH, -halfD],
    depth / style.tileWidthMeters,
    height / style.tileHeightMeters,
  );
  // Right cap (+X)
  addQuadCap(
    [halfW, -halfH, halfD],
    [halfW, -halfH, -halfD],
    [halfW, halfH, -halfD],
    [halfW, halfH, halfD],
    depth / style.tileWidthMeters,
    height / style.tileHeightMeters,
  );

  const normals: number[] = [];
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);

  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;

  const mesh = new BABYLON.Mesh(name, scene);
  vertexData.applyToMesh(mesh);
  return mesh;
}

/**
 * Builds a chunky 3D architectural corner quoin/pillar at wall vertices so angled
 * and 90-degree corners join naturally with zero miter gaps.
 */
export function buildProceduralCornerPillar(
  scene: BABYLON.Scene,
  wall: WallSegmentNode,
  vertexIndex: number,
  x: number,
  z: number,
  groundY: number,
  height: number,
  thickness: number,
  angleY: number,
  style: ProceduralWallStyleSpec,
): BABYLON.Mesh[] {
  const meshes: BABYLON.Mesh[] = [];
  const pillarWidth = thickness * 1.24;
  const trimMat = getOrCreateWallTrimMaterial(scene, style);
  const wallMeta = {
    lwNodeName: `lw-wall-${wall.id}`,
    lwKind: 'wall' as const,
    lwEntityId: wall.id,
    wallId: wall.id,
  };
  const wallMat = getOrCreateProceduralWallMaterial(
    scene,
    style,
    wall.colorHex || wall.tintColorHex,
    wall.wallNormalStrength ?? 1.35,
  );

  const shaft = BABYLON.MeshBuilder.CreateBox(
    `lw-wall-corner-shaft-${wall.id}-${vertexIndex}`,
    { width: pillarWidth, height, depth: pillarWidth },
    scene,
  );
  shaft.position.set(x, groundY + height * 0.5, z);
  shaft.rotation.y = angleY;
  shaft.isPickable = true;
  shaft.receiveShadows = true;
  shaft.metadata = wallMeta;
  shaft.material = wallMat;
  meshes.push(shaft);

  const capH = 0.14;
  const cap = BABYLON.MeshBuilder.CreateBox(
    `lw-wall-corner-cap-${wall.id}-${vertexIndex}`,
    { width: pillarWidth * 1.12, height: capH, depth: pillarWidth * 1.12 },
    scene,
  );
  cap.position.set(x, groundY + height - capH * 0.3, z);
  cap.rotation.y = angleY;
  cap.isPickable = true;
  cap.metadata = wallMeta;
  cap.material = trimMat;
  meshes.push(cap);

  return meshes;
}
