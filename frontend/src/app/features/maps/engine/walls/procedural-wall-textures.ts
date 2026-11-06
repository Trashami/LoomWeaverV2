import * as BABYLON from '@babylonjs/core';
import { ProceduralWallPattern, ProceduralWallStyleSpec } from './procedural-wall-catalog';

const cachedWallMaterials = new Map<string, BABYLON.PBRMaterial>();

function hash2d(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Deterministic 3D relief sampler in world/tile space (returns [-1 .. +1])
 * Used both for 2D normal/albedo synthesis and 3D vertex relief displacement on wall meshes.
 */
export function sampleProceduralWallRelief(
  pattern: ProceduralWallPattern,
  uMeters: number,
  vMeters: number,
): number {
  switch (pattern) {
    case 'dungeon_stone': {
      const row = Math.floor(vMeters / 0.36);
      const vLocal = (vMeters / 0.36) - row;
      const offset = (row % 2) * 0.42 + hash2d(row, 3.1) * 0.25;
      const col = Math.floor((uMeters / 0.68) + offset);
      const uLocal = ((uMeters / 0.68) + offset) - col;
      const edgeU = Math.min(uLocal, 1 - uLocal);
      const edgeV = Math.min(vLocal, 1 - vLocal);
      const mortar = Math.min(edgeU * 9.0, edgeV * 7.5);
      if (mortar < 0.48) return -0.95;
      const blockBulge = Math.min(1, mortar) * 0.65;
      const blockVar = (hash2d(col, row) - 0.5) * 0.55;
      const rockRipple = Math.sin(uMeters * 9.5 + row * 1.7) * Math.cos(vMeters * 11.2 + col) * 0.18;
      return Math.max(-1, Math.min(1, blockBulge + blockVar + rockRipple));
    }
    case 'castle_ashlar': {
      const row = Math.floor(vMeters / 0.42);
      const vLocal = (vMeters / 0.42) - row;
      const offset = (row % 2) * 0.5;
      const col = Math.floor((uMeters / 0.85) + offset);
      const uLocal = ((uMeters / 0.85) + offset) - col;
      const edge = Math.min(Math.min(uLocal, 1 - uLocal) * 14, Math.min(vLocal, 1 - vLocal) * 11);
      if (edge < 0.45) return -0.85;
      const chamfer = Math.min(1, edge * 0.85);
      const blockShift = (hash2d(col * 1.3, row * 2.1) - 0.5) * 0.28;
      return Math.max(-1, Math.min(1, chamfer * 0.6 + blockShift));
    }
    case 'red_brick': {
      const row = Math.floor(vMeters / 0.16);
      const vLocal = (vMeters / 0.16) - row;
      const offset = (row % 2) * 0.5;
      const col = Math.floor((uMeters / 0.34) + offset);
      const uLocal = ((uMeters / 0.34) + offset) - col;
      const edge = Math.min(Math.min(uLocal, 1 - uLocal) * 11, Math.min(vLocal, 1 - vLocal) * 8.5);
      if (edge < 0.45) return -0.9;
      return Math.min(1, 0.45 + (hash2d(col, row) - 0.5) * 0.4);
    }
    case 'cavern_rock': {
      const n1 = Math.sin(uMeters * 3.2 + Math.cos(vMeters * 2.7) * 1.4);
      const n2 = Math.cos(vMeters * 4.6 - Math.sin(uMeters * 3.9) * 1.2);
      const n3 = Math.sin((uMeters + vMeters) * 7.8) * 0.35;
      return Math.max(-1, Math.min(1, (n1 * 0.48 + n2 * 0.42 + n3)));
    }
    case 'elvish_marble': {
      const rib = Math.abs(Math.sin(uMeters * Math.PI / 1.1));
      const arch = Math.sin(vMeters * Math.PI / 1.45);
      const flute = rib < 0.14 ? 0.85 : (rib > 0.92 ? -0.55 : 0.25);
      return Math.max(-1, Math.min(1, flute + arch * 0.22));
    }
    case 'arcane_obsidian': {
      const col = Math.floor(uMeters / 1.1);
      const uLocal = (uMeters / 1.1) - col;
      const edgeU = Math.min(uLocal, 1 - uLocal);
      if (edgeU < 0.08) return -0.85;
      const runeChannel = Math.abs(Math.sin(uMeters * 6.5) * Math.cos(vMeters * 5.2));
      return runeChannel < 0.12 ? -0.75 : 0.55;
    }
    case 'industrial_iron': {
      const col = Math.floor(uMeters / 1.2);
      const row = Math.floor(vMeters / 1.2);
      const uLocal = (uMeters / 1.2) - col;
      const vLocal = (vMeters / 1.2) - row;
      const edge = Math.min(Math.min(uLocal, 1 - uLocal), Math.min(vLocal, 1 - vLocal));
      if (edge < 0.05) return 0.9; // Raised girder flange
      if (edge < 0.11) return 0.55; // Rivet strip
      return -0.25;
    }
    case 'nobility_manor': {
      const vCycle = vMeters % 2.8;
      if (vCycle < 1.05) {
        const uLocal = (uMeters / 0.65) - Math.floor(uMeters / 0.65);
        const edgeU = Math.min(uLocal, 1 - uLocal);
        if (edgeU < 0.12 || vCycle > 0.92) return 0.75; // Raised wainscoting rail/stile
        if (edgeU < 0.20) return -0.45; // Recessed bevel
        return 0.25;
      }
      return 0.05;
    }
    case 'wood_home': {
      const col = Math.floor(uMeters / 1.3);
      const uLocal = (uMeters / 1.3) - col;
      const vCycle = vMeters % 2.8;
      const isPost = uLocal < 0.11 || uLocal > 0.89;
      const isBeam = (vCycle > 1.18 && vCycle < 1.34) || vCycle < 0.16 || vCycle > 2.62;
      const isBrace = Math.abs(uLocal - (vCycle / 2.8)) < 0.08;
      if (isPost || isBeam || isBrace) return 0.82; // Proud oak timber beams
      return -0.22; // Recessed plaster panels
    }
    case 'shack_wood': {
      const row = Math.floor(vMeters / 0.24);
      const vLocal = (vMeters / 0.24) - row;
      if (vLocal < 0.09) return -0.9; // Deep plank gap
      const lap = (1 - vLocal) * 0.55; // Clapboard overlap tilt
      const post = ((uMeters % 1.4) < 0.12) ? 0.45 : 0;
      return Math.max(-1, Math.min(1, lap + post + (hash2d(row, Math.floor(uMeters / 1.4)) - 0.5) * 0.25));
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.max(0, Math.min(255, Math.round(a + (b - a) * t)));
}

export function getOrCreateProceduralWallMaterial(
  scene: BABYLON.Scene,
  style: ProceduralWallStyleSpec,
  customTintHex?: string,
  normalStrength = 1.35,
): BABYLON.PBRMaterial {
  const cacheKey = `${scene.uid}|${style.id}|${customTintHex || ''}|${normalStrength.toFixed(2)}`;
  const existing = cachedWallMaterials.get(cacheKey);
  if (existing && existing.getScene() === scene) return existing;

  const size = 256;
  const albedoTex = new BABYLON.DynamicTexture(`procWallAlbedo_${style.id}`, size, scene, true);
  const bumpTex = new BABYLON.DynamicTexture(`procWallBump_${style.id}`, size, scene, true);

  const aCtx = albedoTex.getContext();
  const bCtx = bumpTex.getContext();
  const aImg = aCtx.getImageData(0, 0, size, size);
  const bImg = bCtx.getImageData(0, 0, size, size);

  const [rBase, gBase, bBase] = hexToRgb(style.baseColorHex);
  const [rSec, gSec, bSec] = hexToRgb(style.secondaryColorHex);
  const [rMor, gMor, bMor] = hexToRgb(style.mortarColorHex);
  const [rAcc, gAcc, bAcc] = hexToRgb(style.accentColorHex);

  const tileW = style.tileWidthMeters;
  const tileH = style.tileHeightMeters;
  const heights = new Float32Array(size * size);

  for (let py = 0; py < size; py++) {
    const vMeters = (py / size) * tileH;
    for (let px = 0; px < size; px++) {
      const uMeters = (px / size) * tileW;
      const h = sampleProceduralWallRelief(style.pattern, uMeters, vMeters);
      const grain = (hash2d(px * 0.7, py * 0.7) - 0.5) * 0.18;
      const totalH = Math.max(-1, Math.min(1, h + grain));
      heights[py * size + px] = totalH;

      const idx = (py * size + px) * 4;
      let r = rBase;
      let g = gBase;
      let b = bBase;

      if (h < -0.55) {
        // Mortar, recessed groove, or rune channel
        const isRune = style.pattern === 'arcane_obsidian' && h > -0.8;
        r = isRune ? rAcc : rMor;
        g = isRune ? gAcc : gMor;
        b = isRune ? bAcc : bMor;
      } else if (style.pattern === 'wood_home' && h < 0) {
        // Warm plaster panel between dark oak timbers
        const plasterVar = grain * 35;
        r = Math.min(255, Math.max(0, rBase + plasterVar));
        g = Math.min(255, Math.max(0, gBase + plasterVar));
        b = Math.min(255, Math.max(0, bBase + plasterVar));
      } else if (style.pattern === 'wood_home' && h > 0.4) {
        // Dark timber beams
        r = rMor;
        g = gMor;
        b = bMor;
      } else {
        const t = Math.max(0, Math.min(1, (totalH + 0.5) * 0.75));
        r = lerpChannel(rSec, rBase, t);
        g = lerpChannel(gSec, gBase, t);
        b = lerpChannel(bSec, bBase, t);
        if (h > 0.68) {
          r = lerpChannel(r, rAcc, 0.35);
          g = lerpChannel(g, gAcc, 0.35);
          b = lerpChannel(b, bAcc, 0.35);
        }
      }

      aImg.data[idx] = r;
      aImg.data[idx + 1] = g;
      aImg.data[idx + 2] = b;
      aImg.data[idx + 3] = 255;
    }
  }

  // Convert height field to tangent-space normal map in bumpImg
  for (let py = 0; py < size; py++) {
    const pyUp = (py - 1 + size) % size;
    const pyDn = (py + 1) % size;
    for (let px = 0; px < size; px++) {
      const pxLt = (px - 1 + size) % size;
      const pxRt = (px + 1) % size;
      const dX = (heights[py * size + pxRt] - heights[py * size + pxLt]) * 2.6;
      const dY = (heights[pyDn * size + px] - heights[pyUp * size + px]) * 2.6;
      const invLen = 1 / Math.hypot(dX, dY, 1);
      const nx = (-dX * invLen * 0.5 + 0.5) * 255;
      const ny = (-dY * invLen * 0.5 + 0.5) * 255;
      const nz = (invLen * 0.5 + 0.5) * 255;
      const idx = (py * size + px) * 4;
      bImg.data[idx] = nx;
      bImg.data[idx + 1] = ny;
      bImg.data[idx + 2] = nz;
      bImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  albedoTex.update();
  bumpTex.update();

  albedoTex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  albedoTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  bumpTex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
  bumpTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;

  const mat = new BABYLON.PBRMaterial(`procWallMat_${style.id}`, scene);
  mat.albedoTexture = albedoTex;
  mat.bumpTexture = bumpTex;
  mat.bumpTexture.level = normalStrength;
  mat.roughness = style.roughness;
  mat.metallic = style.metallic;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  if (customTintHex && customTintHex.toLowerCase() !== '#ffffff') {
    mat.albedoColor = BABYLON.Color3.FromHexString(customTintHex);
  } else {
    mat.albedoColor = new BABYLON.Color3(1, 1, 1);
  }
  if (style.emissiveHex) {
    mat.emissiveColor = BABYLON.Color3.FromHexString(style.emissiveHex).scale(0.32);
  }

  cachedWallMaterials.set(cacheKey, mat);
  return mat;
}

export function clearProceduralWallMaterialCache(): void {
  cachedWallMaterials.clear();
}
