import { DieFaceLayout, projectDieFace } from './face-layout';
import { Quaternion, Vector3, VertexData } from '@babylonjs/core';
import {
  BuiltBabylonDieGeometry,
  DicePolyhedronType,
  SubMeshRange
} from './dice-model.types';
import { getPolyhedronRawTable } from './polyhedra-tables.model';

const cachedFaceNormals = new Map<DicePolyhedronType, Map<number, Vector3>>();
const cachedFaceUpVectors = new Map<DicePolyhedronType, Map<number, Vector3>>();

export function chamferGeom(
  vectors: Vector3[],
  faces: number[][],
  chamfer: number
): { vectors: Vector3[]; faces: number[][] } {
  const chamferVectors: Vector3[] = [];
  const chamferFaces: number[][] = [];
  const cornerFaces: number[][] = new Array(vectors.length).fill(0).map(() => []);

  for (let i = 0; i < faces.length; ++i) {
    const ii = faces[i];
    const fl = ii.length - 1;
    const centerPoint = new Vector3();
    const face: number[] = new Array(fl);

    for (let j = 0; j < fl; ++j) {
      const vv = vectors[ii[j]].clone();
      centerPoint.addInPlace(vv);
      cornerFaces[ii[j]].push((face[j] = chamferVectors.push(vv) - 1));
    }
    centerPoint.scaleInPlace(1 / fl);

    for (let j = 0; j < fl; ++j) {
      const vv = chamferVectors[face[j]];
      vv.subtractInPlace(centerPoint).scaleInPlace(chamfer).addInPlace(centerPoint);
    }
    face.push(ii[fl]);
    chamferFaces.push(face);
  }

  for (let i = 0; i < faces.length - 1; ++i) {
    for (let j = i + 1; j < faces.length; ++j) {
      const pairs: number[][] = [];
      let lastm = -1;
      for (let m = 0; m < faces[i].length - 1; ++m) {
        const n = faces[j].indexOf(faces[i][m]);
        if (n >= 0 && n < faces[j].length - 1) {
          if (lastm >= 0 && m !== lastm + 1) pairs.unshift([i, m], [j, n]);
          else pairs.push([i, m], [j, n]);
          lastm = m;
        }
      }
      if (pairs.length !== 4) continue;
      chamferFaces.push([
        chamferFaces[pairs[0][0]][pairs[0][1]],
        chamferFaces[pairs[1][0]][pairs[1][1]],
        chamferFaces[pairs[3][0]][pairs[3][1]],
        chamferFaces[pairs[2][0]][pairs[2][1]],
        -1
      ]);
    }
  }

  for (let i = 0; i < cornerFaces.length; ++i) {
    const cf = cornerFaces[i];
    const face = [cf[0]];
    let count = cf.length - 1;
    while (count) {
      for (let m = faces.length; m < chamferFaces.length; ++m) {
        let index = chamferFaces[m].indexOf(face[face.length - 1]);
        if (index >= 0 && index < 4) {
          if (--index === -1) index = 3;
          const nextVertex = chamferFaces[m][index];
          if (cf.indexOf(nextVertex) >= 0) {
            face.push(nextVertex);
            break;
          }
        }
      }
      --count;
    }
    face.push(-1);
    chamferFaces.push(face);
  }

  return { vectors: chamferVectors, faces: chamferFaces };
}

export function buildBabylonDieVertexData(
  type: DicePolyhedronType,
  baseRadius = 1.15,
  chamferOverride?: number,
  faceted = false
): BuiltBabylonDieGeometry {
  const table = getPolyhedronRawTable(type, chamferOverride);
  const radius = baseRadius * table.scaleFactor;
  const unitVectors = table.vertices.map(v => new Vector3(v[0], v[1], v[2]).normalize());
  const firstCut = chamferGeom(unitVectors, table.faces, table.chamfer);
  const cg = faceted ? chamferGeom(firstCut.vectors, firstCut.faces, 0.82) : firstCut;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const subMeshRanges: SubMeshRange[] = [];
  const faceNormalsByValue = new Map<number, Vector3>();
  const faceLayouts = new Map<number, DieFaceLayout>();
  const d4VertexValues = type === 'd4' ? unitVectors.map((_, vertex) =>
    table.faces.find(face => !face.slice(0, -1).includes(vertex))!.at(-1)!) : [];
  const faceUpVectorsByValue = new Map<number, Vector3>();

  const scaledVectors = cg.vectors.map(v => v.scale(radius));

  for (let i = 0; i < cg.faces.length; ++i) {
    const ii = cg.faces[i];
    const fl = ii.length - 1;
    const rawMatIdx = ii[fl];
    const materialIndex = rawMatIdx > 0 ? rawMatIdx : 0;

    const center = new Vector3();
    for (let j = 0; j < fl; ++j) center.addInPlace(scaledVectors[ii[j]]);
    center.scaleInPlace(1 / fl);

    const v0 = scaledVectors[ii[0]];
    const v1 = scaledVectors[ii[1]];
    const v2 = scaledVectors[ii[2]];
    const faceNormal = Vector3.Cross(v1.subtract(v0), v2.subtract(v0)).normalize();
    if (Vector3.Dot(faceNormal, center) < 0) faceNormal.scaleInPlace(-1);

    const layout = projectDieFace(ii.slice(0, fl).map(index => scaledVectors[index]), faceNormal,
      type === 'd4' && rawMatIdx > 0 ? table.faces[i].slice(0, -1).map(vertex => d4VertexValues[vertex]) : undefined);
    if (rawMatIdx > 0) faceLayouts.set(rawMatIdx, layout);
    const aa = (Math.PI * 2) / fl;
    if (rawMatIdx > 0) {
      faceNormalsByValue.set(rawMatIdx, faceNormal.clone());
      const textUp = scaledVectors[ii[0]].subtract(center).normalize();
      faceUpVectorsByValue.set(rawMatIdx, textUp);
    }

    const startIdx = indices.length;

    for (let j = 0; j < fl - 2; ++j) {
      const pA = scaledVectors[ii[0]];
      const pB = scaledVectors[ii[j + 1]];
      const pC = scaledVectors[ii[j + 2]];

      const [u0, v0uv] = layout.polygon[0];
      const [u1, v1uv] = layout.polygon[j + 1];
      const [u2, v2uv] = layout.polygon[j + 2];

      const baseVert = positions.length / 3;
      positions.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pC.x, pC.y, pC.z);
      normals.push(
        faceNormal.x, faceNormal.y, faceNormal.z,
        faceNormal.x, faceNormal.y, faceNormal.z,
        faceNormal.x, faceNormal.y, faceNormal.z
      );
      uvs.push(u0, v0uv, u1, v1uv, u2, v2uv);

      const triCross = Vector3.Cross(pB.subtract(pA), pC.subtract(pA));
      if (Vector3.Dot(triCross, faceNormal) > 0) {
        indices.push(baseVert, baseVert + 2, baseVert + 1);
      } else {
        indices.push(baseVert, baseVert + 1, baseVert + 2);
      }
    }

    const indexCount = indices.length - startIdx;
    const prev = subMeshRanges[subMeshRanges.length - 1];
    if (prev && prev.materialIndex === materialIndex && prev.indexStart + prev.indexCount === startIdx) {
      prev.indexCount += indexCount;
    } else {
      subMeshRanges.push({ materialIndex, indexStart: startIdx, indexCount });
    }
  }

  if (!cachedFaceNormals.has(type)) {
    cachedFaceNormals.set(type, faceNormalsByValue);
    cachedFaceUpVectors.set(type, faceUpVectorsByValue);
  }

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;

  return { vertexData, subMeshRanges, faceNormalsByValue, faceLayouts };
}

export function getRotationForTopValue(
  type: DicePolyhedronType,
  targetValue: number,
  yawRadians = 0,
  targetDirection?: Vector3
): Quaternion {
  if (!cachedFaceNormals.has(type)) {
    buildBabylonDieVertexData(type, 1.0);
  }
  const map = cachedFaceNormals.get(type)!;
  const upMap = cachedFaceUpVectors.get(type);
  let lookup = targetValue;
  if (type === 'd100') {
    lookup = targetValue === 0 || targetValue === 100 ? 10 : Math.max(1, Math.min(10, Math.round(targetValue / 10)));
  } else if (type === 'd10' && targetValue === 0) {
    lookup = 10;
  }

  const normal = map.get(lookup) ?? map.get(1) ?? new Vector3(0, 1, 0);
  // Gravity always pulls the underside flat face flush to the horizontal floor (y = 0)
  const targetAxis = type === 'd4' ? new Vector3(0, -1, 0) : (targetDirection?.normalizeToNew() ?? Vector3.Up());

  const alignQ = new Quaternion();
  Quaternion.FromUnitVectorsToRef(normal.normalizeToNew(), targetAxis, alignQ);

  let autoYaw = 0;
  if (type === 'd4') {
    // Orient one of the 3 sloped numbered faces directly toward the viewer (-Z) while flat on its base
    const frontFaceIdx = lookup === 1 ? 4 : 1;
    const frontLocalNormal = map.get(frontFaceIdx);
    if (frontLocalNormal) {
      const worldFront = new Vector3();
      frontLocalNormal.rotateByQuaternionToRef(alignQ, worldFront);
      autoYaw = Math.atan2(worldFront.x, -worldFront.z);
    }
  } else if (upMap) {
    // Orient the top face's number so its top points straight up on screen (+Z)
    const localUp = upMap.get(lookup);
    if (localUp && localUp.lengthSquared() > 1e-6) {
      const worldUp = new Vector3();
      localUp.rotateByQuaternionToRef(alignQ, worldUp);
      autoYaw = -Math.atan2(worldUp.x, worldUp.z);
    }
  }

  const yawAxis = targetDirection && type !== 'd4' ? targetAxis : Vector3.Up();
  const yawQ = Quaternion.RotationAxis(yawAxis, autoYaw + yawRadians);
  return yawQ.multiply(alignQ);
}
