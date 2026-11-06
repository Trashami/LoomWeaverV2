import {
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { MapWallSegmentNode, WallDrawMode, WallOpeningNode } from '../map-scene-contract';
import { GlbModelCache } from '../rendering/glb-model-cache';
import { resolveTextureLodUrl } from '../rendering/glb-lod';
import { TerrainMeshBuilder } from '../terrain/terrain-mesh.builder';
import { wallEndExtension } from './wall-join-profile';
import { WallSurfacePaint } from './wall-surface-paint';
import { CutawayWallEngine } from './cutaway-wall.engine';
import { resolveProceduralWallStyle } from './procedural-wall-catalog';
import {
  buildProceduralCornerPillar,
  buildProceduralWallSpan,
} from './procedural-wall-extruder';
import {
  buildProceduralDoorAssembly,
  DoorCutoutPlacement,
} from './procedural-door.builder';
import {
  buildWallShapePointsHelper,
  findClosestWallAttachmentHelper,
  mergeSharedWallsOnPlacementHelper,
  snapWallCursorPointHelper,
} from './wall-shape-geometry.helper';

export interface WallDoorAttachmentHit {
  readonly wallId: string;
  readonly t: number;
  readonly x: number;
  readonly z: number;
  readonly angleY: number;
  readonly wallHeight: number;
  readonly wallThickness: number;
}

export interface SnappedWallCursorResult {
  readonly x: number;
  readonly z: number;
  readonly snappedToCorner: boolean;
  readonly connectedWallId?: string;
  readonly previewAngleY: number;
}

export class WallMeshBuilder {
  private static texCache = new Map<string, Texture>();
  private static activeScene: Scene | null = null;
  private static ghostMat: StandardMaterial | null = null;
  private static builtWallSigByScene = new WeakMap<Scene, { sig: string; count: number }>();

  static evictScene(scene: Scene): void {
    this.builtWallSigByScene.delete(scene);
  }

  private static ensureSceneCache(scene: Scene): void {
    if (this.activeScene !== scene) {
      this.texCache.clear();
      this.ghostMat = null;
      this.activeScene = scene;
    }
  }

  private static getCachedTexture(scene: Scene, url: string): Texture {
    this.ensureSceneCache(scene);
    const resolved = resolveTextureLodUrl(url, GlbModelCache.getLodTier());
    const existing = this.texCache.get(resolved);
    if (existing) {
      return existing;
    }
    const tex = new Texture(resolved, scene);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    this.texCache.set(resolved, tex);
    return tex;
  }

  private static computeWallSceneSig(
    scene: Scene,
    walls: readonly MapWallSegmentNode[] | undefined,
    hideSecrets: boolean,
    onGlbLoaded?: () => void,
  ): string {
    const tier = GlbModelCache.getLodTier();
    const elevVer = TerrainMeshBuilder.getElevationVersion();
    if (!walls || walls.length === 0) {
      return `${tier}|${elevVer}|${hideSecrets ? 1 : 0}|empty`;
    }
    const parts: string[] = [`${tier}|${elevVer}|${hideSecrets ? 1 : 0}`];
    for (const w of walls) {
      const ptsSig = w.points.map((p) => `${p[0]},${p[1]}`).join(';');
      const wallUrl = w.modelUrl || '';
      const isGlbWall = Boolean(wallUrl && !wallUrl.startsWith('proc-wall://'));
      const hasWallTpl = isGlbWall
        ? Boolean(GlbModelCache.getOrLoadTemplate(scene, wallUrl, onGlbLoaded))
        : true;
      const opsSig = w.openings
        .map((op) => {
          const doorUrl = op.modelUrl || '';
          const isGlbDoor = Boolean(doorUrl && !doorUrl.startsWith('proc-door://'));
          const hasDoorTpl = isGlbDoor
            ? Boolean(GlbModelCache.getOrLoadTemplate(scene, doorUrl, onGlbLoaded))
            : true;
          return `${op.id}:${op.t}:${op.type}:${op.doorStyle ?? ''}:${op.widthMeters}:${op.heightMeters ?? 0}:${op.isOpen ? 1 : 0}:${op.hingeSide ?? 'left'}:${op.swingDirection ?? 'inward'}:${op.isSecret ? 1 : 0}:${op.isRevealedToPlayers ? 1 : 0}:${op.hasSidePosts !== false ? 1 : 0}:${op.sidePostStyle ?? 'quoin'}:${op.sidePostScale ?? 1}:${doorUrl}:${hasDoorTpl ? 1 : 0}`;
        })
        .join(',');
      const paintSig = `${w.paintDabs?.length ?? 0}`;
      parts.push(
        `${w.id}|${w.drawMode}|${w.heightMeters}|${w.thicknessMeters}|${w.perspective}|${w.material}|${wallUrl}|${hasWallTpl ? 1 : 0}|${w.albedoUrl ?? ''}|${w.normalUrl ?? ''}|${w.colorHex ?? ''}|${w.wallNormalStrength ?? 1.35}|${w.wallDisplacementScale ?? 1}|${w.hasCornerPosts ? 1 : 0}|${w.cornerPostScale ?? 1}|${w.connectionOverlap ?? 15}|${w.offsetY ?? -0.06}|${w.stampScale ?? 1}|${w.rotationOffsetDeg ?? 0}|${ptsSig}|${opsSig}|${paintSig}`,
      );
    }
    return parts.join('||');
  }

  private static getSharedGhostWallMat(scene: Scene): StandardMaterial {
    this.ensureSceneCache(scene);
    if (!this.ghostMat || this.ghostMat.getScene() !== scene) {
      const mat = new StandardMaterial('lw-ghost-wall-shared-mat', scene);
      mat.diffuseColor = Color3.FromHexString('#49e892');
      mat.emissiveColor = Color3.FromHexString('#2ee66b').scale(0.5);
      mat.alpha = 0.5;
      this.ghostMat = mat;
    }
    return this.ghostMat;
  }

  static snapWallCursorPoint(
    walls: readonly MapWallSegmentNode[] | undefined,
    rawX: number,
    rawZ: number,
    anchor: { x: number; z: number } | null,
    snapToGrid: boolean,
  ): SnappedWallCursorResult {
    return snapWallCursorPointHelper(walls, rawX, rawZ, anchor, snapToGrid);
  }

  static mergeSharedWallsOnPlacement(
    existingWalls: readonly MapWallSegmentNode[],
    newWall: MapWallSegmentNode,
    snapToGrid = true,
  ): { walls: MapWallSegmentNode[]; primaryWallId: string } {
    return mergeSharedWallsOnPlacementHelper(existingWalls, newWall, snapToGrid);
  }

  static buildShapePoints(
    mode: WallDrawMode,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    freehandPoints?: readonly (readonly [number, number])[],
    snapToGrid = true,
  ): (readonly [number, number])[] {
    return buildWallShapePointsHelper(mode, startX, startZ, endX, endZ, freehandPoints, snapToGrid);
  }

  static findClosestWallAttachment(
    walls: readonly MapWallSegmentNode[] | undefined,
    worldX: number,
    worldZ: number,
    maxSnapDist = 4.0,
  ): WallDoorAttachmentHit | null {
    return findClosestWallAttachmentHelper(walls, worldX, worldZ, maxSnapDist);
  }

  private static createCustomBitmapWallMaterial(
    scene: Scene,
    matName: string,
    wall: MapWallSegmentNode,
  ): StandardMaterial | null {
    const texUrl = wall.albedoUrl;
    if (!texUrl || texUrl.startsWith('proc://')) {
      return null;
    }
    const existing = scene.getMaterialByName(matName) as StandardMaterial | null;
    if (existing) {
      existing.dispose(false, false);
    }
    const mat = new StandardMaterial(matName, scene);
    const diffTex = this.getCachedTexture(scene, texUrl);
    mat.diffuseTexture = diffTex;
    mat.diffuseColor = wall.colorHex ? Color3.FromHexString(wall.colorHex) : Color3.White();
    if (wall.normalUrl && !wall.normalUrl.startsWith('proc://')) {
      const bumpTex = this.getCachedTexture(scene, wall.normalUrl);
      bumpTex.level = wall.wallNormalStrength ?? 1.35;
      mat.bumpTexture = bumpTex;
    }
    mat.specularColor = Color3.FromHexString('#1d2822');
    return mat;
  }

  /**
   * Builds continuous procedural 3D walls with subdivided stone/brick/plank/cavern vertex relief,
   * base plinths, top coping ledges, corner quoin pillars, and full-depth cased doors.
   */
  static rebuildWallMeshes(
    scene: Scene,
    walls: readonly MapWallSegmentNode[] | undefined,
    hideSecrets = false,
    onGlbLoaded?: () => void,
  ): number {
    this.ensureSceneCache(scene);
    const sig = this.computeWallSceneSig(scene, walls, hideSecrets, onGlbLoaded);
    const prev = this.builtWallSigByScene.get(scene);
    if (prev && prev.sig === sig) {
      return prev.count;
    }

    WallSurfacePaint.clear(scene);
    scene.transformNodes
      .filter((n) => n.name.startsWith('lw-wall-node-') || n.name.startsWith('lw-door-node-'))
      .forEach((n) => n.dispose(false, false));
    scene.meshes
      .filter(
        (m) =>
          m.name.startsWith('lw-wall-') ||
          m.name.startsWith('lw-portal-') ||
          m.name.startsWith('lw-door-'),
      )
      .forEach((m) => m.dispose(false, false));

    if (!walls || walls.length === 0) {
      this.builtWallSigByScene.set(scene, { sig, count: 0 });
      return 0;
    }
    let meshCount = 0;

    for (const wall of walls) {
      const pts = wall.points;
      if (pts.length < 2) continue;

      const closed = wall.drawMode !== 'line' && wall.drawMode !== 'freehand';
      const height = CutawayWallEngine.computeCutawayHeight(
        wall.heightMeters,
        wall.perspective,
        false,
      );
      const wallStyle = resolveProceduralWallStyle(wall);
      const customBitmapMat = this.createCustomBitmapWallMaterial(
        scene,
        `lw-wall-custom-mat-${wall.id}`,
        wall,
      );
      const wallUrl = wall.modelUrl || '';
      const isGlbWall = Boolean(wallUrl && !wallUrl.startsWith('proc-wall://'));
      const wallTpl = isGlbWall
        ? GlbModelCache.getOrLoadTemplate(scene, wallUrl, onGlbLoaded)
        : null;
      if (wallTpl) {
        GlbModelCache.normalizeWallTemplateLighting(wallTpl);
      }

      const overlapFrac = Math.max(-0.2, Math.min(0.5, (wall.connectionOverlap ?? 15) / 100));
      const offsetY = wall.offsetY ?? -0.06;
      const stampScale = Math.max(0.4, Math.min(3.0, wall.stampScale ?? 1.0));
      const rotOffsetRad = ((wall.rotationOffsetDeg ?? 0) * Math.PI) / 180;
      const effectiveThickness = wall.thicknessMeters * stampScale;

      const segCount = closed ? pts.length : pts.length - 1;
      const segLengths: number[] = [];
      let totalPerimeter = 0;
      for (let i = 0; i < segCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segLengths.push(len);
        totalPerimeter += len;
      }

      // Build 3D Corner Quoin Pillars at wall vertices when enabled
      if (wall.hasCornerPosts !== false) {
        for (let vIdx = 0; vIdx < pts.length; vIdx++) {
          const [vx, vz] = pts[vIdx];
          const vGroundY = TerrainMeshBuilder.sampleElevationAt(scene, vx, vz) + offsetY;
          const nextPt = pts[(vIdx + 1) % pts.length];
          const vAngleY = -Math.atan2(nextPt[1] - vz, nextPt[0] - vx) + rotOffsetRad;
          const cornerMeshes = buildProceduralCornerPillar(
            scene,
            wall,
            vIdx,
            vx,
            vz,
            vGroundY,
            height * stampScale,
            effectiveThickness,
            vAngleY,
            wallStyle,
            customBitmapMat,
          );
          meshCount += cornerMeshes.length;
        }
      }

      let accumBefore = 0;
      for (let i = 0; i < segCount; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const totalLen = segLengths[i];
        if (totalLen < 0.08) continue;

        const segStartMeters = accumBefore;
        const segGlobalStartT = totalPerimeter > 0 ? accumBefore / totalPerimeter : 0;
        const segGlobalEndT = totalPerimeter > 0 ? (accumBefore + totalLen) / totalPerimeter : 1;
        accumBefore += totalLen;

        const angleY = -Math.atan2(dz, dx) + rotOffsetRad;
        const ux = dx / totalLen;
        const uz = dz / totalLen;

        interface ResolvedDoorCutout {
          readonly startLocal: number;
          readonly endLocal: number;
          readonly localCenter: number;
          readonly doorX: number;
          readonly doorZ: number;
          readonly groundY: number;
          readonly doorH: number;
          readonly doorWidth: number;
          readonly opening: WallOpeningNode;
        }
        const localCutouts: ResolvedDoorCutout[] = [];
        for (const op of wall.openings) {
          if (op.t >= segGlobalStartT - 0.001 && op.t <= segGlobalEndT + 0.001) {
            const localCenter =
              segGlobalEndT > segGlobalStartT
                ? (op.t - segGlobalStartT) / (segGlobalEndT - segGlobalStartT)
                : 0.5;
            const doorWidth = Math.max(0.75, op.widthMeters || 1.5);
            const doorH = Math.min(height * stampScale, op.heightMeters ?? Math.min(height, 2.5));
            const doorX = a[0] + dx * localCenter;
            const doorZ = a[1] + dz * localCenter;
            const groundY = TerrainMeshBuilder.sampleElevationAt(scene, doorX, doorZ);
            // Cut span so the solid wall ends inside the left & right Door Side Post Blocks
            const halfSpan = Math.min(0.47, (doorWidth * 0.42) / totalLen);
            localCutouts.push({
              startLocal: Math.max(0, localCenter - halfSpan),
              endLocal: Math.min(1, localCenter + halfSpan),
              localCenter,
              doorX,
              doorZ,
              groundY,
              doorH,
              doorWidth,
              opening: op,
            });
          }
        }
        localCutouts.sort((x, y) => x.startLocal - y.startLocal);

        const solidSpans: { s0: number; s1: number }[] = [];
        let cursor = 0;
        for (const cut of localCutouts) {
          if (cut.startLocal - cursor > 0.015) {
            solidSpans.push({ s0: cursor, s1: cut.startLocal });
          }
          cursor = Math.max(cursor, cut.endLocal);
        }
        if (1 - cursor > 0.015) {
          solidSpans.push({ s0: cursor, s1: 1 });
        }

        const wallMeta = {
          lwNodeName: `lw-wall-${wall.id}`,
          lwKind: 'wall' as const,
          lwEntityId: wall.id,
          lwWallId: wall.id,
        };

        for (let sIdx = 0; sIdx < solidSpans.length; sIdx++) {
          const { s0, s1 } = solidSpans[sIdx];
          const rawSpanLen = (s1 - s0) * totalLen;
          const startCornerExt =
            s0 <= 0.01
              ? wallEndExtension(
                  a,
                  [ux, uz],
                  wall,
                  walls,
                  wall.thicknessMeters * (0.48 + overlapFrac * 0.65),
                )
              : 0;
          const endCornerExt =
            s1 >= 0.99
              ? wallEndExtension(
                  b,
                  [ux, uz],
                  wall,
                  walls,
                  wall.thicknessMeters * (0.48 + overlapFrac * 0.65),
                )
              : 0;
          const spanStartX = a[0] + dx * s0 - ux * startCornerExt;
          const spanStartZ = a[1] + dz * s0 - uz * startCornerExt;
          const extendedSpanLen = rawSpanLen + startCornerExt + endCornerExt;
          if (extendedSpanLen < 0.03) continue;

          const bx = spanStartX + ux * (extendedSpanLen * 0.5);
          const bz = spanStartZ + uz * (extendedSpanLen * 0.5);
          const yStart = TerrainMeshBuilder.sampleElevationAt(scene, a[0] + dx * s0, a[1] + dz * s0);
          const yMid = TerrainMeshBuilder.sampleElevationAt(scene, bx, bz);
          const yEnd = TerrainMeshBuilder.sampleElevationAt(scene, a[0] + dx * s1, a[1] + dz * s1);
          const minGroundY = Math.min(yStart, yMid, yEnd);
          const maxGroundY = Math.max(yStart, yMid, yEnd);
          const effectiveHeight = (maxGroundY + height - minGroundY) * stampScale;

          if (wallTpl) {
            const primaryRawSpan = Math.max(
              1.2,
              wallTpl.rawDepth > wallTpl.rawWidth * 1.35 ? wallTpl.rawDepth : wallTpl.rawWidth,
            );
            const idealChunkLen = Math.max(1.2, Math.min(3.4, primaryRawSpan * stampScale));
            const chunkCount = Math.max(1, Math.round(extendedSpanLen / idealChunkLen));
            const chunkLen = extendedSpanLen / chunkCount;
            const chunkRenderW = chunkLen * (1 + Math.max(0.04, overlapFrac * 0.25));
            for (let cIdx = 0; cIdx < chunkCount; cIdx++) {
              const uMid = (cIdx + 0.5) / chunkCount;
              const cx = spanStartX + ux * (extendedSpanLen * uMid);
              const cz = spanStartZ + uz * (extendedSpanLen * uMid);
              const cy = TerrainMeshBuilder.sampleElevationAt(scene, cx, cz);
              const cInst = GlbModelCache.instantiateClone(
                scene,
                wallTpl,
                `lw-wall-node-${wall.id}-${i}-${sIdx}-${cIdx}`,
                chunkRenderW,
                effectiveHeight,
                effectiveThickness,
                false,
                false,
                wallMeta,
                {
                  colorHex: wall.colorHex || wall.tintColorHex,
                },
              );
              cInst.position.set(cx, cy + offsetY, cz);
              cInst.rotation.y = angleY;
              meshCount++;
            }
          } else {
            const spanMeshes = buildProceduralWallSpan(scene, wall, {
              spanId: `${i}-${sIdx}`,
              centerX: bx,
              centerZ: bz,
              groundY: minGroundY + offsetY,
              baseElevationY: 0,
              spanLength: extendedSpanLen,
              spanHeight: effectiveHeight,
              thickness: effectiveThickness,
              angleY,
              worldStartDistMeters: segStartMeters + s0 * totalLen,
              style: wallStyle,
              includePlinth: true,
              includeCoping: true,
            });
            if (customBitmapMat && spanMeshes[0]) {
              spanMeshes[0].material = customBitmapMat;
            }
            meshCount += spanMeshes.length;
          }
        }

        // Render continuous lintel wall above each door + cased door frame & leaf
        for (const cut of localCutouts) {
          const op = cut.opening;
          if (hideSecrets && op.isSecret && !op.isRevealedToPlayers) continue;

          const { doorX, doorZ, groundY, doorH, doorWidth, localCenter } = cut;
          const wallTopH = height * stampScale;
          const cutoutSpanLen = Math.max(doorWidth * 0.84, (cut.endLocal - cut.startLocal) * totalLen);

          if (wallTopH - doorH > 0.14) {
            const lintelH = wallTopH - doorH + 0.04;
            if (wallTpl) {
              const lintelInst = GlbModelCache.instantiateClone(
                scene,
                wallTpl,
                `lw-wall-node-lintel-${wall.id}-${i}-${op.id}`,
                cutoutSpanLen + 0.04,
                lintelH,
                effectiveThickness,
                false,
                false,
                wallMeta,
                {
                  colorHex: wall.colorHex || wall.tintColorHex,
                },
              );
              lintelInst.position.set(doorX, groundY + offsetY + doorH - 0.04, doorZ);
              lintelInst.rotation.y = angleY;
              meshCount++;
            } else {
              const lintelMeshes = buildProceduralWallSpan(scene, wall, {
                spanId: `${i}-lintel-${op.id}`,
                centerX: doorX,
                centerZ: doorZ,
                groundY: groundY + offsetY,
                baseElevationY: doorH - 0.04,
                spanLength: cutoutSpanLen,
                spanHeight: lintelH,
                thickness: effectiveThickness,
                angleY,
                worldStartDistMeters: segStartMeters + localCenter * totalLen - cutoutSpanLen * 0.5,
                style: wallStyle,
                includePlinth: false,
                includeCoping: true,
              });
              if (customBitmapMat && lintelMeshes[0]) {
                lintelMeshes[0].material = customBitmapMat;
              }
              meshCount += lintelMeshes.length;
            }
          }

          const doorUrl = op.modelUrl || '';
          const isExplicitGlbDoor = Boolean(
            doorUrl && !doorUrl.startsWith('proc-door://') && !op.doorStyle,
          );
          const doorTpl = isExplicitGlbDoor
            ? GlbModelCache.getOrLoadTemplate(scene, doorUrl, onGlbLoaded)
            : null;

          const cutPlacement: DoorCutoutPlacement = {
            op,
            centerDist: localCenter * totalLen,
            startDist: cut.startLocal * totalLen,
            endDist: cut.endLocal * totalLen,
            width: doorWidth,
            height: doorH,
            wallHeight: wallTopH,
            sillY: 0,
            doorX,
            doorZ,
            doorGroundY: groundY + offsetY,
            ux,
            uz,
            angleY,
          };

          // Build the 3D Door Side Post Blocks, cased jambs, lintel/arch, and hinged leaf
          const doorMeshes = buildProceduralDoorAssembly(
            scene,
            wall,
            cutPlacement,
            effectiveThickness,
            wallStyle,
            !doorTpl,
            customBitmapMat,
          );
          meshCount += doorMeshes.length;

          if (doorTpl) {
            const doorMeta = {
              lwNodeName: `lw-door-${op.id}`,
              lwKind: 'door' as const,
              lwEntityId: op.id,
              lwWallId: wall.id,
              wallId: wall.id,
              openingId: op.id,
            };
            const waistScale = 1 / Math.max(0.74, Math.min(0.96, doorTpl.waistWidthRatio));
            const isDoubleGlb = op.hingeSide === 'double' || op.type === 'double_door';
            const leafCount = isDoubleGlb ? 2 : 1;
            const totalDoorSpan = doorWidth * 0.84;
            const leafSpan = isDoubleGlb ? totalDoorSpan * 0.5 : totalDoorSpan;
            const leafRenderW = leafSpan * waistScale;
            const swingSign = op.swingDirection === 'outward' ? -1 : 1;

            const doorRoot = new TransformNode(`lw-door-node-glb-root-${wall.id}-${op.id}`, scene);
            doorRoot.position.set(doorX, groundY + offsetY - 0.015, doorZ);
            doorRoot.rotation.y = angleY;

            for (let lIdx = 0; lIdx < leafCount; lIdx++) {
              const hingeSign: -1 | 1 = isDoubleGlb
                ? lIdx === 0
                  ? -1
                  : 1
                : op.hingeSide === 'right'
                  ? 1
                  : -1;
              const pivotX = hingeSign * (totalDoorSpan * 0.5);
              const hingePivot = new TransformNode(`lw-door-node-hinge-${op.id}-${lIdx}`, scene);
              hingePivot.parent = doorRoot;
              hingePivot.position.set(pivotX, 0, 0);
              hingePivot.rotation.y = op.isOpen ? -hingeSign * swingSign * Math.PI * 0.46 : 0;

              const doorInst = GlbModelCache.instantiateClone(
                scene,
                doorTpl,
                `lw-door-node-${op.id}-${lIdx}`,
                leafRenderW,
                doorH,
                effectiveThickness * 1.16,
                false,
                false,
                doorMeta,
              );
              doorInst.parent = hingePivot;
              doorInst.position.set(-hingeSign * (leafSpan * 0.5), 0, 0);
              meshCount++;
            }
          }
        }
      }
    }

    WallSurfacePaint.replay(scene, walls);
    this.builtWallSigByScene.set(scene, { sig, count: meshCount });
    return meshCount;
  }

  static renderHoverWallStampPreview(
    scene: Scene,
    gx: number,
    gz: number,
    previewAngleY: number,
    _modelUrl: string | undefined,
    heightMeters: number,
    thicknessMeters: number,
    offsetY = -0.06,
    stampScale = 1.0,
    rotationOffsetDeg = 0,
  ): void {
    const groundY = TerrainMeshBuilder.sampleElevationAt(scene, gx, gz);
    const step = TerrainMeshBuilder.getCellStepMeters() * 0.24;
    const pts = [
      new Vector3(gx - step, groundY + 0.08, gz - step),
      new Vector3(gx + step, groundY + 0.08, gz - step),
      new Vector3(gx + step, groundY + 0.08, gz + step),
      new Vector3(gx - step, groundY + 0.08, gz + step),
      new Vector3(gx - step, groundY + 0.08, gz - step),
    ];
    const anchorBox = MeshBuilder.CreateLines('lw-ghost-wall-anchor', { points: pts }, scene);
    anchorBox.color = Color3.FromHexString('#49e892');
    anchorBox.isPickable = false;

    const totalRotY = previewAngleY + ((rotationOffsetDeg ?? 0) * Math.PI) / 180;
    const segLen = 3.0 * stampScale;
    const ux = Math.cos(-totalRotY);
    const uz = Math.sin(-totalRotY);
    const midX = gx + ux * (segLen * 0.5);
    const midZ = gz + uz * (segLen * 0.5);
    const midY = TerrainMeshBuilder.sampleElevationAt(scene, midX, midZ);

    const box = MeshBuilder.CreateBox(
      'lw-ghost-wall-hover-box',
      {
        width: segLen,
        height: heightMeters * stampScale,
        depth: thicknessMeters * stampScale,
      },
      scene,
    );
    box.position.set(midX, midY + (heightMeters * stampScale) / 2 + offsetY, midZ);
    box.rotation.y = totalRotY;
    box.material = this.getSharedGhostWallMat(scene);
    box.isPickable = false;
  }

  static renderGhostWallPreview(
    scene: Scene,
    drawMode: WallDrawMode,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    heightMeters: number,
    thicknessMeters: number,
    freehandPoints?: readonly (readonly [number, number])[],
    snapToGrid = true,
  ): void {
    scene.meshes
      .filter((m) => m.name.startsWith('lw-ghost-wall-'))
      .forEach((m) => m.dispose(false, false));

    const pts = this.buildShapePoints(
      drawMode,
      startX,
      startZ,
      endX,
      endZ,
      freehandPoints,
      snapToGrid,
    );
    if (pts.length < 2) return;

    const closed = drawMode !== 'line' && drawMode !== 'freehand';
    const mat = this.getSharedGhostWallMat(scene);

    const segCount = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const totalLen = Math.hypot(dx, dz);
      if (totalLen < 0.05) continue;

      const angleY = -Math.atan2(dz, dx);
      const bx = (a[0] + b[0]) * 0.5;
      const bz = (a[1] + b[1]) * 0.5;
      const y0 = TerrainMeshBuilder.sampleElevationAt(scene, a[0], a[1]);
      const yMid = TerrainMeshBuilder.sampleElevationAt(scene, bx, bz);
      const y1 = TerrainMeshBuilder.sampleElevationAt(scene, b[0], b[1]);
      const minGroundY = Math.min(y0, yMid, y1) - 0.35;
      const maxGroundY = Math.max(y0, yMid, y1);
      const effectiveH = maxGroundY + heightMeters - minGroundY;

      const mesh = MeshBuilder.CreateBox(
        `lw-ghost-wall-seg-${i}`,
        { width: totalLen + thicknessMeters * 0.48, height: effectiveH, depth: thicknessMeters },
        scene,
      );
      mesh.position.set(bx, minGroundY + effectiveH / 2, bz);
      mesh.rotation.y = angleY;
      mesh.material = mat;
      mesh.isPickable = false;
    }
  }
}
