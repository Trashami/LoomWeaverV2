import * as BABYLON from '@babylonjs/core';
import { WallOpeningNode, WallSegmentNode } from '../map-scene-contract';
import {
  ProceduralDoorStyleSpec,
  ProceduralWallStyleSpec,
  resolveProceduralDoorStyle,
} from './procedural-wall-catalog';
import {
  buildProceduralDoorSidePosts,
  buildSubdividedReliefPostBox,
  getOrCreateWallTrimMaterial,
} from './procedural-wall-extruder';
import { getOrCreateProceduralWallMaterial } from './procedural-wall-textures';

export interface DoorCutoutPlacement {
  op: WallOpeningNode;
  centerDist: number;
  startDist: number;
  endDist: number;
  width: number;
  height: number;
  wallHeight?: number;
  sillY: number;
  doorX: number;
  doorZ: number;
  doorGroundY: number;
  ux: number;
  uz: number;
  angleY: number;
}

type DoorSurfaceTextureKind = 'wood' | 'stone' | 'metal';

const doorMatCache = new Map<string, BABYLON.PBRMaterial>();

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '#5a4230').replace('#', '');
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return [90, 66, 48];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Generates a procedural PBR material with synthesized Albedo + Tangent-Space Normal Map
 * for wood planks, dressed stone casing, or forged iron/bronze hardware.
 */
function getDoorPbrMat(
  scene: BABYLON.Scene,
  key: string,
  hex: string,
  roughness: number,
  metallic: number,
  surfaceKind: DoorSurfaceTextureKind = 'wood',
  emissiveHex?: string,
): BABYLON.PBRMaterial {
  const fullKey = `${scene.uid}|doorTex|${key}|${hex}|${surfaceKind}|${emissiveHex || ''}`;
  const cached = doorMatCache.get(fullKey);
  if (cached) return cached;

  const size = 128;
  const albedoTex = new BABYLON.DynamicTexture(`procDoorAlbedo_${key}`, size, scene, true);
  const bumpTex = new BABYLON.DynamicTexture(`procDoorBump_${key}`, size, scene, true);
  const aCtx = albedoTex.getContext();
  const bCtx = bumpTex.getContext();
  const aImg = aCtx.getImageData(0, 0, size, size);
  const bImg = bCtx.getImageData(0, 0, size, size);

  const [rBase, gBase, bBase] = hexToRgbTuple(hex);
  const heights = new Float32Array(size * size);

  for (let py = 0; py < size; py++) {
    const v = py / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      let h = 0;
      let shade = 0;

      if (surfaceKind === 'wood') {
        const plankCount = 6;
        const plankPos = u * plankCount;
        const plankIdx = Math.floor(plankPos);
        const plankLocal = plankPos - plankIdx;
        const edgeDist = Math.min(plankLocal, 1 - plankLocal);
        const seam = edgeDist < 0.065 ? -0.9 : Math.min(1, edgeDist * 6.5) * 0.35;
        const grain =
          Math.sin(u * 95 + Math.sin(v * 18 + plankIdx * 1.7) * 2.2) * 0.22 +
          Math.cos(v * 42 + plankIdx * 3.1) * 0.1;
        const plankTint = (hash2(plankIdx, 4.2) - 0.5) * 0.28;
        h = seam + grain;
        shade = seam < -0.4 ? -44 : (grain + plankTint) * 34;
      } else if (surfaceKind === 'stone') {
        const row = Math.floor(v * 4);
        const vLoc = v * 4 - row;
        const colPos = u * 3 + (row % 2) * 0.5;
        const col = Math.floor(colPos);
        const uLoc = colPos - col;
        const edge = Math.min(Math.min(uLoc, 1 - uLoc) * 9, Math.min(vLoc, 1 - vLoc) * 8);
        const stoneNoise = (hash2(px * 0.35, py * 0.35) - 0.5) * 0.35;
        h = (edge < 0.42 ? -0.85 : 0.4) + stoneNoise;
        shade = edge < 0.42 ? -36 : stoneNoise * 32 + (hash2(col, row) - 0.5) * 18;
      } else {
        const peen =
          Math.sin(u * 36) * Math.cos(v * 36) * 0.25 +
          (hash2(px * 0.5, py * 0.5) - 0.5) * 0.3;
        h = peen;
        shade = peen * 28;
      }

      heights[py * size + px] = h;
      const idx = (py * size + px) * 4;
      aImg.data[idx] = clampByte(rBase + shade);
      aImg.data[idx + 1] = clampByte(gBase + shade);
      aImg.data[idx + 2] = clampByte(bBase + shade);
      aImg.data[idx + 3] = 255;
    }
  }

  for (let py = 0; py < size; py++) {
    const pyUp = (py - 1 + size) % size;
    const pyDn = (py + 1) % size;
    for (let px = 0; px < size; px++) {
      const pxLt = (px - 1 + size) % size;
      const pxRt = (px + 1) % size;
      const dX = (heights[py * size + pxRt] - heights[py * size + pxLt]) * 2.2;
      const dY = (heights[pyDn * size + px] - heights[pyUp * size + px]) * 2.2;
      const invLen = 1 / Math.hypot(dX, dY, 1);
      const idx = (py * size + px) * 4;
      bImg.data[idx] = (-dX * invLen * 0.5 + 0.5) * 255;
      bImg.data[idx + 1] = (-dY * invLen * 0.5 + 0.5) * 255;
      bImg.data[idx + 2] = (invLen * 0.5 + 0.5) * 255;
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

  const mat = new BABYLON.PBRMaterial(`procDoorMat_${key}`, scene);
  mat.albedoTexture = albedoTex;
  mat.bumpTexture = bumpTex;
  mat.bumpTexture.level = 1.25;
  mat.roughness = roughness;
  mat.metallic = metallic;
  if (emissiveHex) {
    mat.emissiveColor = BABYLON.Color3.FromHexString(emissiveHex).scale(0.55);
  }
  doorMatCache.set(fullKey, mat);
  return mat;
}

/**
 * Builds the complete wall-integrated 3D Door Assembly:
 * - Left & Right 3D Relief Door Side Post Blocks (quoin blocks / buttress piers / jamb posts)
 *   that wrap the cut wall ends just like wall corner posts,
 * - Full-depth recessed doorway reveal & bevelled stone threshold sill,
 * - Subdivision-relieved lintel header block, corbels, and voussoir arch stones + keystone,
 * - Textured 3D hinged door leaf (or twin double-door leaves) with stiles, rails, and hardware on both faces.
 */
export function buildProceduralDoorAssembly(
  scene: BABYLON.Scene,
  wall: WallSegmentNode,
  cut: DoorCutoutPlacement,
  wallThickness: number,
  wallStyle: ProceduralWallStyleSpec,
  includeProceduralLeaf: boolean,
  customWallMat?: BABYLON.Material | null,
): BABYLON.Mesh[] {
  const created: BABYLON.Mesh[] = [];
  const { op, width, height, sillY, doorX, doorZ, doorGroundY, angleY } = cut;
  const wallHeight = cut.wallHeight ?? Math.max(height + 0.2, wall.heightMeters);
  const doorStyle: ProceduralDoorStyleSpec = resolveProceduralDoorStyle(op);

  // 1. Build 3D Door Side Post Blocks (left & right quoin/pier blocks wrapping the cut wall ends)
  if (op.hasSidePosts !== false) {
    const sidePostMeshes = buildProceduralDoorSidePosts(scene, {
      wall,
      op,
      doorX,
      doorZ,
      doorGroundY: doorGroundY + sillY,
      doorWidth: width,
      doorHeight: height,
      wallHeight,
      wallThickness,
      angleY,
      style: wallStyle,
      customWallMat,
    });
    created.push(...sidePostMeshes);
  }

  const root = new BABYLON.TransformNode(`lw-door-node-root-${wall.id}-${op.id}`, scene);
  root.position.set(doorX, doorGroundY + sillY, doorZ);
  root.rotation.y = angleY;

  const postScale = Math.max(0.6, Math.min(1.8, op.sidePostScale ?? 1.0));
  const sidePostWidth =
    op.hasSidePosts === false
      ? Math.min(0.18, Math.max(0.12, width * 0.1))
      : Math.max(0.28, wallThickness * 0.92 * postScale);

  const frameDepth = Math.max(0.32, wallThickness * 1.26);
  const innerJambWidth = Math.min(0.16, Math.max(0.1, width * 0.08));

  const wallBlockMat =
    customWallMat ??
    getOrCreateProceduralWallMaterial(
      scene,
      wallStyle,
      wall.colorHex || wall.tintColorHex,
      wall.wallNormalStrength ?? 1.35,
    );
  const wallTrimMat = getOrCreateWallTrimMaterial(scene, wallStyle);

  const frameMat = getDoorPbrMat(
    scene,
    `${doorStyle.id}_frame`,
    doorStyle.frameColorHex || wallStyle.plinthColorHex,
    0.74,
    doorStyle.style === 'industrial' ? 0.58 : 0.1,
    doorStyle.style === 'wood-home' || doorStyle.style === 'shack' ? 'wood' : 'stone',
  );
  const leafSurfaceKind: DoorSurfaceTextureKind =
    doorStyle.style === 'industrial' || doorStyle.style === 'bars'
      ? 'metal'
      : doorStyle.style === 'arcane'
        ? 'stone'
        : 'wood';
  const leafMat = getDoorPbrMat(
    scene,
    `${doorStyle.id}_leaf`,
    op.tintColorHex || doorStyle.leafColorHex,
    doorStyle.roughness,
    doorStyle.metallic,
    leafSurfaceKind,
  );
  const hardwareMat = getDoorPbrMat(
    scene,
    `${doorStyle.id}_hw`,
    doorStyle.hardwareColorHex,
    0.36,
    0.82,
    'metal',
    doorStyle.emissiveHex,
  );

  const tagMesh = (m: BABYLON.Mesh) => {
    m.isPickable = true;
    m.checkCollisions = !op.isOpen;
    m.receiveShadows = true;
    m.metadata = {
      lwNodeName: `lw-door-${op.id}`,
      lwKind: 'door' as const,
      lwEntityId: op.id,
      lwWallId: wall.id,
      wallId: wall.id,
      openingId: op.id,
      openingKind: op.kind || op.type,
      doorStyle: doorStyle.style,
    };
    created.push(m);
  };

  // 2. Inner Recessed Jamb Reveal Liners (line the doorway cutout inside the wall)
  const clearInnerSpan = Math.max(0.55, width - sidePostWidth * 0.72);
  for (const side of [-1, 1] as const) {
    const jamb = BABYLON.MeshBuilder.CreateBox(
      `lw-door-jamb-${side}-${op.id}`,
      { width: innerJambWidth, height: height, depth: frameDepth * 0.96 },
      scene,
    );
    jamb.parent = root;
    jamb.position.set(side * (clearInnerSpan * 0.5 - innerJambWidth * 0.25), height * 0.5, 0);
    jamb.material = frameMat;
    tagMesh(jamb);
  }

  // 3. Bevelled Stone/Timber Threshold Sill Step
  const threshold = BABYLON.MeshBuilder.CreateBox(
    `lw-door-threshold-${op.id}`,
    { width: width + sidePostWidth * 0.45, height: 0.08, depth: frameDepth * 1.12 },
    scene,
  );
  threshold.parent = root;
  threshold.position.set(0, 0.04, 0);
  threshold.material = wallTrimMat;
  tagMesh(threshold);

  // 4. Subdivided 3D Relief Lintel Header Beam spanning between the Left & Right Door Side Blocks
  const headerH = 0.22;
  const headerWidth = width + sidePostWidth * 0.65;
  const header = buildSubdividedReliefPostBox(
    `lw-door-header-${op.id}`,
    scene,
    headerWidth,
    headerH,
    frameDepth * 1.1,
    5.4,
    wallStyle,
    wall.wallDisplacementScale ?? 1.0,
  );
  header.parent = root;
  header.position.set(0, height - headerH * 0.35, 0);
  header.material = wallBlockMat;
  tagMesh(header);

  // Moulded Lintel Trim Ledge above the header block
  const headerCornice = BABYLON.MeshBuilder.CreateBox(
    `lw-door-header-cornice-${op.id}`,
    { width: headerWidth + 0.08, height: 0.08, depth: frameDepth * 1.18 },
    scene,
  );
  headerCornice.parent = root;
  headerCornice.position.set(0, height + 0.03, 0);
  headerCornice.material = wallTrimMat;
  tagMesh(headerCornice);

  if (doorStyle.hasArchTop) {
    // Segmented Voussoir Arch Stones + Proud Central Keystone
    for (const vSide of [-1, 1] as const) {
      const voussoir = BABYLON.MeshBuilder.CreateBox(
        `lw-door-voussoir-${op.id}-${vSide}`,
        { width: clearInnerSpan * 0.26, height: headerH * 1.18, depth: frameDepth * 1.14 },
        scene,
      );
      voussoir.parent = root;
      voussoir.position.set(vSide * (clearInnerSpan * 0.24), height - headerH * 0.32, 0);
      voussoir.rotation.z = -vSide * 0.14;
      voussoir.material = wallTrimMat;
      tagMesh(voussoir);
    }

    const keystone = BABYLON.MeshBuilder.CreateBox(
      `lw-door-keystone-${op.id}`,
      { width: 0.24, height: headerH * 1.5, depth: frameDepth * 1.22 },
      scene,
    );
    keystone.parent = root;
    keystone.position.set(0, height - headerH * 0.18, 0);
    keystone.material = doorStyle.style === 'arcane' || doorStyle.style === 'elvish' ? hardwareMat : wallTrimMat;
    tagMesh(keystone);
  }

  if (!includeProceduralLeaf || doorStyle.style === 'archway') {
    return created;
  }

  const clearWidth = Math.max(0.48, clearInnerSpan - innerJambWidth * 1.2);
  const clearHeight = Math.max(0.75, height - headerH * 0.72);
  const leafDepth = Math.max(0.09, Math.min(0.16, wallThickness * 0.38));

  // Portcullis / Iron Bars style
  if (doorStyle.style === 'bars') {
    const barCount = Math.max(4, Math.floor(clearWidth / 0.16));
    const liftY = op.isOpen ? clearHeight * 0.72 : 0;
    for (let i = 0; i < barCount; i++) {
      const t = (i + 0.5) / barCount - 0.5;
      const bar = BABYLON.MeshBuilder.CreateCylinder(
        `lw-door-bar-${op.id}-${i}`,
        { diameter: 0.042, height: clearHeight, tessellation: 8 },
        scene,
      );
      bar.parent = root;
      bar.position.set(t * clearWidth, clearHeight * 0.5 + liftY, 0);
      bar.material = hardwareMat;
      tagMesh(bar);
    }
    for (const railRatio of [0.22, 0.5, 0.78]) {
      const rail = BABYLON.MeshBuilder.CreateBox(
        `lw-door-bar-rail-${op.id}-${railRatio}`,
        { width: clearWidth, height: 0.055, depth: 0.075 },
        scene,
      );
      rail.parent = root;
      rail.position.set(0, clearHeight * railRatio + liftY, 0);
      rail.material = hardwareMat;
      tagMesh(rail);
    }
    return created;
  }

  const isDoubleDoor = op.type === 'double_door' || width >= 2.35;
  const leafCount = isDoubleDoor ? 2 : 1;
  const singleLeafWidth = isDoubleDoor ? clearWidth * 0.495 : clearWidth;
  const leafH = clearHeight - 0.07;

  for (let leafIdx = 0; leafIdx < leafCount; leafIdx++) {
    const hingeSide: -1 | 1 = leafIdx === 0 ? -1 : 1;
    const dir = -hingeSide; // +1 for left-hinged leaf, -1 for right-hinged leaf

    const hingePivot = new BABYLON.TransformNode(`lw-door-hinge-${op.id}-${leafIdx}`, scene);
    hingePivot.parent = root;
    hingePivot.position.set(hingeSide * (clearWidth * 0.5), 0.065, 0);
    hingePivot.rotation.y = op.isOpen ? hingeSide * Math.PI * 0.46 : 0;

    // Iron Hinge Barrels mounted at the jamb post
    for (const hFrac of [0.2, 0.8]) {
      const barrel = BABYLON.MeshBuilder.CreateCylinder(
        `lw-door-hinge-barrel-${op.id}-${leafIdx}-${hFrac}`,
        { diameter: 0.065, height: 0.14, tessellation: 10 },
        scene,
      );
      barrel.parent = hingePivot;
      barrel.position.set(0, hFrac * leafH, 0);
      barrel.material = hardwareMat;
      tagMesh(barrel);
    }

    const leaf = BABYLON.MeshBuilder.CreateBox(
      `lw-door-leaf-${op.id}-${leafIdx}`,
      { width: singleLeafWidth, height: leafH, depth: leafDepth },
      scene,
    );
    leaf.parent = hingePivot;
    leaf.position.set(dir * (singleLeafWidth * 0.5), leafH * 0.5, 0);
    leaf.material = leafMat;
    tagMesh(leaf);

    // Perimeter Vertical Stiles & Top/Bottom Rails on both faces so the door leaf has real 3D carpentry relief
    const stileW = Math.min(0.11, singleLeafWidth * 0.14);
    for (const sSide of [-1, 1] as const) {
      const stile = BABYLON.MeshBuilder.CreateBox(
        `lw-door-leaf-stile-${op.id}-${leafIdx}-${sSide}`,
        { width: stileW, height: leafH, depth: leafDepth * 1.24 },
        scene,
      );
      stile.parent = leaf;
      stile.position.set(sSide * (singleLeafWidth * 0.5 - stileW * 0.5), 0, 0);
      stile.material = frameMat;
      tagMesh(stile);
    }
    for (const rSide of [-1, 1] as const) {
      const rail = BABYLON.MeshBuilder.CreateBox(
        `lw-door-leaf-rail-${op.id}-${leafIdx}-${rSide}`,
        { width: singleLeafWidth, height: stileW, depth: leafDepth * 1.22 },
        scene,
      );
      rail.parent = leaf;
      rail.position.set(0, rSide * (leafH * 0.5 - stileW * 0.5), 0);
      rail.material = frameMat;
      tagMesh(rail);
    }

    // Style-specific 3D sculptural ornament & hardware on BOTH sides of the leaf
    switch (doorStyle.style) {
      case 'dungeon': {
        for (const yFrac of [0.22, 0.78]) {
          const strap = BABYLON.MeshBuilder.CreateBox(
            `lw-door-strap-${op.id}-${leafIdx}-${yFrac}`,
            { width: singleLeafWidth * 0.86, height: 0.075, depth: leafDepth * 1.34 },
            scene,
          );
          strap.parent = leaf;
          strap.position.set(-dir * singleLeafWidth * 0.04, (yFrac - 0.5) * leafH, 0);
          strap.material = hardwareMat;
          tagMesh(strap);
        }
        for (const faceSign of [-1, 1] as const) {
          const ring = BABYLON.MeshBuilder.CreateTorus(
            `lw-door-ring-${op.id}-${leafIdx}-${faceSign}`,
            { diameter: 0.16, thickness: 0.028, tessellation: 14 },
            scene,
          );
          ring.parent = leaf;
          ring.rotation.x = Math.PI * 0.5;
          ring.position.set(dir * singleLeafWidth * 0.32, -0.04, faceSign * (leafDepth * 0.68));
          ring.material = hardwareMat;
          tagMesh(ring);
        }
        break;
      }

      case 'arcane': {
        const runeRing = BABYLON.MeshBuilder.CreateTorus(
          `lw-door-rune-ring-${op.id}-${leafIdx}`,
          { diameter: Math.min(singleLeafWidth, leafH) * 0.58, thickness: 0.036, tessellation: 24 },
          scene,
        );
        runeRing.parent = leaf;
        runeRing.rotation.x = Math.PI * 0.5;
        runeRing.position.set(0, 0.06, 0);
        runeRing.scaling.z = leafDepth * 14;
        runeRing.material = hardwareMat;
        tagMesh(runeRing);

        const coreGem = BABYLON.MeshBuilder.CreatePolyhedron(
          `lw-door-rune-core-${op.id}-${leafIdx}`,
          { type: 1, size: 0.095 },
          scene,
        );
        coreGem.parent = leaf;
        coreGem.position.set(0, 0.06, 0);
        coreGem.material = hardwareMat;
        tagMesh(coreGem);
        break;
      }

      case 'elvish': {
        for (const xFrac of [-0.24, 0, 0.24]) {
          const rib = BABYLON.MeshBuilder.CreateBox(
            `lw-door-elvish-rib-${op.id}-${leafIdx}-${xFrac}`,
            { width: 0.038, height: leafH * 0.88, depth: leafDepth * 1.3 },
            scene,
          );
          rib.parent = leaf;
          rib.position.set(xFrac * singleLeafWidth, 0, 0);
          rib.material = hardwareMat;
          tagMesh(rib);
        }
        break;
      }

      case 'industrial': {
        for (const faceSign of [-1, 1] as const) {
          const wheel = BABYLON.MeshBuilder.CreateTorus(
            `lw-door-bulkhead-wheel-${op.id}-${leafIdx}-${faceSign}`,
            { diameter: Math.min(0.42, singleLeafWidth * 0.44), thickness: 0.036, tessellation: 16 },
            scene,
          );
          wheel.parent = leaf;
          wheel.rotation.x = Math.PI * 0.5;
          wheel.position.set(0, 0, faceSign * (leafDepth * 0.68));
          wheel.material = hardwareMat;
          tagMesh(wheel);
        }

        const crossSpoke = BABYLON.MeshBuilder.CreateBox(
          `lw-door-bulkhead-spoke-${op.id}-${leafIdx}`,
          { width: Math.min(0.38, singleLeafWidth * 0.4), height: 0.042, depth: leafDepth * 1.5 },
          scene,
        );
        crossSpoke.parent = leaf;
        crossSpoke.material = hardwareMat;
        tagMesh(crossSpoke);
        break;
      }

      case 'nobility': {
        for (const yOff of [-leafH * 0.23, leafH * 0.23]) {
          const panel = BABYLON.MeshBuilder.CreateBox(
            `lw-door-noble-panel-${op.id}-${leafIdx}-${yOff}`,
            { width: singleLeafWidth * 0.68, height: leafH * 0.34, depth: leafDepth * 1.28 },
            scene,
          );
          panel.parent = leaf;
          panel.position.set(0, yOff, 0);
          panel.material = leafMat;
          tagMesh(panel);
        }
        const handle = BABYLON.MeshBuilder.CreateBox(
          `lw-door-noble-handle-${op.id}-${leafIdx}`,
          { width: 0.045, height: 0.19, depth: leafDepth * 1.55 },
          scene,
        );
        handle.parent = leaf;
        handle.position.set(dir * singleLeafWidth * 0.34, -0.04, 0);
        handle.material = hardwareMat;
        tagMesh(handle);
        break;
      }

      case 'wood-home':
      case 'shack': {
        for (const yOff of [-leafH * 0.3, 0, leafH * 0.3]) {
          const ledger = BABYLON.MeshBuilder.CreateBox(
            `lw-door-ledger-${op.id}-${leafIdx}-${yOff}`,
            { width: singleLeafWidth * 0.9, height: 0.08, depth: leafDepth * 1.32 },
            scene,
          );
          ledger.parent = leaf;
          ledger.position.set(0, yOff, 0);
          ledger.material = frameMat;
          tagMesh(ledger);
        }
        const braceLen = Math.hypot(singleLeafWidth * 0.78, leafH * 0.56);
        const brace = BABYLON.MeshBuilder.CreateBox(
          `lw-door-zbrace-${op.id}-${leafIdx}`,
          { width: braceLen, height: 0.075, depth: leafDepth * 1.28 },
          scene,
        );
        brace.parent = leaf;
        brace.rotation.z = dir * Math.atan2(leafH * 0.56, singleLeafWidth * 0.78);
        brace.material = frameMat;
        tagMesh(brace);
        break;
      }
    }
  }

  return created;
}
