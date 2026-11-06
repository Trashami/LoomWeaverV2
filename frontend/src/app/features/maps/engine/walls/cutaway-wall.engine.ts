import { CutawayPerspectiveMode } from '../map-scene-contract';

export interface FittedOpeningPose {
  readonly x: number;
  readonly z: number;
  readonly angleRad: number;
  readonly widthMeters: number;
  readonly normalizedT: number;
}

export class CutawayWallEngine {
  static computeCutawayHeight(
    baseHeightMeters: number,
    perspective: CutawayPerspectiveMode,
    is2DBlueprint: boolean,
  ): number {
    if (is2DBlueprint || perspective === 'topdown') {
      return 0.45;
    }
    if (perspective === 'cutaway') {
      // Cutaway waist/chest diorama height (optimal for isometric tavern viewing without camera obstruction)
      return 1.35;
    }
    const factor = perspective === 'heavy' ? 1.25 : 1.0;
    return Math.max(0.6, Math.round(baseHeightMeters * factor * 100) / 100);
  }

  static isCutawayWall(perspective: CutawayPerspectiveMode, effectiveHeight: number): boolean {
    return perspective === 'cutaway' || (effectiveHeight > 0.45 && effectiveHeight <= 1.8);
  }

  static fitPolylineOpening(
    points: readonly (readonly [number, number])[],
    t: number,
    requestedWidth: number,
    thickness: number,
    closed = true,
  ): FittedOpeningPose | null {
    if (points.length < 2) return null;

    const segments: {
      a: readonly [number, number];
      b: readonly [number, number];
      length: number;
    }[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      segments.push({ a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }

    if (closed && points.length > 2) {
      const a = points[points.length - 1];
      const b = points[0];
      segments.push({ a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
    }

    const totalLen = segments.reduce((sum, s) => sum + s.length, 0);
    if (totalLen < thickness * 0.6) return null;

    const clampedT = Math.max(0.08, Math.min(0.92, t));
    let remaining = clampedT * totalLen;

    for (const seg of segments) {
      if (seg.length < 0.001) continue;
      if (remaining <= seg.length) {
        const u = remaining / seg.length;
        const x = seg.a[0] + (seg.b[0] - seg.a[0]) * u;
        const z = seg.a[1] + (seg.b[1] - seg.a[1]) * u;
        const angleRad = Math.atan2(seg.b[1] - seg.a[1], seg.b[0] - seg.a[0]);
        return {
          x: Math.round(x * 100) / 100,
          z: Math.round(z * 100) / 100,
          angleRad,
          widthMeters: Math.min(requestedWidth, Math.max(1.0, seg.length * 0.7)),
          normalizedT: clampedT,
        };
      }
      remaining -= seg.length;
    }

    return null;
  }

  static materialHex(materialName: string): string {
    const lower = materialName.toLowerCase();
    if (lower.includes('gold') || lower.includes('marble')) return '#c8a45d';
    if (lower.includes('obsidian') || lower.includes('basalt')) return '#4b5966';
    if (lower.includes('timber') || lower.includes('wood')) return '#8b6441';
    if (lower.includes('sewer') || lower.includes('brick')) return '#6e5a4f';
    return '#7c8b96';
  }
}
