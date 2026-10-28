import { Quaternion, Vector3 } from '@babylonjs/core';
import { DicePhysicsConfig } from './dice-physics.types';
import { DiceMotionEntry, DiePhysicsTrajectoryPlan } from './dice-roll-motion.types';
import { closestRestPose, resultSymmetry, rollShape } from './dice-roll-orientation';
import { getPolyhedronRawTable } from './models/polyhedra-tables.model';
import { advanceContactRock, beginContactRock, ContactRock, supportHeight as solidHeight } from './dice-contact-rocking';

const DT = 1 / 120;
interface Body {
  position: Vector3; velocity: Vector3; angular: Vector3; rotation: Quaternion;
  vertices: Vector3[]; rest?: Quaternion; rock?: ContactRock; restFace: number; quiet: number; asleep: boolean;
  positions: Vector3[]; rotations: Quaternion[]; impacts: number[];
}
function supportHeight(body: Body, rotation = body.rotation): number {
  return solidHeight(body.vertices, rotation);
}
function recordImpact(body: Body, step: number) {
  if (!body.impacts.length || step - body.impacts.at(-1)! > 10) body.impacts.push(step);
}

/** Simulate an unnumbered solid to rest, then pre-orient its entire path to the supplied result. */
export function simulateDiceRolls(entries: readonly DiceMotionEntry[], sizeScale: number,
  physics: DicePhysicsConfig, random: () => number = Math.random): DiePhysicsTrajectoryPlan[] {
  if (!entries.length) return [];
  const halfW = Math.max(2.5, physics.boundaryWidth * 0.5 - sizeScale);
  const halfD = Math.max(2, physics.boundaryDepth * 0.5 - sizeScale);
  const gravity = 24 * Math.max(0.15, physics.gravity);
  const force = (2.5 + physics.throwForce * 3.0) / Math.max(0.25, Math.pow(physics.mass, 0.35));
  const spin = Math.min(50, physics.spinForce * 2.4);
  const bodies: Body[] = entries.map((entry, i) => {
    const side = i % 2 ? 1 : -1;
    const z = entries.length > 1 ? (i / (entries.length - 1) - 0.5) * halfD : 0;
    const points = entry.collisionVertices ? Array.from({ length: entry.collisionVertices.length / 3 },
      (_, index) => Vector3.FromArray(entry.collisionVertices!, index * 3))
      : rollShape(entry.dieType).vertices.map(v => v.scale(1.15 * sizeScale * getPolyhedronRawTable(entry.dieType).scaleFactor));
    const vertices = [...new Map(points.map(point => [
      `${Math.round(point.x * 1e6)}:${Math.round(point.y * 1e6)}:${Math.round(point.z * 1e6)}`, point,
    ])).values()];
    return {
      position: new Vector3(side * halfW * 0.9, Math.max(2, physics.startingHeight * 0.85) + (i % 3) * 0.4, z),
      velocity: new Vector3(-side * force * (0.8 + random() * 0.35), -1.5 - random(), -z * 0.5 + (random() - 0.5) * 4),
      angular: new Vector3((random() - 0.5) * spin * 2, (random() - 0.5) * spin * 2, (random() - 0.5) * spin * 2),
      rotation: Quaternion.RotationYawPitchRoll(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2),
      vertices, restFace: 1, quiet: 0, asleep: false, positions: [], rotations: [], impacts: [],
    };
  });
  let steps = 0;
  for (; steps <= 2400; steps++) {
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (steps && !body.asleep) {
        const elapsed = steps * DT;
        body.velocity.y -= gravity * DT;
        body.velocity.x *= Math.exp(-Math.max(0, physics.linearDamping) * 1.8 * DT);
        body.velocity.z *= Math.exp(-Math.max(0, physics.linearDamping) * 1.8 * DT);
        body.position.addInPlace(body.velocity.scale(DT));
        const floor = supportHeight(body);
        const contact = body.position.y <= floor + 0.002;
        if (contact) {
          body.position.y = floor;
          const impact = Math.max(0, -body.velocity.y);
          if (impact > 1.25) recordImpact(body, steps);
          // A padded tray gradually dissipates extreme high-restitution throws too.
          const restitution = Math.min(0.92, Math.max(0, physics.restitution)) * Math.exp(-Math.max(0, elapsed - 3) * 0.6);
          body.velocity.y = impact > 1.1 ? impact * restitution : 0;
          const drag = Math.exp(-(1.5 + Math.max(0, physics.friction) * 5) * DT);
          body.velocity.x *= drag; body.velocity.z *= drag;
          if (!body.rock) body.angular.scaleInPlace(Math.exp(-(2 + Math.max(0, physics.friction) * 5) * DT));
          if (!body.rest && body.velocity.y < 0.3 && body.angular.length() < 2.5) {
            const rest = closestRestPose(entries[i].dieType, body.rotation);
            body.rest = rest.rotation; body.restFace = rest.face;
            body.rock = beginContactRock(body.rotation, rest.rotation, body.angular, body.vertices);
          }
        } else body.angular.scaleInPlace(Math.exp(-Math.max(0, physics.angularDamping) * 1.6 * DT));
        if (body.rock) {
          body.rotation = advanceContactRock(body.rock, body.vertices, DT);
          body.angular.copyFrom(body.rock.axis).scaleInPlace(body.rock.speed);
          body.position.y = supportHeight(body); body.velocity.y = 0;
          // If momentum crosses the tipping barrier, acquire the new support
          // face without changing orientation or velocity. The die may roll on.
          const next = closestRestPose(entries[i].dieType, body.rotation);
          if (next.face !== body.restFace) {
            body.rest = next.rotation; body.restFace = next.face;
            body.rock = beginContactRock(body.rotation, next.rotation, body.angular, body.vertices);
          }
        } else {
          const speed = body.angular.length();
          if (speed > 1e-8) body.rotation = Quaternion.RotationAxis(body.angular.scale(1 / speed), speed * DT).multiply(body.rotation).normalize();
          body.position.y = Math.max(body.position.y, supportHeight(body));
        }
        if (body.position.x > halfW || body.position.x < -halfW) {
          body.position.x = Math.max(-halfW, Math.min(halfW, body.position.x));
          body.angular.z += body.velocity.x * 0.12;
          body.velocity.x *= -Math.min(0.95, Math.max(0.05, physics.wallRestitution)); body.rest = undefined; body.rock = undefined;
          recordImpact(body, steps);
        }
        if (body.position.z > halfD || body.position.z < -halfD) {
          body.position.z = Math.max(-halfD, Math.min(halfD, body.position.z));
          body.angular.x -= body.velocity.z * 0.12;
          body.velocity.z *= -Math.min(0.95, Math.max(0.05, physics.wallRestitution)); body.rest = undefined; body.rock = undefined;
          recordImpact(body, steps);
        }
        const quiet = body.rock?.finished && Math.hypot(body.velocity.x, body.velocity.z) < 0.008;
        body.quiet = quiet ? body.quiet + 1 : 0;
        if (body.quiet >= 2) {
          body.asleep = true; body.rotation = body.rest!.clone();
          body.position.y = supportHeight(body); body.velocity.setAll(0); body.angular.setAll(0);
        }
      }
    }
    // Shared pool collisions; an impulse wakes a die and lets it find a fresh resting face.
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
      const distance = Math.hypot(dx, dz), separation = 1.95 * sizeScale;
      if (distance > 1e-5 && distance < separation && Math.abs(a.position.y - b.position.y) < separation) {
        const nx = dx / distance, nz = dz / distance;
        const correction = (separation - distance) * 0.5;
        a.position.x -= nx * correction; a.position.z -= nz * correction;
        b.position.x += nx * correction; b.position.z += nz * correction;
        const relative = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
        if (relative < -0.05) {
          const impulse = -relative * 0.65;
          a.velocity.x -= impulse * nx; a.velocity.z -= impulse * nz;
          b.velocity.x += impulse * nx; b.velocity.z += impulse * nz;
          for (const body of [a, b]) { body.asleep = false; body.rest = undefined; body.rock = undefined; body.quiet = 0; recordImpact(body, steps); }
        }
      }
    }
    for (const body of bodies) { body.positions.push(body.position.clone()); body.rotations.push(body.rotation.clone()); }
    if (bodies.every(body => body.asleep)) break;
  }
  if (bodies.some(body => !body.asleep)) throw new Error('Dice motion did not settle within the simulation budget');
  // Never accelerate/decelerate a trajectory to satisfy a cosmetic timeout.
  const duration = steps * DT * 1000;
  return bodies.map((body, i) => {
    const symmetry = resultSymmetry(entries[i].dieType, body.restFace, entries[i].targetValue);
    // Right multiplication is constant for EVERY frame: there is no late result-seeking rotation.
    const rotations = body.rotations.map(rotation => rotation.multiply(symmetry).normalize());
    const last = body.positions.length - 1, firstBounce = body.impacts[0] ?? Math.floor(last * 0.4);
    const secondBounce = body.impacts[1] ?? Math.floor(last * 0.7);
    return {
      startPos: body.positions[0], bounce1Pos: body.positions[firstBounce], bounce2Pos: body.positions[secondBounce], endPos: body.positions[last],
      startQuat: rotations[0], midQuat1: rotations[firstBounce], midQuat2: rotations[secondBounce], targetQuat: rotations[last],
      bounced1: false, bounced2: false, keyframesPos: body.positions, keyframesQuat: rotations,
      bounceFrames: body.impacts, bouncedIndices: new Set<number>(), delayMs: i * Math.max(0, physics.delay), durationMs: duration,
    };
  });
}
