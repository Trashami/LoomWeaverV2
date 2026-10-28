import { Vector3 } from '@babylonjs/core';
import { DicePolyhedronType } from './dice-model.types';
import { getPolyhedronRawTable } from './polyhedra-tables.model';
import { SculptMesh } from './sculpt-mesh.builder';

export interface SculptFace {
  value: number;
  radius: number;
  polygon: number[][];
  at: (x: number, y: number, z: number) => Vector3;
}

export function sculptFaces(type: DicePolyhedronType, baseRadius: number, chamfer: number): SculptFace[] {
  const table = getPolyhedronRawTable(type);
  const scale = baseRadius * table.scaleFactor / Math.max(...table.vertices.map(v => Math.hypot(...v)));
  const vertices = table.vertices.map(v => Vector3.FromArray(v).scale(scale));
  return table.faces.map(face => {
    const points = face.slice(0, -1).map(i => vertices[i]);
    const center = points.reduce((sum, p) => sum.add(p), Vector3.Zero()).scale(1 / points.length);
    const normal = Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0])).normalize();
    if (Vector3.Dot(normal, center) < 0) normal.negateInPlace();
    const up = points[0].subtract(center).normalize(), right = Vector3.Cross(up, normal).normalize();
    const projected = points.map(p => [Vector3.Dot(p.subtract(center), right) * chamfer, Vector3.Dot(p.subtract(center), up) * chamfer]);
    const radius = Math.min(...projected.map((a, i) => {
      const b = projected[(i + 1) % projected.length];
      return Math.abs(a[0] * b[1] - a[1] * b[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    }));
    return { value: face.at(-1)!, radius, polygon: projected.map(p => p.map(v => v / radius)),
      at: (x, y, z) => center.add(right.scale(x * radius)).add(up.scale(y * radius)).add(normal.scale(z * radius)) };
  });
}

/** Original winged wyrm sculpture, with empty spaces between the ribs. */
export function addOpenworkDragon(mesh: SculptMesh, face: SculptFace): void {
  const { at, radius: r } = face;
  const tube = (points: number[][], width: number, taper = 1, smooth = 3) =>
    mesh.tube(points.map(([x, y, z]) => at(x, y, z ?? -0.025)), width * r, taper, smooth);
  // Serpentine neck, belly and long curling tail; the belly bridges the numeral.
  tube([[0.15, 0.76], [0.36, 0.55], [0.26, 0.32], [-0.06, 0.1], [-0.28, -0.2], [-0.22, -0.47],
    [0.12, -0.68], [0.53, -0.59], [0.62, -0.31], [0.44, -0.2], [0.31, -0.35]], 0.125, 0.15);
  // Snout, jaw, brow, two swept horns.
  tube([[0.22, 0.65, 0.02], [0.08, 0.75, 0.025], [-0.12, 0.71, 0.02]], 0.14, 0.5);
  tube([[0.15, 0.66, 0.02], [-0.08, 0.64, 0.02]], 0.035, 0.6, 1);
  tube([[0.18, 0.76], [0.33, 0.95], [0.45, 1.06]], 0.045, 0.05);
  tube([[0.08, 0.78], [0.1, 0.97], [0.22, 1.13]], 0.035, 0.05);
  // Both wings connect out to the surrounding face frame.
  for (const sign of [-1, 1]) {
    const wing = (p: number[][], width: number, taper = 1) => tube(p.map(([x, y]) => [x * sign, y, -0.07]), width, taper);
    wing([[0.16, 0.3], [0.52, 0.65], [0.86, 0.47], [0.96, -0.34]], 0.05);
    for (const [x, y] of [[0.96, -0.34], [0.72, -0.18], [0.48, -0.28]]) {
      wing([[0.52, 0.65], [x * 0.9, 0.21], [x, y]], 0.028, 0.5);
    }
    wing([[0.96, -0.34], [0.84, -0.13], [0.72, -0.18], [0.58, -0.12], [0.48, -0.28], [0.16, 0.3]], 0.023);
    // Cast wing membranes at the shoulder, with open scallops below.
    mesh.triangle(at(sign * 0.16, 0.3, -0.06), at(sign * 0.52, 0.65, -0.06), at(sign * 0.44, 0.12, -0.055));
    mesh.triangle(at(sign * 0.52, 0.65, -0.06), at(sign * 0.86, 0.47, -0.06), at(sign * 0.72, 0.03, -0.055));
    wing([[0.14, -0.23], [0.43, -0.42], [0.61, -0.64]], 0.038, 0.4);
    // Claws.
    for (let i = 0; i < 3; i++) wing([[0.55, -0.58], [0.61 + i * 0.05, -0.69 + i * 0.035]], 0.018, 0.1);
  }
  // Neck spines and abdominal plates catch the studio light independently.
  for (let i = 0; i < 9; i++) {
    const y = 0.5 - i * 0.115, x = 0.25 * Math.sin((y + 0.15) * 4);
    tube([[x + 0.05, y, 0.025], [x + 0.19, y + 0.045, 0.075]], 0.028, 0.04, 1);
    mesh.scale(at, x, y, 0.13, 0.1, 0.06);
  }
  // Fine braided rails reinforce the open metal silhouette.
  for (let i = 0; i < face.polygon.length; i++) {
    const a = face.polygon[i], b = face.polygon[(i + 1) % face.polygon.length];
    const edge = Array.from({ length: 15 }, (_, j) => {
      const t = j / 14;
      return at((a[0] * (1 - t) + b[0] * t) * 0.97, (a[1] * (1 - t) + b[1] * t) * 0.97, Math.sin(j * Math.PI * 0.75) * 0.015 - 0.01);
    });
    mesh.tube(edge, 0.023 * r, 1, 1, 5);
  }
}

export function addDragonScales(mesh: SculptMesh, face: SculptFace, eye: boolean): void {
  // Clip edge tiles to the face, avoiding a conspicuous undecorated border.
  const clipped = (tile: number[][]) => {
    for (let i = 0; i < face.polygon.length; i++) {
      const a = face.polygon[i], b = face.polygon[(i + 1) % face.polygon.length];
      const cross = (p: number[]) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
      const sign = Math.sign(cross([0,0])), output: number[][] = [];
      for(let j=0;j<tile.length;j++) {
        const p=tile[j], q=tile[(j+1)%tile.length], dp=cross(p)*sign, dq=cross(q)*sign;
        if(dp>=0)output.push(p);
        if((dp>=0)!==(dq>=0)) { const t=dp/(dp-dq); output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]); }
      }
      tile=output;
    }
    return tile;
  };
  const extent = Math.ceil(Math.max(...face.polygon.flat().map(Math.abs)) / 0.3)+1;
  for (let row = -extent; row <= extent; row++) for (let col = -extent; col <= extent; col++) {
    const x = col * 0.36 + (row % 2 ? 0.18 : 0), y = row * 0.3;
    // Only the sculpted eye needs a socket; lettering sits above the relief.
    const safe = !eye || Math.hypot(x / 1.03, y / 0.53) > 1;
    if (safe) {
      const tile=clipped([[-0.17,0.15],[0,0.19],[0.17,0.15],[0.17,-0.04],[0,-0.18],[-0.17,-0.04]].map(([u,v])=>[x+u,y+v]));
      if(tile.length>=3)mesh.plate(face.at,tile,0.025);
    }
  }
}
