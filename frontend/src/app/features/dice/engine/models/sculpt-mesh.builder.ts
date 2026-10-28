import { Curve3, Vector3, VertexData } from '@babylonjs/core';

/** Accumulate ornaments into a single draw call instead of one mesh per scale. */
export class SculptMesh {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly indices: number[] = [];
  readonly uvs: number[] = [];

  vertex(p: Vector3, n: Vector3, u = 0, v = 0): number {
    const index = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z); this.normals.push(n.x, n.y, n.z);
    this.uvs.push(u, v); return index;
  }

  triangle(a: Vector3, b: Vector3, c: Vector3): void {
    const n = Vector3.Cross(b.subtract(a), c.subtract(a)).normalize();
    const index = this.vertex(a, n); this.vertex(b, n); this.vertex(c, n);
    this.indices.push(index, index + 2, index + 1);
  }

  tube(points: Vector3[], radius: number, taper = 1, smooth = 3, sides = 6): void {
    const path = smooth > 1 ? Curve3.CreateCatmullRomSpline(points, smooth).getPoints() : points;
    const start = this.positions.length / 3;
    for (let i = 0; i < path.length; i++) {
      const tangent = path[Math.min(path.length - 1, i + 1)].subtract(path[Math.max(0, i - 1)]).normalize();
      const ref = Math.abs(tangent.y) < 0.9 ? Vector3.Up() : Vector3.Right();
      const x = Vector3.Cross(tangent, ref).normalize(), y = Vector3.Cross(tangent, x).normalize();
      const r = radius * (1 + (taper - 1) * i / (path.length - 1));
      for (let j = 0; j < sides; j++) {
        const angle = j * 2 * Math.PI / sides;
        const normal = x.scale(Math.cos(angle)).add(y.scale(Math.sin(angle)));
        this.vertex(path[i].add(normal.scale(r)), normal);
      }
      if (i) for (let j = 0; j < sides; j++) {
        const a = start + (i - 1) * sides + j, b = start + (i - 1) * sides + (j + 1) % sides;
        this.indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }

  /** A beveled shield tile: sloping sides, a crest and a pointed lower tip. */
  scale(at: (x: number, y: number, z: number) => Vector3, x: number, y: number, width: number, height: number, depth: number): void {
    const outline = [[-0.5, 0.38], [0, 0.53], [0.5, 0.38], [0.48, -0.1], [0, -0.57], [-0.48, -0.1]];
    this.plate(at, outline.map(([u,v]) => [x + u * width, y + v * height]), depth);
  }

  plate(at: (x: number, y: number, z: number) => Vector3, outline: number[][], depth: number): void {
    const x = outline.reduce((s,p)=>s+p[0],0)/outline.length, y = outline.reduce((s,p)=>s+p[1],0)/outline.length;
    const base = outline.map(([u,v]) => at(u,v,-0.012));
    const top = outline.map(([u,v]) => at(x+(u-x)*0.87,y+(v-y)*0.87,depth));
    const ridge = at(x,y,depth*1.1);
    for (let i = 0; i < base.length; i++) {
      const next = (i + 1) % base.length;
      this.triangle(base[next], base[i], top[i]); this.triangle(base[next], top[i], top[next]);
      this.triangle(top[next], top[i], ridge);
    }
  }

  data(): VertexData {
    const data = new VertexData();
    data.positions = this.positions; data.normals = this.normals;
    data.indices = this.indices; data.uvs = this.uvs;
    return data;
  }
}
