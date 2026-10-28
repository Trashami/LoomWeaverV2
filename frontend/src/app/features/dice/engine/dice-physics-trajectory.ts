import { DiceMotionEntry, DiePhysicsTrajectoryPlan } from './dice-roll-motion.types';
import { simulateDiceRolls } from './dice-roll-trajectory.simulator';
import {
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  StandardMaterial,
  Vector3
} from '@babylonjs/core';
import {
  DEFAULT_DICE_PHYSICS_CONFIG,
  DicePhysicsConfig
} from './dice-physics.types';
import {
  DicePolyhedronType
} from './models';

export type { DiePhysicsTrajectoryPlan } from './dice-roll-motion.types';

export function createPhysicsBoxTrajectoryPlans(
  entries: readonly DiceMotionEntry[], sizeScale: number,
  physics: DicePhysicsConfig = DEFAULT_DICE_PHYSICS_CONFIG, _cameraPosition?: Vector3,
  random: () => number = Math.random,
): DiePhysicsTrajectoryPlan[] {
  return simulateDiceRolls(entries, sizeScale, physics, random);
}

export function createDieTrajectoryPlan(
  index: number,
  totalDice: number,
  dieType: DicePolyhedronType,
  targetValue: number,
  sizeScale: number,
  physics: DicePhysicsConfig = DEFAULT_DICE_PHYSICS_CONFIG
): DiePhysicsTrajectoryPlan {
  const entries = Array.from({ length: Math.max(1, totalDice) }, (_, idx) => ({
    dieType,
    targetValue: idx === index ? targetValue : 1
  }));
  const all = createPhysicsBoxTrajectoryPlans(entries, sizeScale, physics);
  return all[Math.min(index, all.length - 1)];
}

export function evaluateDieTrajectoryStep(
  plan: DiePhysicsTrajectoryPlan,
  t: number,
  sizeScale: number,
  onBounceImpact?: (intensity: number) => void
): { position: Vector3; rotationQuaternion: Quaternion } {
  if (plan.keyframesPos && plan.keyframesQuat && plan.keyframesPos.length > 1) {
    const maxIdx = plan.keyframesPos.length - 1;
    const exact = Math.max(0, Math.min(1, t)) * maxIdx;
    const idx0 = Math.floor(exact);
    const idx1 = Math.min(maxIdx, idx0 + 1);
    const frac = exact - idx0;

    if (plan.bounceFrames && plan.bouncedIndices) {
      for (const bf of plan.bounceFrames) {
        if (idx0 >= bf && !plan.bouncedIndices.has(bf)) {
          plan.bouncedIndices.add(bf);
          onBounceImpact?.(Math.max(0.25, 0.95 - (bf / maxIdx) * 0.65));
        }
      }
    }

    return {
      position: Vector3.Lerp(plan.keyframesPos[idx0], plan.keyframesPos[idx1], frac),
      rotationQuaternion: Quaternion.Slerp(plan.keyframesQuat[idx0], plan.keyframesQuat[idx1], frac)
    };
  }

  return { position: plan.endPos.clone(), rotationQuaternion: plan.targetQuat.clone() };
}

export function createFloatingResultBadge(
  value: number,
  position: Vector3,
  accentHex: string,
  isCritSuccess: boolean,
  isCritFail: boolean,
  scene: Scene
): Mesh {
  const plane = MeshBuilder.CreatePlane(
    `lw-roll-badge-${value}-${Math.round(Math.random() * 1000)}`,
    { width: 1.05, height: 1.05 },
    scene
  );
  plane.position = position.add(new Vector3(0, 1.35, 0));
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

  const tex = new DynamicTexture(`lw-roll-badge-tex-${value}`, 256, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 256);

  const ringColor = isCritSuccess ? '#ffd166' : isCritFail ? '#ff425b' : accentHex;
  ctx.beginPath();
  ctx.arc(128, 128, 92, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5, 16, 12, 0.88)';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = ringColor;
  ctx.stroke();

  ctx.font = '800 92px Cinzel, Georgia, serif';
  ctx.fillStyle = isCritSuccess ? '#ffe89e' : isCritFail ? '#ff8fa0' : '#f4f7f5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), 128, 132);
  tex.update(false);

  const mat = new StandardMaterial(`lw-roll-badge-mat-${value}`, scene);
  mat.diffuseTexture = tex;
  mat.emissiveTexture = tex;
  mat.opacityTexture = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  plane.material = mat;

  return plane;
}

export function createFullscreenDieTrajectoryPlan(
  index: number,
  totalDice: number,
  dieType: DicePolyhedronType,
  targetValue: number,
  sizeScale: number
): DiePhysicsTrajectoryPlan {
  return createDieTrajectoryPlan(index, totalDice, dieType, targetValue, sizeScale, DEFAULT_DICE_PHYSICS_CONFIG);
}

export function createDieContactShadowDisc(
  index: number,
  sizeScale: number,
  scene: Scene,
  shadowTransparency = 0.8
): Mesh {
  const disc = MeshBuilder.CreateGround(
    `lw-die-shadow-${index}-${Math.round(Math.random() * 1000)}`,
    { width: 2.35 * sizeScale, height: 2.35 * sizeScale },
    scene
  );
  disc.position.y = 0.02;

  const tex = new DynamicTexture(`lw-die-shadow-tex-${index}`, 128, scene, true);
  tex.hasAlpha = true;
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 128, 128);

  const alpha = Math.max(0, Math.min(1, shadowTransparency));
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, `rgba(0, 0, 0, ${(0.72 * alpha).toFixed(2)})`);
  grad.addColorStop(0.52, `rgba(0, 0, 0, ${(0.36 * alpha).toFixed(2)})`);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  tex.update(false);

  const mat = new StandardMaterial(`lw-die-shadow-mat-${index}`, scene);
  mat.diffuseTexture = tex;
  mat.opacityTexture = tex;
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  disc.material = mat;

  return disc;
}
