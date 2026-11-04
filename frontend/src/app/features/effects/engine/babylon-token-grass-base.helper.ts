import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  VertexData,
} from '@babylonjs/core';
import {
  VttTokenVm,
  getTokenBaseColorHex,
  getTokenRimColorHex,
} from './effect-timeline.contract';
import { resolve2dTokenUrlFromLibrary } from '../../arcane-screen/services/vtt-token-library-resolver';
import { attachVolumetricFogToMaterial } from './babylon-volumetric-fog.plugin';

const turfMaterialByScene = new WeakMap<Scene, StandardMaterial>();
const grassBladeMaterialByScene = new WeakMap<Scene, StandardMaterial>();
const grassTuftsTemplateByScene = new WeakMap<Scene, Mesh>();

function seededRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pushFacetedTriangle(
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
  ax: number, ay: number, az: number, ac: readonly [number, number, number],
  bx: number, by: number, bz: number, bc: readonly [number, number, number],
  cx: number, cy: number, cz: number, cc: readonly [number, number, number],
): void {
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }

  const baseIdx = positions.length / 3;
  positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  colors.push(
    ac[0], ac[1], ac[2], 1,
    bc[0], bc[1], bc[2], 1,
    cc[0], cc[1], cc[2], 1,
  );
  indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
}

function getOrCreateGrassTurfMaterial(scene: Scene): StandardMaterial {
  const existing = turfMaterialByScene.get(scene);
  if (existing) return existing;

  const size = 256;
  const dt = new DynamicTexture('lw-shared-token-turf-dt', { width: size, height: size }, scene, true);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  const rand = seededRand(90210);

  // 1. Rich organic soil & dark moss bed
  const bgGrad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  bgGrad.addColorStop(0, '#1c3b20');
  bgGrad.addColorStop(0.68, '#142c17');
  bgGrad.addColorStop(1, '#0b190d');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. Dappled moss & clover patches
  const mossPalette = ['#1f4724', '#26582c', '#2e6933', '#18361b', '#357539'];
  for (let i = 0; i < 65; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * (size * 0.44);
    const cx = size / 2 + Math.cos(angle) * dist;
    const cy = size / 2 + Math.sin(angle) * dist;
    const r = 6 + rand() * 16;
    const patchGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
    patchGrad.addColorStop(0, mossPalette[i % mossPalette.length]);
    patchGrad.addColorStop(1, 'rgba(20, 44, 23, 0)');
    ctx.fillStyle = patchGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3.Hundreds of layered micro-grass blades across the top disc
  const bladeColors = ['#29612e', '#347839', '#439145', '#55ab52', '#6ec460', '#84d96e'];
  ctx.lineCap = 'round';
  for (let i = 0; i < 360; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = Math.sqrt(rand()) * (size * 0.45);
    const x0 = size / 2 + Math.cos(angle) * dist;
    const y0 = size / 2 + Math.sin(angle) * dist;
    const bladeAngle = angle + (rand() - 0.5) * 1.4;
    const len = 5 + rand() * 11;
    const x1 = x0 + Math.cos(bladeAngle) * len;
    const y1 = y0 + Math.sin(bladeAngle) * len;
    ctx.strokeStyle = bladeColors[Math.floor(rand() * bladeColors.length)];
    ctx.lineWidth = 1.1 + rand() * 1.3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // 4. Shaded fieldstone rocks & pebbles embedded in the turf
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    const dist = (0.18 + rand() * 0.24) * size;
    const px = size / 2 + Math.cos(angle) * dist;
    const py = size / 2 + Math.sin(angle) * dist;
    const pr = 3.5 + rand() * 5.5;
    const rot = rand() * Math.PI;

    // Drop shadow
    ctx.fillStyle = 'rgba(4, 10, 6, 0.65)';
    ctx.beginPath();
    ctx.ellipse(px + 1.5, py + 1.5, pr * 1.25, pr * 0.9, rot, 0, Math.PI * 2);
    ctx.fill();

    // Base granite body
    ctx.fillStyle = i % 2 === 0 ? '#5c6660' : '#4b544f';
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.18, pr * 0.84, rot, 0, Math.PI * 2);
    ctx.fill();

    // Sunlit stone highlight facet
    ctx.fillStyle = '#8b9690';
    ctx.beginPath();
    ctx.ellipse(px - pr * 0.25, py - pr * 0.2, pr * 0.65, pr * 0.42, rot, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Subtle ambient occlusion vignette at the outer rim boundary
  const aoGrad = ctx.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size * 0.5);
  aoGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  aoGrad.addColorStop(1, 'rgba(4, 10, 6, 0.65)');
  ctx.fillStyle = aoGrad;
  ctx.fillRect(0, 0, size, size);

  dt.update(false);

  const mat = new StandardMaterial('lw-shared-token-turf-mat', scene);
  mat.maxSimultaneousLights = 8;
  mat.diffuseTexture = dt;
  mat.emissiveColor = new Color3(0.14, 0.26, 0.15);
  mat.specularColor = new Color3(0.04, 0.06, 0.04);
  mat.backFaceCulling = false;
  attachVolumetricFogToMaterial(mat);
  turfMaterialByScene.set(scene, mat);
  return mat;
}

function getOrCreateGrassBladeMaterial(scene: Scene): StandardMaterial {
  const existing = grassBladeMaterialByScene.get(scene);
  if (existing) return existing;

  const mat = new StandardMaterial('lw-shared-token-grass-blade-mat', scene);
  mat.maxSimultaneousLights = 8;
  mat.diffuseColor = Color3.White();
  mat.emissiveColor = new Color3(0.22, 0.26, 0.22);
  mat.specularColor = new Color3(0.08, 0.10, 0.08);
  mat.backFaceCulling = false;
  attachVolumetricFogToMaterial(mat);
  grassBladeMaterialByScene.set(scene, mat);
  return mat;
}

/**
 * Builds a single merged 3D grass-and-rock diorama template mesh per Scene (unit scale = 1.0)
 * containing curved, tapered 3D grass blades AND faceted 3D fieldstone boulders/pebbles.
 */
function getOrCreateGrassTuftsTemplate(scene: Scene): Mesh {
  const existing = grassTuftsTemplateByScene.get(scene);
  if (existing && !existing.isDisposed()) return existing;

  const rand = seededRand(424242);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // 1. 52 Curved 3D Grass Blades
  const bladeCount = 52;
  for (let b = 0; b < bladeCount; b++) {
    const isInner = b < 12;
    const radialFrac = isInner ? 0.08 + rand() * 0.14 : 0.20 + rand() * 0.15;
    const theta = (b / bladeCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const bx = Math.cos(theta) * radialFrac;
    const bz = Math.sin(theta) * radialFrac;

    const yaw = theta + (rand() - 0.5) * 1.6;
    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    const perpX = -dirZ;
    const perpZ = dirX;

    const height = isInner ? 0.045 + rand() * 0.035 : 0.068 + rand() * 0.058;
    const halfWidthRoot = 0.014 + rand() * 0.007;
    const halfWidthMid = halfWidthRoot * 0.62;
    const lean = (0.018 + rand() * 0.034) * (isInner ? 0.7 : 1.0);

    const baseVertexIdx = positions.length / 3;

    positions.push(
      bx - perpX * halfWidthRoot, 0, bz - perpZ * halfWidthRoot,
      bx + perpX * halfWidthRoot, 0, bz + perpZ * halfWidthRoot,
    );
    const midY = height * 0.54;
    const midShiftX = dirX * lean * 0.45;
    const midShiftZ = dirZ * lean * 0.45;
    positions.push(
      bx + midShiftX - perpX * halfWidthMid, midY, bz + midShiftZ - perpZ * halfWidthMid,
      bx + midShiftX + perpX * halfWidthMid, midY, bz + midShiftZ + perpZ * halfWidthMid,
    );
    const tipX = bx + dirX * lean;
    const tipZ = bz + dirZ * lean;
    positions.push(tipX, height, tipZ);

    for (let k = 0; k < 5; k++) {
      normals.push(0, 1, 0);
    }

    const tint = (rand() - 0.5) * 0.06;
    colors.push(
      0.08 + tint, 0.24 + tint, 0.10, 1,
      0.08 + tint, 0.24 + tint, 0.10, 1,
      0.20 + tint, 0.52 + tint, 0.23, 1,
      0.20 + tint, 0.52 + tint, 0.23, 1,
      0.45 + tint, 0.82 + tint, 0.34, 1,
    );

    indices.push(
      baseVertexIdx + 0, baseVertexIdx + 1, baseVertexIdx + 2,
      baseVertexIdx + 1, baseVertexIdx + 3, baseVertexIdx + 2,
      baseVertexIdx + 2, baseVertexIdx + 3, baseVertexIdx + 4,
    );
  }

  // 2. 10 Sculpted 3D Faceted Fieldstone Rocks & Companion Pebbles
  const rockClusters = [
    { angle: 0.35, dist: 0.27, radius: 0.056, height: 0.048, warm: false },
    { angle: 0.52, dist: 0.31, radius: 0.032, height: 0.028, warm: true },
    { angle: 1.65, dist: 0.28, radius: 0.052, height: 0.044, warm: true },
    { angle: 1.85, dist: 0.24, radius: 0.029, height: 0.025, warm: false },
    { angle: 2.75, dist: 0.29, radius: 0.062, height: 0.054, warm: false },
    { angle: 2.98, dist: 0.32, radius: 0.036, height: 0.031, warm: true },
    { angle: 3.95, dist: 0.26, radius: 0.048, height: 0.040, warm: false },
    { angle: 4.88, dist: 0.29, radius: 0.058, height: 0.050, warm: true },
    { angle: 5.10, dist: 0.24, radius: 0.033, height: 0.027, warm: false },
    { angle: 5.75, dist: 0.30, radius: 0.042, height: 0.035, warm: false },
  ];

  for (const rc of rockClusters) {
    const cx = Math.cos(rc.angle) * rc.dist;
    const cz = Math.sin(rc.angle) * rc.dist;
    const sides = 7;
    const botRing: { x: number; y: number; z: number }[] = [];
    const midRing: { x: number; y: number; z: number }[] = [];

    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2 + (rand() - 0.5) * 0.22;
      const rBot = rc.radius * (0.82 + rand() * 0.36);
      const rMid = rBot * (0.62 + rand() * 0.18);
      const stretchX = 1.0 + (rand() - 0.5) * 0.28;
      const stretchZ = 1.0 + (rand() - 0.5) * 0.28;
      botRing.push({
        x: cx + Math.cos(a) * rBot * stretchX,
        y: -0.002,
        z: cz + Math.sin(a) * rBot * stretchZ,
      });
      midRing.push({
        x: cx + Math.cos(a + 0.14) * rMid * stretchX,
        y: rc.height * (0.54 + rand() * 0.18),
        z: cz + Math.sin(a + 0.14) * rMid * stretchZ,
      });
    }

    const peakX = cx + (rand() - 0.5) * rc.radius * 0.28;
    const peakY = rc.height;
    const peakZ = cz + (rand() - 0.5) * rc.radius * 0.28;

    const cBot: readonly [number, number, number] = rc.warm
      ? [0.27, 0.26, 0.24]
      : [0.23, 0.27, 0.25];
    const cMid: readonly [number, number, number] = rc.warm
      ? [0.54, 0.52, 0.48]
      : [0.48, 0.53, 0.51];
    const cTop: readonly [number, number, number] = rc.warm
      ? [0.76, 0.74, 0.70]
      : [0.70, 0.75, 0.73];

    for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides;
      const b0 = botRing[s];
      const b1 = botRing[next];
      const m0 = midRing[s];
      const m1 = midRing[next];

      // Lower rock wall facets
      pushFacetedTriangle(
        positions, normals, colors, indices,
        b0.x, b0.y, b0.z, cBot,
        b1.x, b1.y, b1.z, cBot,
        m0.x, m0.y, m0.z, cMid,
      );
      pushFacetedTriangle(
        positions, normals, colors, indices,
        b1.x, b1.y, b1.z, cBot,
        m1.x, m1.y, m1.z, cMid,
        m0.x, m0.y, m0.z, cMid,
      );
      // Upper craggy cap facet
      pushFacetedTriangle(
        positions, normals, colors, indices,
        m0.x, m0.y, m0.z, cMid,
        m1.x, m1.y, m1.z, cMid,
        peakX, peakY, peakZ, cTop,
      );
    }
  }

  const template = new Mesh('lw-shared-token-grass-tufts-tpl', scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.colors = colors;
  vd.indices = indices;
  vd.applyToMesh(template, false);
  template.material = getOrCreateGrassBladeMaterial(scene);
  template.setEnabled(false);
  template.isPickable = false;

  grassTuftsTemplateByScene.set(scene, template);
  return template;
}

/**
 * Applies the faction collar material, 3D turf bed, 3D grass blades + faceted 3D rocks,
 * and outer faction rim (Green for Friendly/Party, Red for Enemies, Blue for NPCs) to a token base mesh.
 */
export function attachGrassBaseAndFactionRim(
  scene: Scene,
  token: VttTokenVm,
  baseMesh: Mesh,
  effectiveScale: number,
  baseHeight: number,
  isAttacker: boolean,
  isTargeted: boolean,
  include3dGrassBlades: boolean,
): void {
  const rimHex = getTokenRimColorHex(token);
  const collarHex = getTokenBaseColorHex(token);

  const baseMat = new StandardMaterial(`lw-tmat-${token.key}`, scene);
  baseMat.maxSimultaneousLights = 8;
  baseMat.diffuseColor = Color3.FromHexString(collarHex);
  baseMat.specularColor = new Color3(0.08, 0.08, 0.08);
  baseMat.specularPower = 24;
  baseMat.emissiveColor = Color3.FromHexString(rimHex).scale(isTargeted || isAttacker ? 0.34 : 0.22);
  attachVolumetricFogToMaterial(baseMat);
  baseMesh.material = baseMat;

  const rimMat = new StandardMaterial(`lw-mat-rim-${token.key}`, scene);
  rimMat.maxSimultaneousLights = 8;
  rimMat.diffuseColor = Color3.FromHexString(rimHex);
  rimMat.specularColor = new Color3(0.18, 0.18, 0.18);
  rimMat.emissiveColor = Color3.FromHexString(rimHex).scale(isTargeted || isAttacker ? 0.62 : 0.42);
  attachVolumetricFogToMaterial(rimMat);

  const upperRim = MeshBuilder.CreateTorus(
    `lw-token-puck-rim-${token.key}`,
    { diameter: 0.81 * effectiveScale, thickness: 0.052 * effectiveScale, tessellation: 40 },
    scene,
  );
  upperRim.parent = baseMesh;
  upperRim.position.set(0, baseHeight / 2 + 0.006, 0);
  upperRim.metadata = { tokenKey: token.key };
  upperRim.material = rimMat;

  const lowerRim = MeshBuilder.CreateTorus(
    `lw-token-lower-rim-${token.key}`,
    { diameter: 0.835 * effectiveScale, thickness: 0.036 * effectiveScale, tessellation: 36 },
    scene,
  );
  lowerRim.parent = baseMesh;
  lowerRim.position.set(0, -baseHeight / 2 + 0.012, 0);
  lowerRim.metadata = { tokenKey: token.key };
  lowerRim.material = rimMat;

  if (include3dGrassBlades) {
    const turfDisc = MeshBuilder.CreateDisc(
      `lw-token-turf-disc-${token.key}`,
      { radius: 0.385 * effectiveScale, tessellation: 36, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    turfDisc.parent = baseMesh;
    turfDisc.position.set(0, baseHeight / 2 + 0.003, 0);
    turfDisc.rotation.x = Math.PI / 2;
    turfDisc.metadata = { tokenKey: token.key };
    turfDisc.material = getOrCreateGrassTurfMaterial(scene);

    const grassTpl = getOrCreateGrassTuftsTemplate(scene);
    const grassClone = grassTpl.clone(`lw-token-grass-tufts-${token.key}`, baseMesh);
    if (grassClone) {
      grassClone.setEnabled(true);
      grassClone.position.set(0, baseHeight / 2 + 0.004, 0);
      grassClone.scaling.set(effectiveScale, effectiveScale, effectiveScale);
      grassClone.metadata = { tokenKey: token.key };
    }
  }
}

export function updateTokenRimMaterialHighlight(
  scene: Scene,
  token: VttTokenVm,
  isAttacker: boolean,
  isTargeted: boolean,
): void {
  const rimHex = getTokenRimColorHex(token);
  const rimMat = scene.getMaterialByName(`lw-mat-rim-${token.key}`) as StandardMaterial | null;
  if (rimMat) {
    rimMat.diffuseColor = Color3.FromHexString(rimHex);
    rimMat.emissiveColor = Color3.FromHexString(rimHex).scale(isTargeted || isAttacker ? 0.62 : 0.42);
  }
  const baseMat = scene.getMaterialByName(`lw-tmat-${token.key}`) as StandardMaterial | null;
  if (baseMat) {
    baseMat.emissiveColor = Color3.FromHexString(rimHex).scale(isTargeted || isAttacker ? 0.34 : 0.22);
  }
}

export function attachGrassPuckFace(
  scene: Scene,
  token: VttTokenVm,
  baseMesh: Mesh,
  effectiveScale: number,
  baseHeight: number,
  isAttacker: boolean,
  isTargeted: boolean,
  imageElementCache: Map<string, HTMLImageElement>,
): void {
  attachGrassBaseAndFactionRim(
    scene,
    token,
    baseMesh,
    effectiveScale,
    baseHeight,
    isAttacker,
    isTargeted,
    false,
  );

  const disc = MeshBuilder.CreateDisc(
    `lw-token-puck-disc-${token.key}`,
    { radius: 0.38 * effectiveScale, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  disc.parent = baseMesh;
  disc.position.set(0, baseHeight / 2 + 0.006, 0);
  disc.rotation.x = Math.PI / 2;
  disc.isPickable = true;
  disc.metadata = { tokenKey: token.key };

  const discMat = new StandardMaterial(`lw-mat-puck-${token.key}`, scene);
  discMat.backFaceCulling = false;
  discMat.disableLighting = true;
  discMat.emissiveColor = Color3.White();
  discMat.specularColor = Color3.Black();
  attachVolumetricFogToMaterial(discMat);

  const size = 256;
  const dt = new DynamicTexture(`lw-dt-puck-${token.key}`, { width: size, height: size }, scene, true);
  const factionRingHex = getTokenRimColorHex(token);
  const initials = (token.name || 'TK')
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const drawBackdropAndFrame = (ctx: CanvasRenderingContext2D, img?: HTMLImageElement) => {
    ctx.save();
    ctx.clearRect(0, 0, size, size);

    const turfGrad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
    turfGrad.addColorStop(0, '#1f4724');
    turfGrad.addColorStop(0.75, '#16351a');
    turfGrad.addColorStop(1, '#0d2110');
    ctx.fillStyle = turfGrad;
    ctx.fillRect(0, 0, size, size);

    const rand = seededRand(1337);
    const bladePalette = ['#2d6b32', '#3d8741', '#54a852', '#70c964'];
    ctx.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
      const a = (i / 140) * Math.PI * 2 + (rand() - 0.5) * 0.08;
      const r0 = size * (0.36 + rand() * 0.08);
      const r1 = r0 + 6 + rand() * 9;
      ctx.strokeStyle = bladePalette[i % bladePalette.length];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(size / 2 + Math.cos(a) * r0, size / 2 + Math.sin(a) * r0);
      ctx.lineTo(size / 2 + Math.cos(a + 0.08) * r1, size / 2 + Math.sin(a + 0.08) * r1);
      ctx.stroke();
    }

    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.39, 0, Math.PI * 2);
      ctx.clip();
      const cropDim = Math.min(img.naturalWidth, img.naturalHeight) * 0.86;
      const sx = (img.naturalWidth - cropDim) / 2;
      const sy = Math.max(0, (img.naturalHeight - cropDim) * 0.14);
      ctx.drawImage(img, sx, sy, cropDim, cropDim, 0, 0, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = '#f4efe2';
      ctx.font = 'bold 82px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, size / 2, size / 2 + 4);
    }

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.39, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(217, 183, 122, 0.78)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.475, 0, Math.PI * 2);
    ctx.strokeStyle = factionRingHex;
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.restore();
    dt.update(false);
  };

  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  const portraitUrl = resolve2dTokenUrlFromLibrary(token);
  const cachedImg = portraitUrl ? imageElementCache.get(portraitUrl) : undefined;
  if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
    drawBackdropAndFrame(ctx, cachedImg);
  } else {
    drawBackdropAndFrame(ctx);
    if (portraitUrl && typeof Image !== 'undefined') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageElementCache.set(portraitUrl, img);
        if (!disc.isDisposed()) drawBackdropAndFrame(ctx, img);
      };
      img.src = portraitUrl;
    }
  }

  discMat.diffuseTexture = dt;
  discMat.emissiveTexture = dt;
  disc.material = discMat;
}
