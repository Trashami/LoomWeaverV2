import { DicePolyhedronType, PolyhedronRawTable } from './dice-model.types';

export const FACE_VALUES: Record<DicePolyhedronType, number[]> = {
  d4: [1, 2, 3, 4],
  d6: [1, 2, 3, 4, 5, 6],
  d8: [1, 2, 3, 4, 5, 6, 7, 8],
  d10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  d12: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  d20: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  d100: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
};


export function getPolyhedronRawTable(
  type: DicePolyhedronType,
  chamferOverride?: number
): PolyhedronRawTable {
  switch (type) {
    case 'd4':
      return {
        vertices: [
          [1, 1, 1],
          [-1, -1, 1],
          [-1, 1, -1],
          [1, -1, -1]
        ],
        faces: [
          [1, 0, 2, 1],
          [0, 1, 3, 2],
          [0, 3, 2, 3],
          [1, 2, 3, 4]
        ],
        chamfer: chamferOverride ?? 0.96,
        scaleFactor: 1.18,
        values: 4,
        margin: 1.0,
        tab: -0.1,
        af: (Math.PI * 7) / 6
      };

    case 'd6':
      return {
        vertices: [
          [-1, -1, -1],
          [1, -1, -1],
          [1, 1, -1],
          [-1, 1, -1],
          [-1, -1, 1],
          [1, -1, 1],
          [1, 1, 1],
          [-1, 1, 1]
        ],
        faces: [
          [0, 3, 2, 1, 1],
          [1, 2, 6, 5, 2],
          [0, 1, 5, 4, 3],
          [3, 7, 6, 2, 4],
          [0, 4, 7, 3, 5],
          [4, 5, 6, 7, 6]
        ],
        chamfer: chamferOverride ?? 0.96,
        scaleFactor: 0.94,
        values: 6,
        margin: 1.0,
        tab: 0.1,
        af: Math.PI / 4
      };

    case 'd8':
      return {
        vertices: [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1]
        ],
        faces: [
          [0, 2, 4, 1],
          [0, 4, 3, 2],
          [0, 3, 5, 3],
          [0, 5, 2, 4],
          [1, 3, 4, 5],
          [1, 4, 2, 6],
          [1, 2, 5, 7],
          [1, 5, 3, 8]
        ],
        chamfer: chamferOverride ?? 0.965,
        scaleFactor: 1.0,
        values: 8,
        margin: 1.2,
        tab: -0.05,
        af: -Math.PI / 4 / 2
      };

    case 'd10':
    case 'd100': {
      const vertices: number[][] = [];
      for (let i = 0, b = 0; i < 10; ++i, b += (Math.PI * 2) / 10) {
        vertices.push([Math.cos(b), Math.sin(b), 0.105 * (i % 2 ? 1 : -1)]);
      }
      vertices.push([0, 0, -1], [0, 0, 1]);
      return {
        vertices,
        faces: [
          [5, 7, 11, 1],
          [4, 2, 10, 2],
          [1, 3, 11, 3],
          [0, 8, 10, 4],
          [7, 9, 11, 5],
          [8, 6, 10, 6],
          [9, 1, 11, 7],
          [2, 0, 10, 8],
          [3, 5, 11, 9],
          [6, 4, 10, 10],
          [1, 0, 2, -1],
          [1, 2, 3, -1],
          [3, 2, 4, -1],
          [3, 4, 5, -1],
          [5, 4, 6, -1],
          [5, 6, 7, -1],
          [7, 6, 8, -1],
          [7, 8, 9, -1],
          [9, 8, 0, -1],
          [9, 0, 1, -1]
        ],
        chamfer: chamferOverride ? Math.min(0.985, chamferOverride - 0.01) : 0.945,
        scaleFactor: 0.96,
        values: 10,
        margin: 1.0,
        tab: 0,
        af: (-Math.PI * 6) / 5
      };
    }

    case 'd12': {
      const p = (1 + Math.sqrt(5)) / 2;
      const q = 1 / p;
      return {
        vertices: [
          [0, q, p], [0, q, -p], [0, -q, p], [0, -q, -p],
          [p, 0, q], [p, 0, -q], [-p, 0, q], [-p, 0, -q],
          [q, p, 0], [q, -p, 0], [-q, p, 0], [-q, -p, 0],
          [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
          [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
        ],
        faces: [
          [2, 14, 4, 12, 0, 1],
          [15, 9, 11, 19, 3, 2],
          [16, 10, 17, 7, 6, 3],
          [6, 7, 19, 11, 18, 4],
          [6, 18, 2, 0, 16, 5],
          [18, 11, 9, 14, 2, 6],
          [1, 17, 10, 8, 13, 7],
          [1, 13, 5, 15, 3, 8],
          [13, 8, 12, 4, 5, 9],
          [5, 4, 14, 9, 15, 10],
          [0, 12, 8, 10, 16, 11],
          [3, 19, 7, 17, 1, 12]
        ],
        chamfer: chamferOverride ?? 0.968,
        scaleFactor: 0.94,
        values: 12,
        margin: 1.0,
        tab: 0.2,
        af: -Math.PI / 4 / 2
      };
    }

    case 'd20':
    default: {
      const t = (1 + Math.sqrt(5)) / 2;
      return {
        vertices: [
          [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
          [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
          [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
        ],
        faces: [
          [0, 11, 5, 1], [0, 5, 1, 2], [0, 1, 7, 3], [0, 7, 10, 4], [0, 10, 11, 5],
          [1, 5, 9, 6], [5, 11, 4, 7], [11, 10, 2, 8], [10, 7, 6, 9], [7, 1, 8, 10],
          [3, 9, 4, 11], [3, 4, 2, 12], [3, 2, 6, 13], [3, 6, 8, 14], [3, 8, 9, 15],
          [4, 9, 5, 16], [2, 4, 11, 17], [6, 2, 10, 18], [8, 6, 7, 19], [9, 8, 1, 20]
        ],
        chamfer: chamferOverride ?? 0.955,
        scaleFactor: 1.0,
        values: 20,
        margin: 1.0,
        tab: -0.2,
        af: -Math.PI / 4 / 2
      };
    }
  }
}
