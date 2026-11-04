import {
  AbstractMesh,
  Color3,
  DynamicTexture,
  LinesMesh,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { getActiveCellStepWorld } from '../../arcane-screen/engine/vtt-los-and-grid.engine';
import { sampleTokenFootprintElevation } from './token-drag-controller';

interface MovementIndicatorState {
  tokenKey: string;
  startX: number;
  startZ: number;
  rimHex: string;
  effectiveScale: number;
  lastFeet: number;
  originRoot: TransformNode;
  badgePlane: Mesh;
  badgeTex: DynamicTexture;
  trailLine: LinesMesh | null;
  clearTimer: ReturnType<typeof setTimeout> | null;
}

const indicatorByScene = new WeakMap<Scene, MovementIndicatorState>();

export function computeGridMoveFeet(
  startX: number,
  startZ: number,
  currentX: number,
  currentZ: number,
): { feet: number; squares: number } {
  const stepWorld = Math.max(0.25, getActiveCellStepWorld());
  const dxSq = Math.round(Math.abs(currentX - startX) / stepWorld);
  const dzSq = Math.round(Math.abs(currentZ - startZ) / stepWorld);
  let squares = Math.max(dxSq, dzSq);
  if (squares === 0 && Math.hypot(currentX - startX, currentZ - startZ) >= stepWorld * 0.35) {
    squares = 1;
  }
  return {
    squares,
    feet: squares * 5,
  };
}

function resolveTokenVisualMeta(
  scene: Scene,
  tokenKey: string,
): { rimHex: string; effectiveScale: number; baseHeight: number; footprintRadius: number } {
  const tokenMesh = scene.getMeshByName(`lw-token-${tokenKey}`);
  const footprintRadius =
    typeof tokenMesh?.metadata?.footprintRadius === 'number'
      ? (tokenMesh.metadata.footprintRadius as number)
      : 0.344;
  const baseHeight =
    typeof tokenMesh?.metadata?.baseHeight === 'number'
      ? (tokenMesh.metadata.baseHeight as number)
      : 0.068;
  const effectiveScale = Math.max(0.5, footprintRadius / (0.82 * 0.42));

  const rimMat = scene.getMaterialByName(`lw-mat-rim-${tokenKey}`) as StandardMaterial | null;
  const rimHex = rimMat?.diffuseColor ? rimMat.diffuseColor.toHexString() : '#22c55e';
  return { rimHex, effectiveScale, baseHeight, footprintRadius };
}

function drawOverheadDistanceBadge(
  tex: DynamicTexture,
  feet: number,
  squares: number,
  rimHex: string,
): void {
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  const w = 512;
  const h = 192;
  ctx.clearRect(0, 0, w, h);

  ctx.save();
  // Pill box with bottom center pointer triangle
  const px = 56;
  const py = 16;
  const pw = w - 112;
  const ph = 132;
  const r = 28;

  ctx.beginPath();
  ctx.moveTo(px + r, py);
  ctx.lineTo(px + pw - r, py);
  ctx.quadraticCurveTo(px + pw, py, px + pw, py + r);
  ctx.lineTo(px + pw, py + ph - r);
  ctx.quadraticCurveTo(px + pw, py + ph, px + pw - r, py + ph);
  ctx.lineTo(w / 2 + 22, py + ph);
  ctx.lineTo(w / 2, py + ph + 28);
  ctx.lineTo(w / 2 - 22, py + ph);
  ctx.lineTo(px + r, py + ph);
  ctx.quadraticCurveTo(px, py + ph, px, py + ph - r);
  ctx.lineTo(px, py + r);
  ctx.quadraticCurveTo(px, py, px + r, py);
  ctx.closePath();

  const bgGrad = ctx.createLinearGradient(0, py, 0, py + ph);
  bgGrad.addColorStop(0, 'rgba(7, 22, 16, 0.95)');
  bgGrad.addColorStop(1, 'rgba(4, 12, 9, 0.96)');
  ctx.fillStyle = bgGrad;
  ctx.fill();

  ctx.lineWidth = 6;
  ctx.strokeStyle = rimHex;
  ctx.stroke();

  // Main feet readout (e.g. "15 FT")
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 64px Cinzel, Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${feet} FT`, w / 2, py + 52);

  // Subtitle showing 5-foot square count
  const sqLabel = squares === 1 ? '1 SQUARE (5 FT)' : `${squares} SQUARES (${feet} FT)`;
  ctx.fillStyle = rimHex;
  ctx.font = '700 24px Inter, system-ui, sans-serif';
  ctx.fillText(sqLabel, w / 2, py + 104);

  ctx.restore();
  tex.update(false);
}

export function clearTokenMovementIndicator(scene: Scene | null): void {
  if (!scene) return;
  const st = indicatorByScene.get(scene);
  if (!st) return;
  if (st.clearTimer !== null) {
    clearTimeout(st.clearTimer);
    st.clearTimer = null;
  }
  st.trailLine?.dispose();
  st.badgePlane.material?.dispose(false, true);
  st.badgePlane.dispose();
  st.originRoot.getChildMeshes().forEach((m) => {
    if (m.material && m.material.name.startsWith('lw-move-origin-')) {
      m.material.dispose(false, false);
    }
    m.dispose();
  });
  st.originRoot.dispose();
  indicatorByScene.delete(scene);
}

export function scheduleClearTokenMovementIndicator(
  scene: Scene | null,
  delayMs = 1500,
): void {
  if (!scene) return;
  const st = indicatorByScene.get(scene);
  if (!st) return;
  if (st.clearTimer !== null) {
    clearTimeout(st.clearTimer);
  }
  st.clearTimer = setTimeout(() => {
    clearTokenMovementIndicator(scene);
  }, delayMs);
}

export function updateTokenMovementIndicator(
  scene: Scene,
  tokenKey: string,
  startX: number,
  startZ: number,
  currentX: number,
  currentZ: number,
  liftOffsetY = 0,
): void {
  const { rimHex, effectiveScale, baseHeight, footprintRadius } = resolveTokenVisualMeta(scene, tokenKey);
  const { feet, squares } = computeGridMoveFeet(startX, startZ, currentX, currentZ);

  let st = indicatorByScene.get(scene);
  if (
    st &&
    (st.tokenKey !== tokenKey ||
      Math.abs(st.startX - startX) > 0.01 ||
      Math.abs(st.startZ - startZ) > 0.01)
  ) {
    clearTokenMovementIndicator(scene);
    st = undefined;
  }

  const originGroundY = sampleTokenFootprintElevation(scene, startX, startZ, footprintRadius);
  const currentGroundY = sampleTokenFootprintElevation(scene, currentX, currentZ, footprintRadius);

  if (!st) {
    const originRoot = new TransformNode(`lw-move-origin-root-${tokenKey}`, scene);
    originRoot.position.set(startX, originGroundY + baseHeight / 2 + 0.008, startZ);

    const baseDiameter = 0.82 * effectiveScale;
    const ghostMat = new StandardMaterial(`lw-move-origin-mat-${tokenKey}`, scene);
    ghostMat.disableLighting = true;
    ghostMat.emissiveColor = Color3.FromHexString(rimHex).scale(0.75);
    ghostMat.alpha = 0.52;

    const turfGhostMat = new StandardMaterial(`lw-move-origin-turf-mat-${tokenKey}`, scene);
    turfGhostMat.disableLighting = true;
    turfGhostMat.emissiveColor = Color3.FromHexString('#1e4d26');
    turfGhostMat.alpha = 0.48;

    // Ghost cylinder pedestal at "where the token was"
    const ghostCyl = MeshBuilder.CreateCylinder(
      `lw-move-origin-cyl-${tokenKey}`,
      {
        height: baseHeight,
        diameterTop: baseDiameter * 0.96,
        diameterBottom: baseDiameter * 1.02,
        tessellation: 32,
      },
      scene,
    );
    ghostCyl.parent = originRoot;
    ghostCyl.isPickable = false;
    ghostCyl.material = turfGhostMat;

    // Ghost outer faction rim rings
    const ghostUpperRim = MeshBuilder.CreateTorus(
      `lw-move-origin-rim-top-${tokenKey}`,
      { diameter: 0.81 * effectiveScale, thickness: 0.052 * effectiveScale, tessellation: 36 },
      scene,
    );
    ghostUpperRim.parent = originRoot;
    ghostUpperRim.position.set(0, baseHeight / 2 + 0.006, 0);
    ghostUpperRim.isPickable = false;
    ghostUpperRim.material = ghostMat;

    const ghostLowerRim = MeshBuilder.CreateTorus(
      `lw-move-origin-rim-bot-${tokenKey}`,
      { diameter: 0.835 * effectiveScale, thickness: 0.036 * effectiveScale, tessellation: 32 },
      scene,
    );
    ghostLowerRim.parent = originRoot;
    ghostLowerRim.position.set(0, -baseHeight / 2 + 0.012, 0);
    ghostLowerRim.isPickable = false;
    ghostLowerRim.material = ghostMat;

    // Clone the 3D grass + rock crown onto the ghost origin base if present
    const grassTpl = scene.getMeshByName('lw-shared-token-grass-tufts-tpl') as Mesh | null;
    if (grassTpl) {
      const ghostTufts = grassTpl.clone(`lw-move-origin-tufts-${tokenKey}`, originRoot);
      if (ghostTufts) {
        ghostTufts.setEnabled(true);
        ghostTufts.position.set(0, baseHeight / 2 + 0.004, 0);
        ghostTufts.scaling.set(effectiveScale, effectiveScale, effectiveScale);
        ghostTufts.isPickable = false;
        ghostTufts.visibility = 0.55;
      }
    }

    // Floating overhead distance badge above the token's head
    const badgeW = 1.35 * Math.max(0.85, Math.min(1.6, effectiveScale));
    const badgeH = badgeW * (192 / 512);
    const badgePlane = MeshBuilder.CreatePlane(
      `lw-move-overhead-badge-${tokenKey}`,
      { width: badgeW, height: badgeH },
      scene,
    );
    badgePlane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    badgePlane.renderingGroupId = 2;
    badgePlane.isPickable = false;

    const badgeTex = new DynamicTexture(
      `lw-move-overhead-dt-${tokenKey}`,
      { width: 512, height: 192 },
      scene,
      true,
    );
    badgeTex.hasAlpha = true;

    const badgeMat = new StandardMaterial(`lw-move-origin-badge-mat-${tokenKey}`, scene);
    badgeMat.disableLighting = true;
    badgeMat.diffuseTexture = badgeTex;
    badgeMat.emissiveTexture = badgeTex;
    badgeMat.useAlphaFromDiffuseTexture = true;
    badgeMat.emissiveColor = Color3.White();
    badgeMat.backFaceCulling = false;
    badgePlane.material = badgeMat;

    st = {
      tokenKey,
      startX,
      startZ,
      rimHex,
      effectiveScale,
      lastFeet: -1,
      originRoot,
      badgePlane,
      badgeTex,
      trailLine: null,
      clearTimer: null,
    };
    indicatorByScene.set(scene, st);
  }

  if (st.clearTimer !== null) {
    clearTimeout(st.clearTimer);
    st.clearTimer = null;
  }

  // Update overhead badge text when feet changed
  if (st.lastFeet !== feet) {
    st.lastFeet = feet;
    drawOverheadDistanceBadge(st.badgeTex, feet, squares, rimHex);
  }

  // Position overhead badge directly above the moving token's head
  const tokenTopOffset = 1.32 * effectiveScale;
  st.badgePlane.position.set(
    currentX,
    currentGroundY + baseHeight + tokenTopOffset + liftOffsetY,
    currentZ,
  );

  // Update terrain-hugging path line from the ghost origin base to the current token base
  st.trailLine?.dispose();
  st.trailLine = null;
  if (Math.hypot(currentX - startX, currentZ - startZ) > 0.08) {
    const samples = 12;
    const pts: Vector3[] = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const px = startX + (currentX - startX) * u;
      const pz = startZ + (currentZ - startZ) * u;
      const py = sampleTokenFootprintElevation(scene, px, pz, footprintRadius * 0.5) + 0.045;
      pts.push(new Vector3(px, py, pz));
    }
    const line = MeshBuilder.CreateLines(`lw-move-origin-trail-${tokenKey}`, { points: pts }, scene);
    line.color = Color3.FromHexString(rimHex);
    line.isPickable = false;
    line.renderingGroupId = 1;
    st.trailLine = line;
  }
}
