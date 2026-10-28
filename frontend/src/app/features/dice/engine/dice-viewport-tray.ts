import { ArcRotateCamera, Camera } from '@babylonjs/core';
import { DicePhysicsConfig } from './dice-physics.types';
/** Keep the default tray inside the visible canvas, including narrow editor layouts. */
export function viewportTray(physics: DicePhysicsConfig, camera: Camera | null, aspect: number): DicePhysicsConfig {
  if (!(camera instanceof ArcRotateCamera)) return physics;
  const height = 2 * camera.radius * Math.tan(camera.fov / 2) * 0.86;
  const width = height * Math.max(0.35, aspect);
  return { ...physics, boundaryWidth: Math.max(5, Math.min(physics.boundaryWidth, width)),
    boundaryDepth: Math.max(4, Math.min(physics.boundaryDepth, height)) };
}
