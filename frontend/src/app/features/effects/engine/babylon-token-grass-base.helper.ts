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

  // 3. Small fieldstone pebbles nestled in the turf
  for (let i = 0; i < 12; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = (0.22 + rand() * 0.22) * size;
    const px = size / 2 + Math.cos(angle) * dist;
    const py = size / 2 + Math.sin(angle) * dist;
    const pr = 2.2 + rand() * 3.2;
    ctx.fillStyle = i % 2 === 0 ? '#4a554e' : '#37423b';
    ctx.beginPath();
    ctx.ellipse(px, py, pr * 1.2, pr * 0.85, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Hundreds of layered micro-grass blades across the top disc
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
  mat.emissiveColor = new Color3(0.18, 0.36, 0.18);
  mat.specularColor = new Color3(0.05, 0.09, 0.05);
  mat.backFaceCulling = false;
  attachVolumetricFogToMaterial(mat);
  grassBladeMaterialByScene.set(scene, mat);
  return mat;
}

/**
 * Builds a single merged 3D grass-blade crown template mesh per Scene (unit scale = 1.0)
 * containing curved, tapered 3D grass blades with root-to-tip vertex color gradients.
 */
function getOrCreateGrassTuftsTemplate(scene: Scene): Mesh {
  const existing = grassTuftsTemplateByScene.get(scene);
  if (existing && !existing.isDisposed()) return existing;

  const rand = seededRand(424242);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const bladeCount = 48;
  for (let b = 0; b < bladeCount; b++) {
    // Place most tufts in a lush ring inside the faction rim, plus a few shorter inner tufts
    const isInner = b < 10;
    const radialFrac = isInner ? 0.08 + rand() * 0.14 : 0.21 + rand() * 0.145;
    const theta = (b / bladeCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const bx = Math.cos(theta) * radialFrac;
    const bz = Math.sin(theta) * radialFrac;

    const yaw = theta + (rand() - 0.5) * 1.6;
    const dirX = Math.cos(yaw);
    const dirZ = Math.sin(yaw);
    const perpX = -dirZ;
    const perpZ = dirX;

    const height = isInner ? 0.045 + rand() * 0.035 : 0.065 + rand() * 0.055;
    const halfWidthRoot = 0.014 + rand() * 0.007;
    const halfWidthMid = halfWidthRoot * 0.62;
    const lean = (0.018 + rand() * 0.032) * (isInner ? 0.7 : 1.0);

    const baseVertexIdx = positions.length / 3;

    // v0, v1: Root left & right (dark forest moss)
    positions.push(
      bx - perpX * halfWidthRoot, 0, bz - perpZ * halfWidthRoot,
      bx + perpX * halfWidthRoot, 0, bz + perpZ * halfWidthRoot,
    );
    // v2, v3: Mid-blade left & right (curved outward, vibrant meadow green)
    const midY = height * 0.54;
    const midShiftX = dirX * lean * 0.45;
    const midShiftZ = dirZ * lean * 0.45;
    positions.push(
      bx + midShiftX - perpX * halfWidthMid, midY, bz + midShiftZ - perpZ * halfWidthMid,
      bx + midShiftX + perpX * halfWidthMid, midY, bz + midShiftZ + perpZ * halfWidthMid,
    );
    // v4: Sharp curved blade tip (sunlit spring green)
    const tipX = bx + dirX * lean;
    const tipZ = bz + dirZ * lean;
    positions.push(tipX, height, tipZ);

    for (let k = 0; k < 5; k++) {
      normals.push(0, 1, 0);
    }

    const tint = (rand() - 0.5) * 0.06;
    // Root colors (v0, v1)
    colors.push(
      0.08 + tint, 0.24 + tint, 0.10, 1,
      0.08 + tint, 0.24 + tint, 0.10, 1,
    );
    // Mid colors (v2, v3)
    colors.push(
      0.20 + tint, 0.52 + tint, 0.23, 1,
      0.20 + tint, 0.52 + tint, 0.23, 1,
    );
    // Tip color (v4)
    colors.push(0.45 + tint, 0.82 + tint, 0.34, 1);

    // Lower quad (2 triangles) + upper tapered tip triangle
    indices.push(
      baseVertexIdx + 0, baseVertexIdx + 1, baseVertexIdx + 2,
      baseVertexIdx + 1, baseVertexIdx + 3, baseVertexIdx + 2,
      baseVertexIdx + 2, baseVertexIdx + 3, baseVertexIdx + 4,
    );
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
 * Applies the faction collar material, 3D turf bed, 3D grass blades, and outer faction rim
 * (Green for Friendly/Party, Red for Enemies, Blue for NPCs) to a token base mesh.
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

  // 1. Outer cylinder wall uses the deep faction collar color (Green / Red / Blue)
  const baseMat = new StandardMaterial(`lw-tmat-${token.key}`, scene);
  baseMat.maxSimultaneousLights = 8;
  baseMat.diffuseColor = Color3.FromHexString(collarHex);
  baseMat.specularColor = new Color3(0.08, 0.08, 0.08);
  baseMat.specularPower = 24;
  baseMat.emissiveColor = Color3.FromHexString(rimHex).scale(isTargeted || isAttacker ? 0.34 : 0.22);
  attachVolumetricFogToMaterial(baseMat);
  baseMesh.material = baseMat;

  // 2. Sculpted upper & lower faction rim rings around the outside of the base
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

  // 3. Top grassy soil bed disc inside the faction rim + 3D grass blades
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

    // Grassy turf ring backdrop around the portrait
    const turfGrad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
    turfGrad.addColorStop(0, '#1f4724');
    turfGrad.addColorStop(0.75, '#16351a');
    turfGrad.addColorStop(1, '#0d2110');
    ctx.fillStyle = turfGrad;
    ctx.fillRect(0, 0, size, size);

    // Paint radial grass blades along the turf border ring
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

    // Inner stone/gold bezel around portrait
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.39, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(217, 183, 122, 0.78)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Outer faction rim (Green = Friendly, Red = Enemy, Blue = NPC)
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
