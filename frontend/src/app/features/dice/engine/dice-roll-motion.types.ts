import { Quaternion, Vector3 } from '@babylonjs/core';
import { DicePolyhedronType } from './models/dice-model.types';

export interface DiceMotionEntry {
  readonly dieType: DicePolyhedronType;
  readonly targetValue: number;
  readonly collisionVertices?: readonly number[];
}
export interface DiePhysicsTrajectoryPlan {
  startPos: Vector3; bounce1Pos: Vector3; bounce2Pos: Vector3; endPos: Vector3;
  startQuat: Quaternion; midQuat1: Quaternion; midQuat2: Quaternion; targetQuat: Quaternion;
  bounced1: boolean; bounced2: boolean;
  keyframesPos: Vector3[]; keyframesQuat: Quaternion[];
  bounceFrames?: number[]; bouncedIndices?: Set<number>;
  delayMs?: number; durationMs?: number;
}
