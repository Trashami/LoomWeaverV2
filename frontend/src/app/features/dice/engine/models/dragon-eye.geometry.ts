import { SculptFace } from './dragon-face.geometry';
import { SculptMesh } from './sculpt-mesh.builder';

export function addDragonEye(metal: SculptMesh, lens: SculptMesh, face: SculptFace): void {
  const { at, radius } = face;
  // A convex almond lens, not a flat eye decal.
  const rings = 9, segments = 48;
  for (let ring = 0; ring <= rings; ring++) {
    const r = ring / rings;
    for (let j = 0; j <= segments; j++) {
      const a = j * Math.PI * 2 / segments;
      const x = Math.cos(a) * 0.87 * r;
      const y = Math.sin(a) * (0.36 - 0.1 * Math.abs(Math.cos(a))) * r;
      const z = 0.025 + 0.19 * Math.sqrt(Math.max(0, 1 - r * r));
      const p = at(x, y, z);
      const n = at(x * 0.15, y * 0.8, 1).subtract(at(0, 0, 0)).normalize();
      lens.vertex(p, n, 0.5 + x / 1.74, 0.5 + y / 0.72);
      if (ring && j) {
        const b = ring * (segments + 1) + j;
        lens.indices.push(b, b - segments - 1, b - 1, b - 1, b - segments - 1, b - segments - 2);
      }
    }
  }
  for (const sign of [-1, 1]) {
    const lid = Array.from({ length: 17 }, (_, i) => {
      const x = (i / 16 * 2 - 1) * 0.91;
      return at(x, sign * Math.sin(i / 16 * Math.PI) * 0.37, 0.065);
    });
    metal.tube(lid, 0.065 * radius, 1, 1, 8);
    // Serrated overlapping brow plates follow the eye's curve.
    for (let i = 1; i < 8; i++) {
      const x = (i / 8 * 2 - 1) * 0.9;
      const y = sign * (0.13 + Math.sin(i / 8 * Math.PI) * 0.38);
      metal.scale(at, x, y, 0.22, 0.22, 0.09);
    }
  }
  for (const side of [-1, 1]) metal.tube([
    at(side * 0.56, 0.37, 0.04), at(side * 0.65, 0.67, 0.11), at(side * 0.53, 0.88, 0.03)
  ], 0.065 * radius, 0.02, 5, 7);
}

/** Deterministic iris fibers; the lens supplies actual curvature and reflections. */
export function paintDragonIris(ctx: CanvasRenderingContext2D, color: string, size = 256): void {
  const half = size / 2;
  ctx.fillStyle = '#061e18'; ctx.fillRect(0, 0, size, size);
  const iris = ctx.createRadialGradient(half, half, size * 0.05, half, half, size * 0.51);
  iris.addColorStop(0, '#b5ee9f'); iris.addColorStop(0.35, color);
  iris.addColorStop(0.78, '#087f61'); iris.addColorStop(1, '#03100c');
  ctx.fillStyle = iris; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const a = i * Math.PI * 2 / 260, jitter = (Math.sin(i * 78.233) * 43758.5453) % 1;
    ctx.strokeStyle = i % 3 ? 'rgba(0,25,20,0.44)' : 'rgba(195,255,210,0.38)';
    ctx.lineWidth = i % 4 ? 0.6 : 1.2;
    ctx.beginPath(); ctx.moveTo(half + Math.cos(a) * size * 0.12, half + Math.sin(a) * size * 0.18);
    ctx.lineTo(half + Math.cos(a + jitter * 0.025) * size * 0.49, half + Math.sin(a + jitter * 0.025) * size * 0.5); ctx.stroke();
  }
  ctx.fillStyle = '#010605'; ctx.beginPath();
  ctx.moveTo(half, size * 0.055);
  ctx.bezierCurveTo(size * 0.67, half, size * 0.58, size * 0.7, half, size * 0.945);
  ctx.bezierCurveTo(size * 0.42, size * 0.7, size * 0.33, half, half, size * 0.055); ctx.fill();
}
