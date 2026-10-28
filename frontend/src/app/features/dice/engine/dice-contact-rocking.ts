import { Quaternion, Vector3 } from '@babylonjs/core';

export interface ContactRock {
  rest: Quaternion;
  axis: Vector3;
  angle: number;
  speed: number;
  inertia: number;
  finished: boolean;
}

/** Exact support height of the convex solid, including its bevel vertices. */
export function supportHeight(vertices: readonly Vector3[], rotation: Quaternion): number {
  let bottom = 0;
  const { x, y, z, w } = rotation;
  const rx = 2 * (x * y + w * z), ry = 1 - 2 * (x * x + z * z), rz = 2 * (y * z - w * x);
  for (const v of vertices) bottom = Math.min(bottom, rx * v.x + ry * v.y + rz * v.z);
  return -bottom;
}

export function beginContactRock(rotation: Quaternion, rest: Quaternion, angular: Vector3,
  vertices: readonly Vector3[]): ContactRock {
  const delta = rotation.multiply(rest.conjugate()).normalize();
  if (delta.w < 0) delta.scaleInPlace(-1);
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, delta.w)));
  const axis = new Vector3(delta.x, delta.y, delta.z);
  if (axis.lengthSquared() < 1e-10) axis.set(1, 0, 0); else axis.normalize();
  return { rest, axis, angle, speed: Vector3.Dot(angular, axis),
    inertia: Math.max(0.08, Math.max(...vertices.map(v => v.lengthSquared())) * 0.8), finished: false };
}

/** Gravity pulls the centre of mass down the actual support-height potential.
 * Momentum carries it through flat contact; each contact loses energy and rocks
 * onto the opposite edge. These contact constants are intentionally not editable.
 * Unlike a pose spring, gravity does not fade to zero as the die approaches flat. */
export function advanceContactRock(rock: ContactRock, vertices: readonly Vector3[], dt: number): Quaternion {
  const rotationAt = (angle: number) => Quaternion.RotationAxis(rock.axis, angle).multiply(rock.rest).normalize();
  const h = (angle: number) => supportHeight(vertices, rotationAt(angle));
  const substep = dt / 4;
  for (let step = 0; step < 4 && !rock.finished; step++) {
    const old = rock.angle;
    const derivative = (h(old + 0.0001) - h(old - 0.0001)) / 0.0002;
    rock.speed += -24 * derivative / rock.inertia * substep;
    rock.speed *= Math.exp(-0.85 * substep);
    rock.angle += rock.speed * substep;
    if (old * rock.angle < 0) {
      // Inelastic face contact, rather than artificial damping on approach.
      rock.speed *= 0.52;
      rock.angle *= 0.52;
    }
    if (Math.abs(rock.angle) < 0.0006 && Math.abs(rock.speed) < 0.13) {
      rock.angle = 0; rock.speed = 0; rock.finished = true;
    }
  }
  return rotationAt(rock.angle);
}
