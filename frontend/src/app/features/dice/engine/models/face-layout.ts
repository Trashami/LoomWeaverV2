import { Vector3 } from '@babylonjs/core';

export interface DieFaceLayout {
  readonly polygon: readonly (readonly [number, number])[];
  readonly unitsPerUv: number;
  readonly vertexValues?: readonly number[];
}

/** Shared by mesh UVs and lettering: no independently guessed texture coordinates. */
export function projectDieFace(vertices: Vector3[], normal: Vector3, vertexValues?: number[]): DieFaceLayout {
  const center = vertices.reduce((sum, v) => sum.add(v), Vector3.Zero()).scale(1 / vertices.length);
  const up = vertices[0].subtract(center).normalize();
  const right = Vector3.Cross(up, normal).normalize();
  const span = Math.max(...vertices.map(v => v.subtract(center).length())) * 2 / 0.9;
  return {
    polygon: vertices.map(v => {
      const delta = v.subtract(center);
      return [0.5 + Vector3.Dot(delta, right) / span, 0.5 - Vector3.Dot(delta, up) / span] as const;
    }),
    unitsPerUv: span,
    vertexValues,
  };
}

export function isInsideFace(point: readonly [number, number], polygon: DieFaceLayout['polygon'], margin = 0): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) < margin * Math.hypot(b[0] - a[0], b[1] - a[1])) return false;
    const next = Math.sign(cross);
    if (sign && next !== sign) return false;
    sign = next;
  }
  return true;
}
