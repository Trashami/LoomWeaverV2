import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { TerrainMeshBuilder } from '../../maps/engine/terrain/terrain-mesh.builder';
import { getActiveCellStepWorld } from '../../arcane-screen/engine/vtt-los-and-grid.engine';

export interface BabylonSpellTemplateState {
  readonly active: boolean;
  readonly casterPos: { x: number; z: number };
  readonly endPos: { x: number; z: number };
  readonly isSingleOrMulti: boolean;
  readonly aoeRadiusFeet: number;
  readonly blockedByWall: boolean;
}

export interface BabylonTargetTetherEndpoint {
  readonly x: number;
  readonly z: number;
}

const LOOM_GREEN_HEX = '#2ee66b';
const LOOM_GREEN_CORE_HEX = '#86efac';
const BLOCKED_RED_HEX = '#ef4444';
const lastSyncSigByScene = new WeakMap<Scene, string>();

export function disposeBabylonSpellAndTetherMeshes(scene: Scene): void {
  lastSyncSigByScene.delete(scene);
  scene.meshes
    .filter(
      (m) =>
        m.name.startsWith('lw-spell-template-') ||
        m.name.startsWith('lw-target-tether-') ||
        m.name === 'lw-tether-line',
    )
    .forEach((m) => m.dispose(false, true));
}

export function syncBabylonSpellAndTetherMeshes(
  scene: Scene,
  attackerPos: { x: number; z: number } | null,
  tetherTargets: readonly BabylonTargetTetherEndpoint[],
  templateState: BabylonSpellTemplateState | null,
): void {
  const sig = `${attackerPos ? `${attackerPos.x.toFixed(2)},${attackerPos.z.toFixed(2)}` : ''}|${tetherTargets.map((t) => `${t.x.toFixed(2)},${t.z.toFixed(2)}`).join(';')}|${templateState ? `${templateState.active ? 1 : 0}:${templateState.casterPos.x.toFixed(2)},${templateState.casterPos.z.toFixed(2)}:${templateState.endPos.x.toFixed(2)},${templateState.endPos.z.toFixed(2)}:${templateState.isSingleOrMulti ? 1 : 0}:${templateState.aoeRadiusFeet}:${templateState.blockedByWall ? 1 : 0}` : ''}`;
  if (lastSyncSigByScene.get(scene) === sig) return;
  disposeBabylonSpellAndTetherMeshes(scene);
  lastSyncSigByScene.set(scene, sig);

  // 1. Straight, thicker, pulsing LoomWeaver-green target lines from caster to each selected target
  if (attackerPos && tetherTargets.length > 0) {
    const srcY = TerrainMeshBuilder.sampleElevationAt(scene, attackerPos.x, attackerPos.z) + 0.24;
    const startVec = new Vector3(attackerPos.x, srcY, attackerPos.z);

    tetherTargets.forEach((dst, idx) => {
      if (Math.hypot(dst.x - attackerPos.x, dst.z - attackerPos.z) < 0.05) return;
      const dstY = TerrainMeshBuilder.sampleElevationAt(scene, dst.x, dst.z) + 0.24;
      const endVec = new Vector3(dst.x, dstY, dst.z);

      buildStraightPulsingTube(scene, `lw-target-tether-${idx}`, startVec, endVec, LOOM_GREEN_HEX, 0.048);
    });
  }

  // 2. Dynamic Spell / AoE Template attached to caster and clamped to max spell range
  if (!templateState || !templateState.active) return;

  const { casterPos, endPos, isSingleOrMulti, aoeRadiusFeet, blockedByWall } = templateState;
  const colorHex = blockedByWall ? BLOCKED_RED_HEX : LOOM_GREEN_HEX;
  const srcY = TerrainMeshBuilder.sampleElevationAt(scene, casterPos.x, casterPos.z) + 0.22;
  const dstY = TerrainMeshBuilder.sampleElevationAt(scene, endPos.x, endPos.z) + 0.16;

  // Range connection line from caster to template center
  if (Math.hypot(endPos.x - casterPos.x, endPos.z - casterPos.z) > 0.08) {
    buildStraightPulsingTube(
      scene,
      'lw-spell-template-range-line',
      new Vector3(casterPos.x, srcY, casterPos.z),
      new Vector3(endPos.x, dstY, endPos.z),
      colorHex,
      0.042,
    );
  }

  const stepWorld = getActiveCellStepWorld();
  const radiusWorld = isSingleOrMulti
    ? Math.max(0.48, stepWorld * 0.45)
    : Math.max(0.75, (aoeRadiusFeet / 5) * stepWorld);

  // Terrain-conforming AoE perimeter ring + semi-transparent ground fill disc
  buildTerrainConformingRing(scene, 'lw-spell-template-ring', endPos.x, endPos.z, radiusWorld, colorHex, isSingleOrMulti ? 0.042 : 0.055);
  if (!isSingleOrMulti) {
    buildTerrainConformingDisc(scene, 'lw-spell-template-disc', endPos.x, endPos.z, radiusWorld, colorHex);
  }
}

function buildStraightPulsingTube(
  scene: Scene,
  name: string,
  start: Vector3,
  end: Vector3,
  colorHex: string,
  radius: number,
): void {
  const outerTube = MeshBuilder.CreateTube(
    `${name}-outer`,
    { path: [start, end], radius, tessellation: 14, cap: Mesh.CAP_ALL },
    scene,
  );
  const outerMat = new StandardMaterial(`${name}-outer-mat`, scene);
  outerMat.disableLighting = true;
  outerMat.emissiveColor = Color3.FromHexString(colorHex);
  outerMat.alpha = 0.72;
  outerTube.material = outerMat;
  outerTube.renderingGroupId = 2;
  outerTube.alphaIndex = 14;
  outerTube.isPickable = false;

  const coreTube = MeshBuilder.CreateTube(
    `${name}-core`,
    { path: [start, end], radius: radius * 0.46, tessellation: 10, cap: Mesh.CAP_ALL },
    scene,
  );
  const coreMat = new StandardMaterial(`${name}-core-mat`, scene);
  coreMat.disableLighting = true;
  coreMat.emissiveColor = Color3.FromHexString(LOOM_GREEN_CORE_HEX);
  coreMat.alpha = 0.94;
  coreTube.material = coreMat;
  coreTube.renderingGroupId = 2;
  coreTube.alphaIndex = 15;
  coreTube.isPickable = false;

  // 3 staggered directional pulse beads streaming strictly from attacker (start) -> target (end)
  for (let b = 0; b < 3; b++) {
    const bead = MeshBuilder.CreateSphere(
      `${name}-pulse-bead-${b}`,
      { diameter: radius * (3.2 - b * 0.35), segments: 10 },
      scene,
    );
    bead.position.copyFrom(start);
    bead.metadata = { start: start.clone(), end: end.clone(), phaseOffset: b / 3 };
    const beadMat = new StandardMaterial(`${name}-bead-mat-${b}`, scene);
    beadMat.disableLighting = true;
    beadMat.emissiveColor = Color3.FromHexString(LOOM_GREEN_CORE_HEX);
    beadMat.alpha = 0.94;
    bead.material = beadMat;
    bead.renderingGroupId = 2;
    bead.alphaIndex = 16;
    bead.isPickable = false;
  }
}

function buildTerrainConformingRing(
  scene: Scene,
  name: string,
  cx: number,
  cz: number,
  radiusWorld: number,
  colorHex: string,
  tubeRadius: number,
): void {
  const segments = 56;
  const path: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const px = cx + Math.cos(angle) * radiusWorld;
    const pz = cz + Math.sin(angle) * radiusWorld;
    const py = TerrainMeshBuilder.sampleElevationAt(scene, px, pz) + 0.08;
    path.push(new Vector3(px, py, pz));
  }
  const ringTube = MeshBuilder.CreateTube(
    name,
    { path, radius: tubeRadius, tessellation: 10 },
    scene,
  );
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString(colorHex);
  mat.alpha = 0.88;
  ringTube.material = mat;
  ringTube.renderingGroupId = 2;
  ringTube.alphaIndex = 13;
  ringTube.isPickable = false;
}

function buildTerrainConformingDisc(
  scene: Scene,
  name: string,
  cx: number,
  cz: number,
  radiusWorld: number,
  colorHex: string,
): void {
  const rings = 5;
  const slices = 40;
  const positions: number[] = [];
  const indices: number[] = [];
  const centerY = TerrainMeshBuilder.sampleElevationAt(scene, cx, cz) + 0.055;
  positions.push(cx, centerY, cz);

  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * radiusWorld;
    for (let s = 0; s < slices; s++) {
      const angle = (s / slices) * Math.PI * 2;
      const px = cx + Math.cos(angle) * rad;
      const pz = cz + Math.sin(angle) * rad;
      const py = TerrainMeshBuilder.sampleElevationAt(scene, px, pz) + 0.055;
      positions.push(px, py, pz);
    }
  }

  for (let s = 0; s < slices; s++) {
    const next = (s + 1) % slices;
    indices.push(0, 1 + s, 1 + next);
  }
  for (let r = 1; r < rings; r++) {
    const ringStart = 1 + (r - 1) * slices;
    const nextRingStart = 1 + r * slices;
    for (let s = 0; s < slices; s++) {
      const next = (s + 1) % slices;
      indices.push(ringStart + s, nextRingStart + s, nextRingStart + next);
      indices.push(ringStart + s, nextRingStart + next, ringStart + next);
    }
  }

  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh);

  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString(colorHex);
  mat.backFaceCulling = false;
  mat.alpha = 0.22;
  mesh.material = mat;
  mesh.renderingGroupId = 2;
  mesh.alphaIndex = 12;
  mesh.isPickable = false;
}

export function animateBabylonSpellAndTetherPulse(scene: Scene, nowMs: number): void {
  const pulse = 0.65 + 0.35 * Math.sin(nowMs * 0.0065);
  const baseTravelT = (nowMs * 0.00095) % 1.0;

  for (const m of scene.meshes) {
    if (m.name.includes('-pulse-bead') && m.metadata?.start && m.metadata?.end) {
      const offset = typeof m.metadata.phaseOffset === 'number' ? m.metadata.phaseOffset : 0;
      const travelT = (baseTravelT + offset) % 1.0;
      Vector3.LerpToRef(m.metadata.start as Vector3, m.metadata.end as Vector3, travelT, m.position);
      if (m.material) m.material.alpha = 0.45 + 0.55 * Math.sin(travelT * Math.PI);
    } else if (m.name.startsWith('lw-target-tether-') && m.name.endsWith('-outer') && m.material) {
      m.material.alpha = 0.48 + 0.38 * pulse;
    } else if (m.name === 'lw-spell-template-disc' && m.material) {
      m.material.alpha = 0.16 + 0.1 * pulse;
    }
  }
}
