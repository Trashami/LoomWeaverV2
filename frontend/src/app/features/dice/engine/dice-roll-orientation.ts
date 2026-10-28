import { Quaternion, Vector3 } from '@babylonjs/core';
import { DicePolyhedronType } from './models/dice-model.types';
import { getPolyhedronRawTable } from './models/polyhedra-tables.model';

interface ShapeFace { value: number; vertices: Vector3[]; normal: Vector3; center: Vector3; }
const shapeCache = new Map<DicePolyhedronType, { vertices: Vector3[]; faces: ShapeFace[] }>();
const symmetryCache = new Map<string, Quaternion>();
export function rollShape(type: DicePolyhedronType) {
  const cached = shapeCache.get(type);
  if (cached) return cached;
  const table = getPolyhedronRawTable(type);
  const vertices = table.vertices.map(v => Vector3.FromArray(v).normalize());
  const faces = table.faces.filter(face => face.at(-1)! > 0).map(face => {
    const points = face.slice(0, -1).map(index => vertices[index]);
    const center = points.reduce((sum, v) => sum.add(v), Vector3.Zero()).scale(1 / points.length);
    const normal = Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0])).normalize();
    if (Vector3.Dot(normal, center) < 0) normal.scaleInPlace(-1);
    return { value: face.at(-1)!, vertices: points, normal, center };
  });
  const shape = { vertices, faces }; shapeCache.set(type, shape); return shape;
}
export function resultFace(type: DicePolyhedronType, value: number): number {
  if (type === 'd100') return value === 0 || value === 100 ? 10 : Math.max(1, Math.min(10, Math.round(value / 10)));
  return type === 'd10' && value === 0 ? 10 : value;
}
export function closestRestPose(type: DicePolyhedronType, orientation: Quaternion) {
  const axis = type === 'd4' ? Vector3.Down() : Vector3.Up();
  let best = rollShape(type).faces[0], bestDot = -Infinity;
  for (const face of rollShape(type).faces) {
    const normal = new Vector3(); face.normal.rotateByQuaternionToRef(orientation, normal);
    const dot = Vector3.Dot(normal, axis);
    if (dot > bestDot) { bestDot = dot; best = face; }
  }
  const normal = new Vector3(); best.normal.rotateByQuaternionToRef(orientation, normal);
  const tilt = new Quaternion(); Quaternion.FromUnitVectorsToRef(normal, axis, tilt);
  const rotation = tilt.multiply(orientation).normalize();
  if (Quaternion.Dot(rotation, orientation) < 0) rotation.scaleInPlace(-1);
  return { rotation, face: best.value };
}

/** A fixed local symmetry changes the numbered face without changing the solid's motion. */
export function resultSymmetry(type: DicePolyhedronType, naturalFace: number, value: number): Quaternion {
  const target = resultFace(type, value);
  if (target === naturalFace) return Quaternion.Identity();
  const key = `${type}:${naturalFace}:${target}`;
  const cached = symmetryCache.get(key); if (cached) return cached;
  const shape = rollShape(type);
  const from = shape.faces.find(face => face.value === target)!;
  const to = shape.faces.find(face => face.value === naturalFace)!;
  const align = new Quaternion(); Quaternion.FromUnitVectorsToRef(from.normal, to.normal, align);
  const a = new Vector3(); from.vertices[0].subtract(from.center).rotateByQuaternionToRef(align, a); a.normalize();
  for (const vertex of to.vertices) {
    const b = vertex.subtract(to.center).normalize();
    const angle = Math.atan2(Vector3.Dot(to.normal, Vector3.Cross(a, b)), Vector3.Dot(a, b));
    const candidate = Quaternion.RotationAxis(to.normal, angle).multiply(align).normalize();
    const preservesSolid = shape.vertices.every(vertex => {
      const transformed = new Vector3(); vertex.rotateByQuaternionToRef(candidate, transformed);
      return shape.vertices.some(other => Vector3.DistanceSquared(other, transformed) < 1e-8);
    });
    if (preservesSolid) { symmetryCache.set(key, candidate); return candidate; }
  }
  throw new Error(`No rotational dice symmetry for ${key}`);
}
