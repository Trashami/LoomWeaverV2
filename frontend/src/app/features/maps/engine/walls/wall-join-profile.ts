import type { MapWallSegmentNode } from '../map-scene-contract';

type Point = readonly [number, number];

/** Extends wall ends into corners and T-junctions so staggered 3D stone courses interlock without gaps. */
export function wallEndExtension(
  point: Point,
  direction: Point,
  _wall: MapWallSegmentNode,
  walls: readonly MapWallSegmentNode[],
  preferredExtension: number,
): number {
  let extension = preferredExtension;
  for (const other of walls) {
    const closed = other.drawMode !== 'line' && other.drawMode !== 'freehand';
    const count = closed ? other.points.length : other.points.length - 1;
    for (let i = 0; i < count; i++) {
      const a = other.points[i];
      const b = other.points[(i + 1) % other.points.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      // Same-wall adjacent edges are corners too; ignore the edge parallel to this span.
      const sine = Math.abs((direction[0] * dz - direction[1] * dx) / len);
      if (sine < 0.2) continue;
      const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (len * len);
      const distance = Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t);
      if (t >= -0.04 && t <= 1.04 && distance < 0.22) {
        const insideSpan = t > 0.04 && t < 0.96;
        // T-junctions embed into the adjoining wall interior so recessed stone ends never gap;
        // L-corners extend to the outer face of the adjoining wall so corners interlock cleanly.
        const halfDepth = (other.thicknessMeters / 2) * 1.15;
        extension = Math.min(
          extension,
          insideSpan ? halfDepth * 0.32 : halfDepth / sine,
        );
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
