import * as BABYLON from '@babylonjs/core';
import { DoorSidePostStyle, WallOpeningNode, WallSegmentNode } from '../map-scene-contract';
import { CutawayWallEngine } from './cutaway-wall.engine';
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

const cachedTimberSillCapMaterials = new Map<string, BABYLON.PBRMaterial>();

export function getOrCreateTimberSillCapMaterial(scene: BABYLON.Scene): BABYLON.PBRMaterial {
  const key = `${scene.uid}|timber-sillcap`;
  const existing = cachedTimberSillCapMaterials.get(key);
  if (existing && existing.getScene() === scene) return existing;

  const mat = new BABYLON.PBRMaterial('lw-wall-timber-sillcap-mat', scene);
  // Authentic dark aged oak timber sill beam
  mat.albedoColor = BABYLON.Color3.FromHexString('#2c1c12');
  mat.roughness = 0.65;
  mat.metallic = 0.05;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  cachedTimberSillCapMaterials.set(key, mat);
  return mat;
}

const cachedTrimMaterials = new Map<string, BABYLON.PBRMaterial>();

export function getOrCreateWallTrimMaterial(
  scene: BABYLON.Scene,
  style: ProceduralWallStyleSpec,
): BABYLON.PBRMaterial {
  const key = `${scene.uid}|trim|${style.id}`;
  const cached = cachedTrimMaterials.get(key);
  if (cached && cached.getScene() === scene) return cached;

  const baseMat = getOrCreateProceduralWallMaterial(scene, style, undefined, 1.15);
  const mat = new BABYLON.PBRMaterial(`procWallTrim_${style.id}`, scene);
  mat.albedoTexture = baseMat.albedoTexture;
  mat.bumpTexture = baseMat.bumpTexture;
  mat.albedoColor = BABYLON.Color3.FromHexString('#d8d2c7');
  mat.roughness = Math.max(0.28, style.roughness - 0.06);
  mat.metallic = style.metallic;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
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

  const texDensity = Math.max(0.35, Math.min(3.5, (wall.wallTextureScale ?? 100) / 100));
  const stretchX = Math.max(0.4, Math.min(2.5, (wall.wallStretchX ?? 100) / 100));
  const stretchY = Math.max(0.4, Math.min(2.5, (wall.wallStretchY ?? 100) / 100));
  const uDensityScale = texDensity / stretchX;
  const vDensityScale = texDensity / stretchY;

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
    uDensityScale,
    vDensityScale,
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
    const isCutaway = CutawayWallEngine.isCutawayWall(wall.perspective, spanHeight);
    const copingH = isCutaway ? 0.08 : 0.12;
    const copingDepth = isCutaway ? thickness + 0.06 : thickness * 1.18;
    const coping = buildSubdividedReliefPostBox(
      `lw-wall-proc-coping-${wall.id}-${spanId}`,
      scene,
      spanLength + 0.03,
      copingH,
      copingDepth,
      worldStartDistMeters,
      style,
      wall.wallDisplacementScale ?? 1.0,
    );
    coping.position.set(centerX, groundY + baseElevationY + spanHeight - copingH * 0.35, centerZ);
    coping.rotation.y = angleY;
    coping.isPickable = true;
    coping.receiveShadows = true;
    coping.metadata = wallMeta;
    coping.material = isCutaway ? getOrCreateTimberSillCapMaterial(scene) : bodyMesh.material;
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
  uDensityScale = 1.0,
  vDensityScale = 1.0,
): BABYLON.Mesh {
  const cols = Math.max(4, Math.min(64, Math.ceil((width * Math.max(0.7, uDensityScale)) / 0.18)));
  const rows = Math.max(4, Math.min(32, Math.ceil((height * Math.max(0.7, vDensityScale)) / 0.20)));
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const halfD = depth * 0.5;
  const maxRelief = style.reliefMeters * Math.max(0.2, Math.min(2.5, userReliefMultiplier));
  const effTileW = Math.max(0.25, style.tileWidthMeters / uDensityScale);
  const effTileH = Math.max(0.25, style.tileHeightMeters / vDensityScale);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const addGridFace = (frontSign: 1 | -1) => {
    const baseVertex = positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      const v01 = r / rows;
      const localY = -halfH + v01 * height;
      const worldV = (baseElevationY + v01 * height) * vDensityScale;
      const edgeV = Math.min(v01 * 5.0, (1 - v01) * 5.0, 1.0);

      for (let c = 0; c <= cols; c++) {
        const u01 = c / cols;
        const localX = -halfW + u01 * width;
        const worldU = (worldStartDistMeters + u01 * width) * uDensityScale;
        const uSample = worldU + (frontSign < 0 ? 1.37 : 0);

        const sample = sampleProceduralWallRelief(style.pattern, uSample, worldV);
        const disp = sample * maxRelief * edgeV;
        const localZ = frontSign * (halfD + disp);

        // Analytical macro normal so lighting is 100% uniform along the wall and across door lintels
        // while the high-res tangent-space bump map renders crisp stone/brick mortar lighting.
        const eps = 0.04;
        const dU =
          (sampleProceduralWallRelief(style.pattern, uSample + eps, worldV) -
            sampleProceduralWallRelief(style.pattern, uSample - eps, worldV)) *
          0.06;
        const dV =
          (sampleProceduralWallRelief(style.pattern, uSample, worldV + eps) -
            sampleProceduralWallRelief(style.pattern, uSample, worldV - eps)) *
          0.06;
        const invLen = 1 / Math.hypot(dU, dV, 1);

        positions.push(localX, localY, localZ);
        normals.push(-dU * invLen * frontSign, -dV * invLen, frontSign * invLen);
        uvs.push(
          (worldStartDistMeters + u01 * width) / effTileW,
          (baseElevationY + v01 * height) / effTileH,
        );
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
          indices.push(i0, i2, i1, i1, i2, i3);
        } else {
          indices.push(i0, i1, i2, i1, i3, i2);
        }
      }
    }
  };

  // Front (+Z) and Back (-Z) high-relief faces
  addGridFace(1);
  addGridFace(-1);

  // Top, Bottom, Left, Right end caps with explicit outward normals
  const addQuadCap = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    norm: [number, number, number],
    uSpan: number,
    vSpan: number,
  ) => {
    const b = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(...norm, ...norm, ...norm, ...norm);
    uvs.push(0, 0, uSpan, 0, uSpan, vSpan, 0, vSpan);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };

  // Top cap (+Y)
  addQuadCap(
    [-halfW, halfH, halfD],
    [halfW, halfH, halfD],
    [halfW, halfH, -halfD],
    [-halfW, halfH, -halfD],
    [0, 1, 0],
    width / effTileW,
    depth / effTileH,
  );
  // Bottom cap (-Y)
  addQuadCap(
    [-halfW, -halfH, -halfD],
    [halfW, -halfH, -halfD],
    [halfW, -halfH, halfD],
    [-halfW, -halfH, halfD],
    [0, -1, 0],
    width / effTileW,
    depth / effTileH,
  );
  // Left cap (-X)
  addQuadCap(
    [-halfW, -halfH, -halfD],
    [-halfW, -halfH, halfD],
    [-halfW, halfH, halfD],
    [-halfW, halfH, -halfD],
    [-1, 0, 0],
    depth / effTileW,
    height / effTileH,
  );
  // Right cap (+X)
  addQuadCap(
    [halfW, -halfH, halfD],
    [halfW, -halfH, -halfD],
    [halfW, halfH, -halfD],
    [halfW, halfH, halfD],
    [1, 0, 0],
    depth / effTileW,
    height / effTileH,
  );

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
 * Builds a 4-sided subdivided 3D relief column/post mesh with world-scaled UVs
 * and stone/brick/plank vertex displacement on all four vertical faces.
 */
export function buildSubdividedReliefPostBox(
  name: string,
  scene: BABYLON.Scene,
  width: number,
  height: number,
  depth: number,
  worldSeedOffset: number,
  style: ProceduralWallStyleSpec,
  userReliefMultiplier = 1.0,
): BABYLON.Mesh {
  const colsX = Math.max(3, Math.min(12, Math.ceil(width / 0.12)));
  const colsZ = Math.max(3, Math.min(12, Math.ceil(depth / 0.12)));
  const rows = Math.max(5, Math.min(24, Math.ceil(height / 0.18)));
  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const halfD = depth * 0.5;
  const maxRelief = style.reliefMeters * Math.max(0.25, Math.min(2.2, userReliefMultiplier)) * 0.72;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Front (+Z) and Back (-Z) faces
  const addZFace = (zSign: 1 | -1) => {
    const baseVertex = positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      const v01 = r / rows;
      const localY = -halfH + v01 * height;
      const worldV = v01 * height;
      const edgeV = Math.min(v01 * 5.0, (1 - v01) * 5.0, 1.0);
      for (let c = 0; c <= colsX; c++) {
        const u01 = c / colsX;
        const localX = -halfW + u01 * width;
        const worldU = worldSeedOffset + u01 * width + (zSign < 0 ? 0.93 : 0);
        const edgeU = Math.min(u01 * 5.0, (1 - u01) * 5.0, 1.0);
        const taper = Math.min(edgeU, edgeV);
        const disp = sampleProceduralWallRelief(style.pattern, worldU, worldV) * maxRelief * taper;
        positions.push(localX, localY, zSign * (halfD + disp));
        normals.push(0, 0, zSign);
        uvs.push(worldU / style.tileWidthMeters, worldV / style.tileHeightMeters);
      }
    }
    const stride = colsX + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < colsX; c++) {
        const i0 = baseVertex + r * stride + c;
        const i1 = i0 + 1;
        const i2 = i0 + stride;
        const i3 = i2 + 1;
        if (zSign > 0) {
          indices.push(i0, i2, i1, i1, i2, i3);
        } else {
          indices.push(i0, i1, i2, i1, i3, i2);
        }
      }
    }
  };

  // Right (+X) and Left (-X) faces
  const addXFace = (xSign: 1 | -1) => {
    const baseVertex = positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      const v01 = r / rows;
      const localY = -halfH + v01 * height;
      const worldV = v01 * height;
      const edgeV = Math.min(v01 * 5.0, (1 - v01) * 5.0, 1.0);
      for (let c = 0; c <= colsZ; c++) {
        const u01 = c / colsZ;
        const localZ = -halfD + u01 * depth;
        const worldU = worldSeedOffset + 1.7 + u01 * depth + (xSign < 0 ? 0.67 : 0);
        const edgeU = Math.min(u01 * 5.0, (1 - u01) * 5.0, 1.0);
        const taper = Math.min(edgeU, edgeV);
        const disp = sampleProceduralWallRelief(style.pattern, worldU, worldV) * maxRelief * taper;
        positions.push(xSign * (halfW + disp), localY, localZ);
        normals.push(xSign, 0, 0);
        uvs.push(worldU / style.tileWidthMeters, worldV / style.tileHeightMeters);
      }
    }
    const stride = colsZ + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < colsZ; c++) {
        const i0 = baseVertex + r * stride + c;
        const i1 = i0 + 1;
        const i2 = i0 + stride;
        const i3 = i2 + 1;
        if (xSign > 0) {
          indices.push(i0, i1, i2, i1, i3, i2);
        } else {
          indices.push(i0, i2, i1, i1, i2, i3);
        }
      }
    }
  };

  addZFace(1);
  addZFace(-1);
  addXFace(1);
  addXFace(-1);

  const addQuadCap = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    norm: [number, number, number],
    uSpan: number,
    vSpan: number,
  ) => {
    const b = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(...norm, ...norm, ...norm, ...norm);
    uvs.push(0, 0, uSpan, 0, uSpan, vSpan, 0, vSpan);
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };

  // Top (+Y) and Bottom (-Y) caps
  addQuadCap(
    [-halfW, halfH, halfD],
    [halfW, halfH, halfD],
    [halfW, halfH, -halfD],
    [-halfW, halfH, -halfD],
    [0, 1, 0],
    width / style.tileWidthMeters,
    depth / style.tileHeightMeters,
  );
  addQuadCap(
    [-halfW, -halfH, -halfD],
    [halfW, -halfH, -halfD],
    [halfW, -halfH, halfD],
    [-halfW, -halfH, halfD],
    [0, -1, 0],
    width / style.tileWidthMeters,
    depth / style.tileHeightMeters,
  );

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
 * Builds a chunky 3D architectural corner quoin/pillar at wall vertices with
 * subdivided 3D relief, stacked alternating quoin blocks, base plinth, and top capital.
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
  customMat?: BABYLON.Material | null,
): BABYLON.Mesh[] {
  const meshes: BABYLON.Mesh[] = [];
  const postScale = Math.max(0.6, Math.min(1.8, wall.cornerPostScale ?? 1.0));
  const pillarWidth = Math.max(0.28, thickness * 1.32 * postScale);
  const trimMat = getOrCreateWallTrimMaterial(scene, style);
  const wallMeta = {
    lwNodeName: `lw-wall-${wall.id}`,
    lwKind: 'wall' as const,
    lwEntityId: wall.id,
    wallId: wall.id,
  };
  const wallMat =
    customMat ??
    getOrCreateProceduralWallMaterial(
      scene,
      style,
      wall.colorHex || wall.tintColorHex,
      wall.wallNormalStrength ?? 1.35,
    );

  // 1. Subdivided 3D relief core column shaft
  const shaft = buildSubdividedReliefPostBox(
    `lw-wall-corner-shaft-${wall.id}-${vertexIndex}`,
    scene,
    pillarWidth,
    height,
    pillarWidth,
    vertexIndex * 1.9,
    style,
    wall.wallDisplacementScale ?? 1.0,
  );
  shaft.position.set(x, groundY + height * 0.5, z);
  shaft.rotation.y = angleY;
  shaft.isPickable = true;
  shaft.checkCollisions = true;
  shaft.receiveShadows = true;
  shaft.metadata = wallMeta;
  shaft.material = wallMat;
  meshes.push(shaft);

  // 2. Alternating Stacked Quoin Blocks along the corner post
  const plinthH = Math.min(0.24, height * 0.16);
  const capH = 0.14;
  const usableH = Math.max(0.4, height - plinthH - capH);
  const courseCount = Math.max(3, Math.min(9, Math.round(usableH / 0.36)));
  const courseH = usableH / courseCount;

  for (let c = 0; c < courseCount; c++) {
    const isLongCourse = c % 2 === 0;
    const quoinW = pillarWidth * (isLongCourse ? 1.14 : 1.05);
    const quoinD = pillarWidth * (isLongCourse ? 1.05 : 1.14);
    const quoin = buildSubdividedReliefPostBox(
      `lw-wall-corner-quoin-${wall.id}-${vertexIndex}-${c}`,
      scene,
      quoinW,
      courseH * 0.90,
      quoinD,
      vertexIndex * 3.1 + c * 0.73,
      style,
      wall.wallDisplacementScale ?? 1.0,
    );
    quoin.position.set(
      x,
      groundY + plinthH + (c + 0.5) * courseH,
      z,
    );
    quoin.rotation.y = angleY;
    quoin.isPickable = true;
    quoin.receiveShadows = true;
    quoin.metadata = wallMeta;
    quoin.material = wallMat;
    meshes.push(quoin);
  }

  // 3. Base Plinth Block
  const basePlinth = BABYLON.MeshBuilder.CreateBox(
    `lw-wall-corner-plinth-${wall.id}-${vertexIndex}`,
    { width: pillarWidth * 1.22, height: plinthH, depth: pillarWidth * 1.22 },
    scene,
  );
  basePlinth.position.set(x, groundY + plinthH * 0.5, z);
  basePlinth.rotation.y = angleY;
  basePlinth.isPickable = true;
  basePlinth.receiveShadows = true;
  basePlinth.metadata = wallMeta;
  basePlinth.material = trimMat;
  meshes.push(basePlinth);

  // 4. Top Capital / Coping Block
  const cap = BABYLON.MeshBuilder.CreateBox(
    `lw-wall-corner-cap-${wall.id}-${vertexIndex}`,
    { width: pillarWidth * 1.20, height: capH, depth: pillarWidth * 1.20 },
    scene,
  );
  cap.position.set(x, groundY + height - capH * 0.3, z);
  cap.rotation.y = angleY;
  cap.isPickable = true;
  cap.receiveShadows = true;
  cap.metadata = wallMeta;
  cap.material = CutawayWallEngine.isCutawayWall(wall.perspective, height)
    ? getOrCreateTimberSillCapMaterial(scene)
    : trimMat;
  meshes.push(cap);

  return meshes;
}

export interface DoorSidePostOptions {
  readonly wall: WallSegmentNode;
  readonly op: WallOpeningNode;
  readonly doorX: number;
  readonly doorZ: number;
  readonly doorGroundY: number;
  readonly doorWidth: number;
  readonly doorHeight: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
  readonly angleY: number;
  readonly style: ProceduralWallStyleSpec;
  readonly customWallMat?: BABYLON.Material | null;
}

/**
 * Builds chunky 3D architectural Door Side Post Blocks (left and right of the door opening)
 * that match the wall's 3D block relief and interlock with the cut wall ends so doors
 * look naturally built into the masonry/timber wall.
 */
export function buildProceduralDoorSidePosts(
  scene: BABYLON.Scene,
  opts: DoorSidePostOptions,
): BABYLON.Mesh[] {
  const {
    wall,
    op,
    doorX,
    doorZ,
    doorGroundY,
    doorWidth,
    doorHeight,
    wallHeight,
    wallThickness,
    angleY,
    style,
    customWallMat,
  } = opts;

  if (op.hasSidePosts === false) {
    return [];
  }

  const created: BABYLON.Mesh[] = [];
  const postStyle: DoorSidePostStyle = op.sidePostStyle ?? 'quoin';
  const postScale = Math.max(0.6, Math.min(1.8, op.sidePostScale ?? 1.0));

  const postWidth = Math.max(0.24, wallThickness * 0.78 * postScale);
  const postDepth = Math.max(0.32, wallThickness * 1.18 * postScale);
  // For quoin and jamb styles, the side posts terminate cleanly beneath the lintel header block
  // so the lintel header rests on top of both side posts without posts sticking into the upper wall.
  const postHeight =
    postStyle === 'pillar'
      ? Math.max(doorHeight, wallHeight)
      : Math.max(0.6, Math.min(wallHeight, doorHeight) - 0.14);

  const wallMat =
    customWallMat ??
    getOrCreateProceduralWallMaterial(
      scene,
      style,
      wall.colorHex || wall.tintColorHex,
      wall.wallNormalStrength ?? 1.35,
    );
  const trimMat = getOrCreateWallTrimMaterial(scene, style);

  const root = new BABYLON.TransformNode(`lw-door-node-sideposts-${wall.id}-${op.id}`, scene);
  root.position.set(doorX, doorGroundY, doorZ);
  root.rotation.y = angleY;

  const tagMesh = (m: BABYLON.Mesh) => {
    m.isPickable = true;
    m.checkCollisions = true;
    m.receiveShadows = true;
    m.metadata = {
      lwNodeName: `lw-door-${op.id}`,
      lwKind: 'door' as const,
      lwEntityId: op.id,
      lwWallId: wall.id,
      wallId: wall.id,
      openingId: op.id,
    };
    created.push(m);
  };

  const plinthH = Math.min(0.22, postHeight * 0.14);
  const capH = 0.11;

  for (const side of [-1, 1] as const) {
    // Center the side post right on the wall cutout seam (±doorWidth * 0.44) so it buries the cut wall end
    // and frames the inner doorway opening naturally.
    const postCenterX = side * (doorWidth * 0.44);

    // 1. Core 3D Relief Side Post Column
    const corePost = buildSubdividedReliefPostBox(
      `lw-door-sidepost-core-${op.id}-${side}`,
      scene,
      postWidth,
      postHeight,
      postDepth,
      side > 0 ? 4.3 : 1.7,
      style,
      wall.wallDisplacementScale ?? 1.0,
    );
    corePost.parent = root;
    corePost.position.set(postCenterX, postHeight * 0.5, 0);
    corePost.material = wallMat;
    tagMesh(corePost);

    // 2. Base Plinth Block (grounds the door side post flush with the wall plinth)
    const plinth = BABYLON.MeshBuilder.CreateBox(
      `lw-door-sidepost-plinth-${op.id}-${side}`,
      {
        width: postWidth * 1.18,
        height: plinthH,
        depth: postDepth * 1.08,
      },
      scene,
    );
    plinth.parent = root;
    plinth.position.set(postCenterX, plinthH * 0.5, 0);
    plinth.material = trimMat;
    tagMesh(plinth);

    // 3. Alternating Interlocking Quoin Blocks (for 'quoin' and 'pillar' styles)
    if (postStyle === 'quoin' || postStyle === 'pillar') {
      const quoinSpanH = Math.max(0.5, postHeight - plinthH - capH);
      const courseCount = Math.max(4, Math.min(9, Math.round(quoinSpanH / 0.36)));
      const courseH = quoinSpanH / courseCount;

      for (let c = 0; c < courseCount; c++) {
        const isLongQuoin = c % 2 === 0;
        // Long quoin stones reach outward into the adjacent wall span so the doorway masonry interlocks with the wall courses
        const qWidth = postWidth * (isLongQuoin ? 1.42 : 1.08);
        const qDepth = postDepth * (isLongQuoin ? 1.03 : 1.06);
        const outwardShift = side * (isLongQuoin ? postWidth * 0.19 : postWidth * 0.02);

        const quoinBlock = buildSubdividedReliefPostBox(
          `lw-door-sidepost-quoin-${op.id}-${side}-${c}`,
          scene,
          qWidth,
          courseH * 0.91,
          qDepth,
          (side > 0 ? 7.1 : 2.9) + c * 0.83,
          style,
          wall.wallDisplacementScale ?? 1.0,
        );
        quoinBlock.parent = root;
        quoinBlock.position.set(
          postCenterX + outwardShift,
          plinthH + (c + 0.5) * courseH,
          0,
        );
        quoinBlock.material = wallMat;
        tagMesh(quoinBlock);
      }
    }

    // 4. Impost / Corbel Shoulder Block supporting the lintel header
    const corbelH = 0.12;
    const corbel = BABYLON.MeshBuilder.CreateBox(
      `lw-door-sidepost-corbel-${op.id}-${side}`,
      {
        width: postWidth * 1.18,
        height: corbelH,
        depth: postDepth * 1.06,
      },
      scene,
    );
    corbel.parent = root;
    corbel.position.set(
      postCenterX - side * (postWidth * 0.06),
      postHeight - corbelH * 0.5,
      0,
    );
    corbel.material = trimMat;
    tagMesh(corbel);

    // 5. Top Capital Block only when full-height pillar style is chosen
    if (postStyle === 'pillar') {
      const topCap = BABYLON.MeshBuilder.CreateBox(
        `lw-door-sidepost-cap-${op.id}-${side}`,
        {
          width: postWidth * 1.20,
          height: capH,
          depth: postDepth * 1.12,
        },
        scene,
      );
      topCap.parent = root;
      topCap.position.set(postCenterX, postHeight - capH * 0.35, 0);
      topCap.material = trimMat;
      tagMesh(topCap);
    }
  }

  return created;
}
