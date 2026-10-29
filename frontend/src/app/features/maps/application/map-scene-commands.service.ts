import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoomWeaverStoreService } from '../../../core/services/loomweaver-store.service';
import { LwAlertifyService } from '../../../core/services/lw-alertify.service';
import {
  ChamberBuildIntent,
  PathRibbonBuildIntent,
  WallOpeningInsertIntent,
} from '../../../shared/ui/public-api';
import {
  MapPathRibbonNode,
  MapSceneGraphState,
  MapWallSegmentNode,
} from '../engine/map-scene-contract';
import { WallPolygonBuilder } from '../engine/walls/wall-polygon.builder';
import { MapCatalogAssetItem } from './map-studio.models';

@Injectable({ providedIn: 'root' })
export class MapSceneCommandsService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(LoomWeaverStoreService);
  private readonly alertify = inject(LwAlertifyService);

  applyToolStroke(
    cur: MapSceneGraphState,
    tool: string,
    px: number,
    pz: number,
    brushRadius: number,
    equipped: MapCatalogAssetItem | null,
  ): { nextGraph: MapSceneGraphState; newStampId?: string } {
    const nextRev = cur.revision + 1;
    let stamps = cur.stamps;
    let lights = cur.lights;
    let waterSplines = cur.waterSplines;
    let scatterSeed = cur.scatterSeed;
    let newStampId: string | undefined;

    if (tool === 'stamps' || tool === 'walls') {
      newStampId = `st-${nextRev}`;
      stamps = [
        ...cur.stamps,
        {
          id: newStampId,
          label:
            tool === 'walls'
              ? 'Obsidian Wall Segment'
              : (equipped?.name ?? 'Gothic Arch Stamp'),
          category: 'Architecture',
          x: px,
          z: pz,
          scale: equipped?.defaultScale ?? 1.15,
          rotationY: (nextRev % 6) * 0.5,
          colorHex: tool === 'walls' ? '#6c8796' : '#d4a853',
        },
      ];
    } else if (tool === 'lighting') {
      lights = [
        ...cur.lights,
        {
          id: `lt-${nextRev}`,
          label: `Brazier Point Light #${nextRev}`,
          x: px,
          y: 4.5,
          z: pz,
          range: Math.max(8, brushRadius * 3),
          intensity: 1.35,
          colorHex: '#ffae52',
        },
      ];
    } else if (tool === 'water') {
      const first = cur.waterSplines[0];
      if (first) {
        waterSplines = [{ ...first, points: [...first.points, [px, 0.14, pz]] }];
      }
    } else {
      scatterSeed = cur.scatterSeed + 31;
    }

    return {
      newStampId,
      nextGraph: {
        ...cur,
        revision: nextRev,
        scatterSeed,
        stamps,
        lights,
        waterSplines,
      },
    };
  }

  appendWallChamber(
    cur: MapSceneGraphState,
    intent: ChamberBuildIntent,
    centerX: number,
    centerZ: number,
    levelIndex: number,
  ): MapSceneGraphState {
    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) {
      this.alertify.notifyStatus('Map update', 'No campaign selected', 'Select a campaign before adding a wall.', 'crimson');
      return cur;
    }

    const nextRev = cur.revision + 1;
    const points = WallPolygonBuilder.generatePolygonVertices(
      intent.drawMode,
      centerX,
      centerZ,
      intent.widthMeters,
      intent.depthMeters,
    );

    const newWall: MapWallSegmentNode = {
      id: `wall-${nextRev}`,
      name: intent.name,
      drawMode: intent.drawMode,
      material: intent.material,
      thicknessMeters: intent.thicknessMeters,
      heightMeters: intent.heightMeters,
      perspective: intent.perspective,
      projection: intent.projection,
      hasCornerPosts: intent.hasCornerPosts,
      levelIndex,
      points,
      openings: [
        {
          id: `op-${nextRev}-1`,
          type: 'double_door',
          t: 0.5,
          widthMeters: 2.4,
          isOpen: true,
          isSecret: false,
          isRevealedToPlayers: true,
        },
      ],
    };

    this.http
      .post(`/api/v2/campaigns/${campaignId}/maps/${cur.sceneKey}/walls`, {
        ...intent,
        centerX,
        centerZ,
        levelIndex,
      })
      .subscribe({
        error: () => this.alertify.notifyStatus('Map update', 'Wall was not saved', 'The wall could not be saved to the selected campaign.', 'crimson'),
      });

    return {
      ...cur,
      revision: nextRev,
      walls: [...(cur.walls ?? []), newWall],
    };
  }

  appendWallOpening(
    cur: MapSceneGraphState,
    intent: WallOpeningInsertIntent,
  ): MapSceneGraphState {
    const campaignId = this.store.activeCampaignId();
    if (campaignId <= 0) {
      this.alertify.notifyStatus('Map update', 'No campaign selected', 'Select a campaign before adding a path.', 'crimson');
      return cur;
    }

    const nextRev = cur.revision + 1;
    const walls = (cur.walls ?? []).map((w) =>
      w.id === intent.wallId
        ? {
            ...w,
            openings: [
              ...w.openings,
              {
                id: `op-${nextRev}`,
                type: intent.openingType,
                t: intent.normalizedT,
                widthMeters: intent.widthMeters,
                isOpen: intent.isOpen,
                isSecret: intent.isSecret,
                isRevealedToPlayers: !intent.isSecret,
              },
            ],
          }
        : w,
    );
    return { ...cur, revision: nextRev, walls };
  }

  appendPathRibbon(
    cur: MapSceneGraphState,
    intent: PathRibbonBuildIntent,
    centerX: number,
    centerZ: number,
    levelIndex: number,
  ): MapSceneGraphState {
    const nextRev = cur.revision + 1;
    const waypoints: readonly (readonly [number, number])[] = [
      [-12, centerZ - 5],
      [centerX, centerZ],
      [12, centerZ + 5],
    ];

    const newRibbon: MapPathRibbonNode = {
      id: `path-${nextRev}`,
      name: intent.name,
      style: intent.style,
      widthMeters: intent.widthMeters,
      curveAngleDeg: intent.curveAngleDeg,
      cliffStrataBands: intent.cliffStrataBands,
      colorHex: intent.colorHex,
      levelIndex,
      waypoints,
    };

    this.http
      .post(`/api/v2/campaigns/${campaignId}/maps/${cur.sceneKey}/paths`, {
        ...intent,
        levelIndex,
        waypoints: waypoints.map((pt) => ({ x: pt[0], z: pt[1] })),
      })
      .subscribe({
        error: () => this.alertify.notifyStatus('Map update', 'Path was not saved', 'The path could not be saved to the selected campaign.', 'crimson'),
      });

    return {
      ...cur,
      revision: nextRev,
      pathRibbons: [...(cur.pathRibbons ?? []), newRibbon],
    };
  }
}
