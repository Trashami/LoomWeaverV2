import type { MapWallSegmentNode } from '../map-scene-contract';

type Point = readonly [number, number];

/** Stop a terminal at the adjoining wall centreline; never extend through its far face. */
export function wallEndExtension(
  point: Point, direction: Point, wall: MapWallSegmentNode,
  walls: readonly MapWallSegmentNode[], preferredExtension: number,
): number {
  let extension = preferredExtension;
  for (const other of walls) {
    const closed = other.drawMode !== 'line' && other.drawMode !== 'freehand';
    const count = closed ? other.points.length : other.points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = other.points[i], b = other.points[(i + 1) % other.points.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      // Same-wall adjacent edges are corners too; ignore the edge parallel to this span.
      const sine = Math.abs((direction[0] * dz - direction[1] * dx) / len);
      if (sine < 0.2) continue;
      const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (len * len);
      const distance = Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t);
      if (t >= -0.02 && t <= 1.02 && distance < 0.12) {
        const insideSpan = t > 0.02 && t < 0.98;
        // T junctions terminate at the near face; corners meet at the outside face.
        const halfDepth = other.thicknessMeters * (other.stampScale ?? 1) / 2;
        extension = Math.min(extension, insideSpan ? -halfDepth / sine + 0.025 : halfDepth / sine);
      }
    }
  }
  return extension;
}

export function featherCoverage(distance: number, radius: number, hardness: number): number {
  if (distance >= radius || radius <= 0) return 0;
  const inner = radius * Math.min(0.99, Math.max(0, hardness / 100));
  if (distance <= inner) return 1;
  const t = (distance - inner) / (radius - inner);
  return 1 - t * t * (3 - 2 * t);
}
