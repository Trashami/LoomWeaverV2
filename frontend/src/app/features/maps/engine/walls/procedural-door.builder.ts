import * as BABYLON from '@babylonjs/core';
import { WallOpeningNode, WallSegmentNode } from '../map-scene-contract';
import {
  ProceduralDoorStyleSpec,
  ProceduralWallStyleSpec,
  resolveProceduralDoorStyle,
} from './procedural-wall-catalog';

export interface DoorCutoutPlacement {
  op: WallOpeningNode;
  centerDist: number;
  startDist: number;
  endDist: number;
  width: number;
  height: number;
  sillY: number;
  doorX: number;
  doorZ: number;
  doorGroundY: number;
  ux: number;
  uz: number;
  angleY: number;
}

const doorMatCache = new Map<string, BABYLON.PBRMaterial>();

function getDoorPbrMat(
  scene: BABYLON.Scene,
  key: string,
  hex: string,
  roughness: number,
  metallic: number,
  emissiveHex?: string,
): BABYLON.PBRMaterial {
  const fullKey = `${scene.uid}|door|${key}|${hex}|${emissiveHex || ''}`;
  const cached = doorMatCache.get(fullKey);
  if (cached) return cached;

  const mat = new BABYLON.PBRMaterial(`procDoorMat_${key}`, scene);
  mat.albedoColor = BABYLON.Color3.FromHexString(hex);
  mat.roughness = roughness;
  mat.metallic = metallic;
  if (emissiveHex) {
    mat.emissiveColor = BABYLON.Color3.FromHexString(emissiveHex).scale(0.55);
  }
  doorMatCache.set(fullKey, mat);
  return mat;
}

/**
 * Builds the full-thickness wall-wrapping door frame (left/right jambs, threshold,
 * lintel header, and keystone) plus the hinged 3D door leaf for any D&D door style.
 */
export function buildProceduralDoorAssembly(
  scene: BABYLON.Scene,
  wall: WallSegmentNode,
  cut: DoorCutoutPlacement,
  wallThickness: number,
  wallStyle: ProceduralWallStyleSpec,
  includeProceduralLeaf: boolean,
): BABYLON.Mesh[] {
  const created: BABYLON.Mesh[] = [];
  const { op, width, height, sillY, doorX, doorZ, doorGroundY, angleY } = cut;
  const doorStyle: ProceduralDoorStyleSpec = resolveProceduralDoorStyle(op);

  const root = new BABYLON.TransformNode(`lw-door-node-root-${wall.id}-${op.id}`, scene);
  root.position.set(doorX, doorGroundY + sillY, doorZ);
  root.rotation.y = angleY;

  const frameDepth = Math.max(0.28, wallThickness * 1.24);
  const jambWidth = Math.min(0.16, Math.max(0.10, width * 0.10));

  const frameMat = getDoorPbrMat(
    scene,
    `${doorStyle.id}_frame`,
    doorStyle.frameColorHex || wallStyle.plinthColorHex,
    0.72,
    doorStyle.style === 'industrial' ? 0.58 : 0.12,
  );
  const leafMat = getDoorPbrMat(
    scene,
    `${doorStyle.id}_leaf`,
    op.tintColorHex || doorStyle.leafColorHex,
    doorStyle.roughness,
    doorStyle.metallic,
  );
  const hardwareMat = getDoorPbrMat(
    scene,
    `${doorStyle.id}_hw`,
    doorStyle.hardwareColorHex,
    0.36,
    0.82,
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

  // 1. Left & Right Full-Depth Cased Jamb Pillars (wrap both faces of the wall cut)
  for (const side of [-1, 1] as const) {
    const jamb = BABYLON.MeshBuilder.CreateBox(
      `door-jamb-${side}-${op.id}`,
      { width: jambWidth, height: height + 0.04, depth: frameDepth },
      scene,
    );
    jamb.parent = root;
    jamb.position.set(side * (width * 0.5 - jambWidth * 0.35), height * 0.5, 0);
    jamb.material = frameMat;
    tagMesh(jamb);
  }

  // 2. Stone/Timber Threshold Sill Step
  const threshold = BABYLON.MeshBuilder.CreateBox(
    `door-threshold-${op.id}`,
    { width: width + 0.06, height: 0.07, depth: frameDepth * 1.06 },
    scene,
  );
  threshold.parent = root;
  threshold.position.set(0, 0.035, 0);
  threshold.material = frameMat;
  tagMesh(threshold);

  // 3. Top Header Beam / Arch Lintel Casing
  const headerH = 0.15;
  const header = BABYLON.MeshBuilder.CreateBox(
    `door-header-${op.id}`,
    { width: width + 0.10, height: headerH, depth: frameDepth * 1.08 },
    scene,
  );
  header.parent = root;
  header.position.set(0, height - headerH * 0.35, 0);
  header.material = frameMat;
  tagMesh(header);

  if (doorStyle.hasArchTop) {
    // Keystone boss in center of top lintel
    const keystone = BABYLON.MeshBuilder.CreateBox(
      `door-keystone-${op.id}`,
      { width: 0.22, height: headerH * 1.45, depth: frameDepth * 1.16 },
      scene,
    );
    keystone.parent = root;
    keystone.position.set(0, height - headerH * 0.2, 0);
    keystone.material = hardwareMat;
    tagMesh(keystone);
  }

  if (!includeProceduralLeaf || doorStyle.style === 'archway') {
    return created;
  }

  const clearWidth = Math.max(0.45, width - jambWidth * 1.3);
  const clearHeight = Math.max(0.75, height - headerH * 0.75);
  const leafDepth = Math.max(0.08, Math.min(0.15, wallThickness * 0.36));

  // Portcullis / Iron Bars style
  if (doorStyle.style === 'bars') {
    const barCount = Math.max(4, Math.floor(clearWidth / 0.16));
    const liftY = op.isOpen ? clearHeight * 0.72 : 0;
    for (let i = 0; i < barCount; i++) {
      const t = (i + 0.5) / barCount - 0.5;
      const bar = BABYLON.MeshBuilder.CreateCylinder(
        `door-bar-${op.id}-${i}`,
        { diameter: 0.038, height: clearHeight, tessellation: 8 },
        scene,
      );
      bar.parent = root;
      bar.position.set(t * clearWidth, clearHeight * 0.5 + liftY, 0);
      bar.material = hardwareMat;
      tagMesh(bar);
    }
    for (const railRatio of [0.25, 0.75]) {
      const rail = BABYLON.MeshBuilder.CreateBox(
        `door-bar-rail-${op.id}-${railRatio}`,
        { width: clearWidth, height: 0.05, depth: 0.06 },
        scene,
      );
      rail.parent = root;
      rail.position.set(0, clearHeight * railRatio + liftY, 0);
      rail.material = hardwareMat;
      tagMesh(rail);
    }
    return created;
  }

  // Hinged Door Leaf Pivot (mounted at left jamb so opening swings naturally by 82 deg)
  const hingePivot = new BABYLON.TransformNode(`door-hinge-${op.id}`, scene);
  hingePivot.parent = root;
  hingePivot.position.set(-clearWidth * 0.5, 0.06, 0);
  hingePivot.rotation.y = op.isOpen ? -Math.PI * 0.46 : 0;

  const leaf = BABYLON.MeshBuilder.CreateBox(
    `door-leaf-${op.id}`,
    { width: clearWidth, height: clearHeight - 0.06, depth: leafDepth },
    scene,
  );
  leaf.parent = hingePivot;
  leaf.position.set(clearWidth * 0.5, (clearHeight - 0.06) * 0.5, 0);
  leaf.material = leafMat;
  tagMesh(leaf);

  const leafH = clearHeight - 0.06;

  // Style-specific 3D sculptural ornament & hardware on both sides of the leaf
  switch (doorStyle.style) {
    case 'dungeon': {
      // Heavy iron hinge straps + ring pull
      for (const yFrac of [0.22, 0.78]) {
        const strap = BABYLON.MeshBuilder.CreateBox(
          `door-strap-${op.id}-${yFrac}`,
          { width: clearWidth * 0.86, height: 0.07, depth: leafDepth * 1.26 },
          scene,
        );
        strap.parent = leaf;
        strap.position.set(-clearWidth * 0.04, (yFrac - 0.5) * leafH, 0);
        strap.material = hardwareMat;
        tagMesh(strap);
      }
      const ring = BABYLON.MeshBuilder.CreateTorus(
        `door-ring-${op.id}`,
        { diameter: 0.16, thickness: 0.028, tessellation: 14 },
        scene,
      );
      ring.parent = leaf;
      ring.rotation.x = Math.PI * 0.5;
      ring.position.set(clearWidth * 0.34, -0.04, leafDepth * 0.62);
      ring.material = hardwareMat;
      tagMesh(ring);
      break;
    }

    case 'arcane': {
      // Glowing runic circle + vertical ley-bars
      const runeRing = BABYLON.MeshBuilder.CreateTorus(
        `door-rune-ring-${op.id}`,
        { diameter: Math.min(clearWidth, leafH) * 0.58, thickness: 0.035, tessellation: 24 },
        scene,
      );
      runeRing.parent = leaf;
      runeRing.rotation.x = Math.PI * 0.5;
      runeRing.position.set(0, 0.06, 0);
      runeRing.scaling.z = leafDepth * 14;
      runeRing.material = hardwareMat;
      tagMesh(runeRing);

      const coreGem = BABYLON.MeshBuilder.CreatePolyhedron(
        `door-rune-core-${op.id}`,
        { type: 1, size: 0.09 },
        scene,
      );
      coreGem.parent = leaf;
      coreGem.position.set(0, 0.06, 0);
      coreGem.material = hardwareMat;
      tagMesh(coreGem);
      break;
    }

    case 'elvish': {
      // Twin graceful vertical silverleaf ribs + arched transom bar
      for (const xFrac of [-0.24, 0, 0.24]) {
        const rib = BABYLON.MeshBuilder.CreateBox(
          `door-elvish-rib-${op.id}-${xFrac}`,
          { width: 0.035, height: leafH * 0.88, depth: leafDepth * 1.24 },
          scene,
        );
        rib.parent = leaf;
        rib.position.set(xFrac * clearWidth, 0, 0);
        rib.material = hardwareMat;
        tagMesh(rib);
      }
      break;
    }

    case 'industrial': {
      // Artificer bulkhead perimeter flange + central locking wheel
      const wheel = BABYLON.MeshBuilder.CreateTorus(
        `door-bulkhead-wheel-${op.id}`,
        { diameter: Math.min(0.42, clearWidth * 0.42), thickness: 0.036, tessellation: 16 },
        scene,
      );
      wheel.parent = leaf;
      wheel.rotation.x = Math.PI * 0.5;
      wheel.position.set(0, 0, leafDepth * 0.65);
      wheel.material = hardwareMat;
      tagMesh(wheel);

      const crossSpoke = BABYLON.MeshBuilder.CreateBox(
        `door-bulkhead-spoke-${op.id}`,
        { width: Math.min(0.38, clearWidth * 0.38), height: 0.04, depth: leafDepth * 1.45 },
        scene,
      );
      crossSpoke.parent = leaf;
      crossSpoke.material = hardwareMat;
      tagMesh(crossSpoke);
      break;
    }

    case 'nobility': {
      // Upper and lower raised coffered panels + brass lever handle
      for (const yOff of [-leafH * 0.23, leafH * 0.23]) {
        const panel = BABYLON.MeshBuilder.CreateBox(
          `door-noble-panel-${op.id}-${yOff}`,
          { width: clearWidth * 0.68, height: leafH * 0.34, depth: leafDepth * 1.22 },
          scene,
        );
        panel.parent = leaf;
        panel.position.set(0, yOff, 0);
        panel.material = leafMat;
        tagMesh(panel);
      }
      const handle = BABYLON.MeshBuilder.CreateBox(
        `door-noble-handle-${op.id}`,
        { width: 0.04, height: 0.18, depth: leafDepth * 1.45 },
        scene,
      );
      handle.parent = leaf;
      handle.position.set(clearWidth * 0.36, -0.04, 0);
      handle.material = hardwareMat;
      tagMesh(handle);
      break;
    }

    case 'wood-home':
    case 'shack': {
      // Horizontal ledger rails + diagonal Z-brace timber
      for (const yOff of [-leafH * 0.32, leafH * 0.32]) {
        const ledger = BABYLON.MeshBuilder.CreateBox(
          `door-ledger-${op.id}-${yOff}`,
          { width: clearWidth * 0.90, height: 0.08, depth: leafDepth * 1.25 },
          scene,
        );
        ledger.parent = leaf;
        ledger.position.set(0, yOff, 0);
        ledger.material = frameMat;
        tagMesh(ledger);
      }
      const braceLen = Math.hypot(clearWidth * 0.78, leafH * 0.58);
      const brace = BABYLON.MeshBuilder.CreateBox(
        `door-zbrace-${op.id}`,
        { width: braceLen, height: 0.07, depth: leafDepth * 1.22 },
        scene,
      );
      brace.parent = leaf;
      brace.rotation.z = Math.atan2(leafH * 0.58, clearWidth * 0.78);
      brace.material = frameMat;
      tagMesh(brace);
      break;
    }
  }

  return created;
}
