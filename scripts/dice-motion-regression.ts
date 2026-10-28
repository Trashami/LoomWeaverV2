import { buildBabylonDieVertexData } from '../frontend/src/app/features/dice/engine/models/chamfer-geometry.builder';
import { DICE_MODEL_CATALOG } from '../frontend/src/app/features/dice/engine/models/dice-model.catalog';
import { Quaternion, Vector3 } from '@babylonjs/core';
import { simulateDiceRolls } from '../frontend/src/app/features/dice/engine/dice-roll-trajectory.simulator';
import { resultFace, resultSymmetry, rollShape } from '../frontend/src/app/features/dice/engine/dice-roll-orientation';
import { DEFAULT_DICE_PHYSICS_CONFIG as defaults } from '../frontend/src/app/features/dice/engine/dice-physics.types';
import { DicePolyhedronType } from '../frontend/src/app/features/dice/engine/models/dice-model.types';

const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const rng = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const angle = (a: Quaternion, b: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b))));
const types: DicePolyhedronType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
let rolls = 0;
for (const type of types) {
  const shape = rollShape(type), axis = type === 'd4' ? Vector3.Down() : Vector3.Up();
  for (const natural of shape.faces) for (const target of shape.faces) {
    const value = type === 'd100' ? target.value * 10 : target.value;
    const symmetry = resultSymmetry(type, natural.value, value);
    const transformed = new Vector3(); target.normal.rotateByQuaternionToRef(symmetry, transformed);
    check(Vector3.Distance(transformed, natural.normal) < 1e-6, `${type}: symmetry maps the requested numbered face`);
  }
  for (let seed = 1; seed <= 16; seed++) {
    const value = type === 'd100' ? ((seed % 10) + 1) * 10 : (seed % shape.faces.length) + 1;
    const [plan] = simulateDiceRolls([{ dieType: type, targetValue: value }], 1, defaults, rng(seed));
    const rotations = plan.keyframesQuat!, positions = plan.keyframesPos!, last = rotations.length - 1;
    const normal = shape.faces.find(face => face.value === resultFace(type, value))!.normal;
    const world = new Vector3(); normal.rotateByQuaternionToRef(rotations[last], world);
    check(Vector3.Dot(world, axis) > 0.999999, `${type}/${seed}: lands on the requested result`);
    check(angle(rotations[last], rotations[last - 1]) < 0.001, `${type}/${seed}: no final rotation snap`);
    check(Vector3.Distance(positions[last], positions[last - 1]) < 0.001, `${type}/${seed}: no final position snap`);
    for (let frame = Math.floor(last * 0.9) + 1; frame <= last; frame++) {
      check(angle(rotations[frame], rotations[frame - 1]) < 0.02, `${type}/${seed}: no late flip`);
    }
    rolls++;
  }
  const a = simulateDiceRolls([{ dieType: type, targetValue: type === 'd100' ? 10 : 1 }], 1, defaults, rng(101))[0];
  const b = simulateDiceRolls([{ dieType: type, targetValue: type === 'd100' ? 100 : shape.faces.length }], 1, defaults, rng(101))[0];
  const relative = a.startQuat.conjugate().multiply(b.startQuat).normalize();
  check(a.keyframesPos!.length === b.keyframesPos!.length, 'result cannot change motion duration');
  a.keyframesPos!.forEach((position, frame) => {
    check(Vector3.Distance(position, b.keyframesPos![frame]) < 1e-10, 'result cannot redirect the landing path');
    const delta = a.keyframesQuat![frame].conjugate().multiply(b.keyframesQuat![frame]).normalize();
    check(angle(delta, relative) < 1e-6, 'result correction must be constant from release through rest');
  });
}
for (const physics of [
  { ...defaults, settleTimeout: 1000 },
  { ...defaults, restitution: 0.92, gravity: 0.15, friction: 0, angularDamping: 0, linearDamping: 0 },
  { ...defaults, spinForce: 20, throwForce: 15, gravity: 2.5, friction: 0.1 },
]) {
  const plans = simulateDiceRolls(types.slice(0, 5).map((dieType, i) => ({ dieType, targetValue: i % 4 + 1 })), 1, physics, rng(42));
  check(plans.every(plan => plan.endPos.y > 0 && Number.isFinite(plan.durationMs)), 'extreme pool settings settle safely');
}
for (const model of DICE_MODEL_CATALOG) {
  const entries = types.map((dieType, i) => ({ dieType, targetValue: dieType === 'd100' ? (i % 10 + 1) * 10 : i % 4 + 1,
    collisionVertices: Array.from(buildBabylonDieVertexData(dieType, 1.15, model.chamferFactor, model.id === 'model-custom-glb').vertexData.positions!),
  }));
  const plans = simulateDiceRolls(entries, 1, defaults, rng(16));
  plans.forEach((plan, index) => {
    let bottom = Infinity;
    const contactPoints: string[] = [];
    for (let vertex = 0; vertex < entries[index].collisionVertices.length; vertex += 3) {
      const point = Vector3.FromArray(entries[index].collisionVertices, vertex), world = new Vector3();
      point.rotateByQuaternionToRef(plan.targetQuat, world);
      bottom = Math.min(bottom, world.y + plan.endPos.y);
      if (Math.abs(world.y + plan.endPos.y) < 1e-5) contactPoints.push(`${world.x.toFixed(5)}:${world.z.toFixed(5)}`);
    }
    check(new Set(contactPoints).size >= 3, `${model.id}/${entries[index].dieType}: ${new Set(contactPoints).size} floor contacts`);
    check(Math.abs(bottom) < 1e-6, `${model.id}: the actual model lands on the floor without a height snap`);
  });
}
check(simulateDiceRolls([], 1, defaults).length === 0, 'empty pool is harmless');
console.log(`PASS: ${rolls} seeded rolls, all result symmetries, no late flips, unchanged motion across results, and extreme pools.`);

const gentle = simulateDiceRolls([{dieType:'d6',targetValue:3}],1,{...defaults,throwForce:1},rng(88))[0];
const hard = simulateDiceRolls([{dieType:'d6',targetValue:3}],1,{...defaults,throwForce:12},rng(88))[0];
check(Vector3.Distance(hard.keyframesPos![1],hard.keyframesPos![0]) > Vector3.Distance(gentle.keyframesPos![1],gentle.keyframesPos![0])*3,'throw strength changes launch speed');
check(hard.bounceFrames!.length > gentle.bounceFrames!.length,'hard throws produce more wall/table contacts');
