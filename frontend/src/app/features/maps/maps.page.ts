import { MapWaterEditor } from './application/map-water-editor';
import {
  DEFAULT_LIGHT_SETTINGS,
  LightSettings,
  resolveLightSettings,
  snapLightElevation,
} from './engine/lighting/light-settings';
import { DEFAULT_WALL_BRUSH, WallBrushSettings, WallPaintDab } from './engine/walls/wall-surface.models';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdventureGuideService } from '../../core/services/adventure-guide.service';
import { LwAlertifyService } from '../../core/services/lw-alertify.service';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { WebAudioAmbienceService } from '../assets/engine/web-audio-ambience.service';
import { LwIconComponent } from '../../shared/ui/icon/icon.component';
import { LwMapAssetPickerModalComponent } from '../../shared/ui/map-asset-picker-modal/map-asset-picker-modal.component';
import {
  LwMapMaterialPreset,
  LwMapPngAssetItem,
} from '../../shared/ui/map-png-asset-browser/map-png-asset-browser.component';
import {
  LwCelestialBodyMode,
  LwMapPropertiesInspectorComponent,
  LwObjectPlacementMode,
  LwObjectSurfaceFinish,
  LwSelectedSceneNode,
  LwTerrainSculptOp,
} from '../../shared/ui/map-properties-inspector/map-properties-inspector.component';
import {
  LwApplyMarketplaceMapIntent,
  LwCreateMapLaunchIntent,
  LwExistingMapSummary,
  LwMapDimensionMode,
  LwMapStudioLandingComponent,
  LwMarketplaceMapItem,
} from '../../shared/ui/map-studio-landing/map-studio-landing.component';
import {
  LwMapStudioSubbarComponent,
  MapEditorModeTab,
} from '../../shared/ui/map-studio-subbar/map-studio-subbar.component';
import { LwMapToolDockComponent } from '../../shared/ui/map-tool-dock/map-tool-dock.component';
import {
  LwMapCameraView,
  LwMapQualityPreset,
  LwMapViewportBarComponent,
} from '../../shared/ui/map-viewport-bar/map-viewport-bar.component';
import { LwToastNotificationComponent } from '../../shared/ui/toast-notification/toast-notification.component';
import { MapHistoryEngineService } from './application/map-history-engine.service';
import { MapPngAssetApiService } from './application/map-png-asset-api.service';
import { MapStudioStoreService } from './application/map-studio-store.service';
import { MapStudioSnapshot } from './application/map-studio.models';
import {
  DoorHingeSide,
  DoorSidePostStyle,
  DoorSwingDirection,
  MapFloorBlendMode,
  MapScatterClusterNode,
  MapSceneGraphState,
  MapWallSegmentNode,
  WallDrawMode,
  WallOpeningNode,
} from './engine/map-scene-contract';
import { createBlankSceneGraph } from './engine/map-scene-defaults';
import { INITIAL_SELECTED_WALL_NODE } from './engine/map-asset-fallbacks';
import {
  BabylonMapStageService,
  GhostAssetConfig,
  PickedSceneEntityMeta,
} from './engine/rendering/babylon-map-stage.service';
import {
  lodTierForQualityPreset,
  studioPresetToVttQuality,
  vttQualityToStudioPreset,
} from './engine/rendering/glb-lod';
import { Real2dMapRenderer } from './engine/rendering/real-2d-map-renderer';
import { VttDisplaySettingsService } from '../arcane-screen/services/vtt-display-settings.service';
import { LwFloorSurfaceFinish, TerrainMeshBuilder } from './engine/terrain/terrain-mesh.builder';
import { WallMeshBuilder } from './engine/walls/wall-mesh.builder';
import {
  PROCEDURAL_DOOR_ASSET_ITEMS,
  PROCEDURAL_WALL_ASSET_ITEMS,
  resolveProceduralDoorStyle,
} from './engine/walls/procedural-wall-catalog';
import { snapToNearestWallFace } from './engine/walls/wall-sconce-attachment.helper';

@Component({
  selector: 'lw-maps-page',
  standalone: true,
  imports: [
    FormsModule,
    LwIconComponent,
    LwMapStudioLandingComponent,
    LwMapStudioSubbarComponent,
    LwMapToolDockComponent,
    LwMapViewportBarComponent,
    LwMapPropertiesInspectorComponent,
    LwMapAssetPickerModalComponent,
    LwToastNotificationComponent,
  ],
  templateUrl: './maps.page.html',
  styleUrl: './maps.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapsPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('babylonCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('real2dCanvas') private canvas2dRef?: ElementRef<HTMLCanvasElement>;

  private readonly pngApi = inject(MapPngAssetApiService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly alertify = inject(LwAlertifyService);
  readonly store = inject(LoomWeaverStoreService);
  readonly adventureGuide = inject(AdventureGuideService);
  readonly audio = inject(WebAudioAmbienceService);
  readonly stage = inject(BabylonMapStageService);
  readonly studio = inject(MapStudioStoreService);
  readonly history = inject(MapHistoryEngineService);
  readonly vttDisplay = inject(VttDisplaySettingsService);

  private readonly qualityPreferenceSync = effect(() => {
    const q = this.vttDisplay.mapQuality();
    const mappedPreset = vttQualityToStudioPreset(q) as LwMapQualityPreset;
    if (this.activeQuality() !== mappedPreset) {
      this.activeQuality.set(mappedPreset);
      this.stage.setQualityPreset(mappedPreset);
    }
  });

  readonly showLandingHub = signal<boolean>(true);
  readonly assetModalOpen = signal<boolean>(false);
  readonly dimensionMode = signal<LwMapDimensionMode>('3d');
  readonly leftDockCollapsed = signal<boolean>(false);
  readonly rightDockCollapsed = signal<boolean>(true);

  readonly mapTitle = signal<string>('Untitled Map');
  readonly gridCols = signal<number>(50);
  readonly gridRows = signal<number>(50);
  readonly studioMode = signal<MapEditorModeTab>('build');
  readonly activeDockToolId = signal<string>('select');
  readonly cameraView = signal<LwMapCameraView>('isometric');
  readonly activeTheme = signal<string>('Abandoned Crypt');
  readonly activeQuality = signal<LwMapQualityPreset>('Balanced 3D');
  readonly gridSizeLabel = signal<string>('5 ft');
  readonly snapEnabled = signal<boolean>(true);
  readonly showPlayerSafeOnly = signal<boolean>(false);

  readonly existingMaps = signal<readonly LwExistingMapSummary[]>([]);
  readonly marketplaceMaps = signal<readonly LwMarketplaceMapItem[]>([]);
  readonly campaigns = computed(() =>
    this.store.campaigns().map((c) => ({ id: c.id, name: c.name })),
  );
  readonly sessions = computed(() =>
    this.store.sessions().map((s) => ({ id: s.sessionId, label: s.label })),
  );
  readonly encounters = signal<readonly { id: string; label: string }[]>([]);
  readonly assignSessionId = computed(() => {
    const raw = this.store.activeSessionId();
    const list = this.sessions();
    return list.find((s) => s.id === raw)?.id ?? list[0]?.id ?? raw ?? '';
  });
  readonly assignEncounterId = signal<string>('');
  readonly assignLocationNodeId = signal<string>('');

  private readonly campaignAssignments = effect((onCleanup) => {
    const campaignId = this.store.activeCampaignId();
    const campName = this.store.activeCampaign().name || 'Active Campaign';
    const sessAttachments = this.store.sessionAttachments();
    const assignedMap = this.adventureGuide.guide().assignedBattlemap;
    this.encounters.set([]);
    this.assignEncounterId.set('');
    if (campaignId <= 0) return;

    this.syncLocalAndAttachmentMaps(campaignId, campName, sessAttachments, assignedMap);

    const mapsSub = this.http
      .get<
        readonly {
          sceneKey: string;
          name: string;
          campaignId: number;
          revision: number;
          gridCols: number;
          gridRows: number;
          floorAlbedoUrl?: string | null;
          updatedBy: string;
          updatedAt: string;
        }[]
      >(`/api/v2/campaigns/${campaignId}/maps`)
      .subscribe({
        next: (rows) => {
          const sessLabel =
            this.sessions().find((s) => s.id === this.assignSessionId())?.label ??
            'Current Session';
          const mapped: LwExistingMapSummary[] = (rows ?? []).map((r) => {
            const att = sessAttachments.find(
              (a) => a.elementKind === 'Map' && a.elementId === r.sceneKey,
            );
            const sessObj = att
              ? this.sessions().find((s) => s.id === att.sessionId)
              : undefined;
            return {
              sceneKey: r.sceneKey,
              name: r.name || att?.title || r.sceneKey,
              dimensionMode: '3d',
              campaignId: r.campaignId || campaignId,
              campaignName: campName,
              sessionLabel: sessObj?.label || att?.summary || sessLabel,
              encounterLabel: 'Campaign Battlemap',
              gridSummary: `${r.gridCols || 50}x${r.gridRows || 50} (5ft sq)`,
              floorBumpName: 'Saved Studio Scene',
              previewUrl: r.floorAlbedoUrl || att?.artworkUrl || '/battlemap-showcase.jpg',
              updatedLabel: `Saved Rev ${r.revision || 1}`,
              revision: r.revision || 1,
              creatorAccount: r.updatedBy || 'GM Studio',
              popularityRating: 'Saved Campaign Map',
              priceLabel: 'Campaign Map',
              accessKind: 'owned',
            };
          });
          this.mergeIntoExistingMaps(mapped);
          this.checkQuerySceneAutoOpen(campaignId);
        },
        error: () => {
          this.checkQuerySceneAutoOpen(campaignId);
        },
      });

    if (!this.store.isGmForActiveCampaign()) {
      onCleanup(() => mapsSub.unsubscribe());
      return;
    }

    const encounters = this.http
      .get<readonly { id: string; name: string }[]>(`/api/v2/campaigns/${campaignId}/encounters`)
      .subscribe({
        next: (items) => {
          const options = (items ?? []).map((item) => ({ id: item.id, label: item.name }));
          this.encounters.set(options);
          const cur = this.assignEncounterId();
          if (!options.some((o) => o.id === cur)) {
            this.assignEncounterId.set(options[0]?.id ?? '');
          }
        },
        error: () => this.alertify.notifyStatus('Map assignment', 'Encounters unavailable', 'Campaign encounters could not be loaded.', 'crimson'),
      });
    onCleanup(() => {
      mapsSub.unsubscribe();
      encounters.unsubscribe();
    });
  });

  private autoOpenedQueryScene = false;

  private syncLocalAndAttachmentMaps(
    campaignId: number,
    campName: string,
    sessAttachments: ReturnType<LoomWeaverStoreService['sessionAttachments']>,
    assignedMap: ReturnType<AdventureGuideService['guide']>['assignedBattlemap'],
  ): void {
    const sessLabel =
      this.sessions().find((s) => s.id === this.assignSessionId())?.label ?? 'Current Session';
    const localCached = this.studio.listLocalCachedScenes(campaignId).map(
      (c): LwExistingMapSummary => ({
        sceneKey: c.sceneKey,
        name: c.name,
        dimensionMode: '3d',
        campaignId,
        campaignName: campName,
        sessionLabel: sessLabel,
        encounterLabel: 'Campaign Battlemap',
        gridSummary: `${c.gridCols}x${c.gridRows} (5ft sq)`,
        floorBumpName: 'Saved Studio Scene',
        previewUrl: c.floorAlbedoUrl || '/battlemap-showcase.jpg',
        updatedLabel: `Saved Rev ${c.revision}`,
        revision: c.revision,
        creatorAccount: 'GM Studio',
        popularityRating: 'Saved Campaign Map',
        priceLabel: 'Campaign Map',
        accessKind: 'owned',
      }),
    );

    const attachmentMaps: LwExistingMapSummary[] = sessAttachments
      .filter((a) => a.elementKind === 'Map' && Boolean(a.elementId))
      .map((a) => {
        const sessObj = this.sessions().find((s) => s.id === a.sessionId);
        return {
          sceneKey: a.elementId,
          name: a.title || a.elementId,
          dimensionMode: '3d',
          campaignId,
          campaignName: campName,
          sessionLabel: sessObj?.label || a.summary || sessLabel,
          encounterLabel: a.subtitle || 'Session Battlemap',
          gridSummary: '50x50 (5ft sq)',
          floorBumpName: 'Session Map',
          previewUrl: a.artworkUrl || '/battlemap-showcase.jpg',
          updatedLabel: `Assigned to ${sessObj?.label || 'Session'}`,
          revision: 1,
          creatorAccount: 'GM Studio',
          popularityRating: 'Active Session Map',
          priceLabel: 'Campaign Map',
          accessKind: 'owned',
        };
      });

    const guideMaps: LwExistingMapSummary[] =
      assignedMap && assignedMap.sceneKey && assignedMap.sceneKey !== 'scene-ruined-chapel'
        ? [
            {
              sceneKey: assignedMap.sceneKey,
              name: assignedMap.title || assignedMap.sceneKey,
              dimensionMode: '3d',
              campaignId,
              campaignName: campName,
              sessionLabel: assignedMap.sessionTitle || sessLabel,
              encounterLabel: assignedMap.locationTitle || 'Session Battlemap',
              gridSummary: '50x50 (5ft sq)',
              floorBumpName: 'Assigned Battlemap',
              previewUrl: assignedMap.artworkUrl || '/battlemap-showcase.jpg',
              updatedLabel: `Assigned to ${assignedMap.sessionTitle || 'Session'}`,
              revision: 1,
              creatorAccount: 'GM Studio',
              popularityRating: 'Active Session Map',
              priceLabel: 'Campaign Map',
              accessKind: 'owned',
            },
          ]
        : [];

    this.mergeIntoExistingMaps([...localCached, ...attachmentMaps, ...guideMaps]);
  }

  private mergeIntoExistingMaps(incoming: readonly LwExistingMapSummary[]): void {
    if (!incoming.length) return;
    this.existingMaps.update((cur) => {
      const byKey = new Map<string, LwExistingMapSummary>();
      for (const m of cur) {
        byKey.set(m.sceneKey, m);
      }
      for (const item of incoming) {
        const prev = byKey.get(item.sceneKey);
        if (!prev || item.revision >= prev.revision) {
          byKey.set(item.sceneKey, prev ? { ...prev, ...item } : item);
        }
      }
      return Array.from(byKey.values());
    });
  }

  private checkQuerySceneAutoOpen(campaignId: number): void {
    if (this.autoOpenedQueryScene) return;
    const requestedScene = this.route?.snapshot?.queryParamMap?.get('scene')?.trim();
    if (!requestedScene) return;
    this.autoOpenedQueryScene = true;
    const existing = this.existingMaps().find((m) => m.sceneKey === requestedScene);
    if (existing) {
      this.onOpenExistingMapFromLanding(existing);
    } else {
      this.onOpenExistingMapFromLanding({
        sceneKey: requestedScene,
        name: requestedScene,
        dimensionMode: '3d',
        campaignId,
        campaignName: this.store.activeCampaign().name || 'Active Campaign',
        sessionLabel: 'Current Session',
        encounterLabel: 'Session Battlemap',
        gridSummary: '50x50 (5ft sq)',
        floorBumpName: 'Saved Studio Scene',
        previewUrl: '/battlemap-showcase.jpg',
        updatedLabel: 'Saved Scene',
        revision: 1,
        creatorAccount: 'GM Studio',
        popularityRating: 'Saved Campaign Map',
        priceLabel: 'Campaign Map',
        accessKind: 'owned',
      });
    }
  }

  readonly pngPipelineBanner = this.pngApi.pngPipelineBanner;
  readonly selectedPngAssetId = signal<string>('obj-4f9776736fb571f1');
  readonly selectedPlacedId = signal<string | null>(null);
  readonly selectedPlacedKind = signal<'wall' | 'door' | 'object' | 'light' | null>(null);
  readonly selectedPlacedWallId = signal<string | null>(null);
  readonly materials = signal<readonly LwMapMaterialPreset[]>([]);
  readonly selectedNode = signal<LwSelectedSceneNode>(INITIAL_SELECTED_WALL_NODE);

  readonly floorTilingScale = signal<number>(18);
  readonly floorBumpIntensity = signal<number>(135);
  readonly floorHeightScale = signal<number>(100);
  readonly floorSurfaceFinish = signal<LwFloorSurfaceFinish>('matte');
  readonly floorRoughness = signal<number>(82);
  readonly floorSpecularIntensity = signal<number>(22);
  readonly floorAmbientOcclusion = signal<number>(65);
  readonly floorColorHex = signal<string>('#ffffff');
  readonly floorColorStrength = signal<number>(0);
  readonly floorColorBlendMode = signal<MapFloorBlendMode>('multiply');

  readonly gridScalePct = signal<number>(100);
  readonly gridOffsetX = signal<number>(0);
  readonly gridOffsetZ = signal<number>(0);
  readonly gridOpacityPct = signal<number>(78);
  readonly activeTokenPreset = signal<string>('hero-5ft');
  readonly hasRefTokens = computed(() =>
    this.sceneGraph().stamps.some((s) => s.category === 'Token'),
  );
  readonly wallBrush = signal<WallBrushSettings>(DEFAULT_WALL_BRUSH);
  readonly wallTextureScale = signal<number>(100);
  readonly wallStretchX = signal<number>(100);
  readonly wallStretchY = signal<number>(100);
  readonly selectedWallSmoothing = computed(() =>
    this.sceneGraph().walls?.find(w => w.id === this.selectedPlacedId())?.terrainSmoothing ?? 75);
  private readonly wallBrushSync = effect(() => {
    const id = this.selectedPlacedKind() === 'wall' && this.activeDockToolId() === 'select'
      ? this.selectedPlacedId() : null;
    this.stage.wallBrush.settings = this.wallBrush();
    this.stage.wallBrush.wallId = id;
    if (!id || !this.wallBrush().active) this.stage.wallBrush.clearCursor();
    this.stage.wallBrush.onStroke = dabs => this.commitWallPaintStroke(id, dabs);
    this.syncSurfaceLock();
  });

  onWallSmoothingChange(terrainSmoothing: number): void {
    const id = this.selectedPlacedId();
    if (!id) return;
    this.recordHistoryBeforeEdit('Adjust wall terrain fit');
    this.commitSceneUpdate(cur => ({ ...cur, revision: cur.revision + 1,
      walls: cur.walls?.map(w => w.id === id ? { ...w, terrainSmoothing } : w) }));
  }

  onWallTextureScaleChange(scalePct: number): void {
    const clamped = Math.max(40, Math.min(260, Math.round(scalePct)));
    this.wallTextureScale.set(clamped);
    this.updateTargetWall((w) => ({ ...w, wallTextureScale: clamped }));
  }

  onWallStretchXChange(stretchPct: number): void {
    const clamped = Math.max(45, Math.min(220, Math.round(stretchPct)));
    this.wallStretchX.set(clamped);
    this.updateTargetWall((w) => ({ ...w, wallStretchX: clamped }));
  }

  onWallStretchYChange(stretchPct: number): void {
    const clamped = Math.max(45, Math.min(220, Math.round(stretchPct)));
    this.wallStretchY.set(clamped);
    this.updateTargetWall((w) => ({ ...w, wallStretchY: clamped }));
  }

  onClearSelectedWallPaint(): void {
    const id = this.selectedPlacedId();
    this.recordHistoryBeforeEdit('Clear Wall Grime Paint');
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      walls: (cur.walls ?? []).map((w) =>
        !id || w.id === id ? { ...w, paintDabs: [] } : w,
      ),
    }));
  }

  private commitWallPaintStroke(id: string | null, dabs: readonly WallPaintDab[]): void {
    if (!id || !dabs.length) return;
    this.recordHistoryBeforeEdit('Paint selected wall surface');
    const floorDabs = this.stage.exportFloorPaintDabs();
    this.sceneGraph.update((cur) => {
      const updated: MapSceneGraphState = {
        ...cur,
        revision: cur.revision + 1,
        floorPaintDabs: floorDabs,
        walls: cur.walls?.map((w) =>
          w.id === id ? { ...w, paintDabs: [...(w.paintDabs ?? []), ...dabs] } : w,
        ),
      };
      this.stage.updateLightsOnly(updated);
      return updated;
    });
    if (this.dimensionMode() === '2d') {
      this.render2dViewport();
    }
  }

  readonly floorBrushActive = signal<boolean>(false);
  readonly floorBrushColorHex = signal<string>('#3b7a47');
  readonly floorBrushBlendMode = signal<MapFloorBlendMode>('multiply');
  readonly floorBrushOpacity = signal<number>(35);
  readonly floorBrushRadius = signal<number>(3.0);
  readonly floorBrushSharpness = signal<number>(22);
  private lastFloorPaintPos: { x: number; z: number } | null = null;
  readonly wallDrawMode = signal<WallDrawMode>('line');
  readonly wallStartAnchor = signal<{ x: number; z: number } | null>(null);
  readonly freehandWallPoints = signal<readonly (readonly [number, number])[]>([]);

  readonly terrainSculptOp = signal<LwTerrainSculptOp>('raise');
  readonly terrainBrushRadius = signal<number>(4.5);
  readonly terrainBrushDelta = signal<number>(0.5);
  readonly terrainGradualRate = signal<number>(20);
  readonly terrainFeathering = signal<number>(80);
  readonly terrainPlateauLimit = signal<number>(5.5);

  private userSelectedWallAsset: LwMapPngAssetItem | null = null;
  private userSelectedDoorAsset: LwMapPngAssetItem | null = null;
  private userSelectedObjectAsset: LwMapPngAssetItem | null = null;
  private userSelectedFloorAsset: LwMapPngAssetItem | null = null;

  readonly doorWallPositionPct = signal<number>(50);
  readonly doorWidthMeters = signal<number>(2.4);
  readonly doorHeightMeters = signal<number>(2.4);
  readonly doorMaxHeightMeters = computed<number>(() => {
    const wallId = this.selectedPlacedWallId();
    const walls = this.sceneGraph().walls ?? [];
    const targetWall = wallId ? walls.find((w) => w.id === wallId) : walls[walls.length - 1];
    return Math.max(2.4, targetWall?.heightMeters ?? this.selectedNode().heightSquares * 1.5);
  });
  readonly doorIsOpen = signal<boolean>(false);
  readonly doorHingeSide = signal<DoorHingeSide>('left');
  readonly doorSwingDirection = signal<DoorSwingDirection>('inward');
  readonly doorHasSidePosts = signal<boolean>(false);
  readonly doorSidePostStyle = signal<DoorSidePostStyle>('quoin');
  readonly doorSidePostScale = signal<number>(1.0);

  readonly wallCornerPosts = signal<boolean>(false);
  readonly wallCornerPostScale = signal<number>(1.0);

  readonly celestialMode = signal<LwCelestialBodyMode>('sun');
  readonly celestialAzimuthDeg = signal<number>(135);
  readonly celestialAltitudeDeg = signal<number>(42);
  readonly shadowDarkness = signal<number>(72);

  /** Defaults for the next placed light; mirrors the selected light while one is selected. */
  readonly lightDraft = signal<LightSettings>(DEFAULT_LIGHT_SETTINGS);

  readonly scatterDensity = signal<number>(65);
  readonly scatterScale = signal<number>(2.8);
  readonly scatterScaleJitterPct = signal<number>(20);
  readonly scatterRotationDeg = signal<number>(0);
  readonly scatterRotationJitterDeg = signal<number>(360);
  readonly objectRandomRotationDeg = signal<number>(0);
  readonly objectRandomScalePct = signal<number>(0);
  private previewedObjectRotationDeg: number | null = null;
  private previewedObjectScaleFactor = 1.0;
  private userCustomizedObjectScale = false;
  readonly waterEditor = new MapWaterEditor(
    () => this.sceneGraph(), update => this.commitSceneUpdate(update),
    label => this.recordHistoryBeforeEdit(label), (x,z) => this.stage.sampleWaterBankElevation(x,z),
  );
  readonly waterWidthMeters = computed(() => this.waterEditor.settings().width);
  private lastScatterPaintPos: { x: number; z: number } | null = null;

  readonly selectedSceneKey = signal<string>('scene-forgotten-crypt');
  readonly sceneGraph = signal<MapSceneGraphState>(createBlankSceneGraph('Untitled Scene'));

  private isWallAsset(a: LwMapPngAssetItem): boolean {
    const n = a.name.toLowerCase();
    const c = a.category.toLowerCase();
    return (
      !a.isFloor &&
      (a.id === 'obj-4f9776736fb571f1' ||
        n.includes('wall') ||
        n.includes('brick') ||
        n.includes('fence') ||
        n.includes('palisade') ||
        n.includes('barrier') ||
        n.includes('rampart') ||
        n.includes('battlement') ||
        n.includes('buttress') ||
        n.includes('modular') ||
        n.includes('dungeon tile') ||
        c.includes('wall'))
    );
  }

  private isDoorAsset(a: LwMapPngAssetItem): boolean {
    const n = a.name.toLowerCase();
    return (
      !a.isFloor &&
      Boolean(a.modelUrl) &&
      (n.includes('door') ||
        n.includes('gate') ||
        n.includes('archway') ||
        n.includes('entry') ||
        n.includes('passage') ||
        n.includes('portal') ||
        n.includes('portcullis')) &&
      !n.includes('archer')
    );
  }

  readonly displayedAssets = computed<readonly LwMapPngAssetItem[]>(() => {
    const rawTool = this.activeDockToolId();
    const placedKind = this.selectedPlacedKind();
    const effectiveTool =
      rawTool === 'select' && placedKind
        ? placedKind === 'wall'
          ? 'wall'
          : placedKind === 'door'
            ? 'door'
            : 'objects'
        : rawTool;

    const all3d = this.pngApi
      .pngAssets3d()
      .filter(
        (a) =>
          !a.isFloor &&
          !a.modelUrl?.startsWith('proc-wall://') &&
          !a.modelUrl?.startsWith('proc-door://') &&
          !a.id.startsWith('proc-wall-') &&
          !a.id.startsWith('door-style-'),
      );
    const all2d = this.pngApi.bumpHeightAssets2d();

    if (effectiveTool === 'floor-bump') {
      return all2d.filter((a) => a.isFloor);
    }
    if (effectiveTool === 'wall' || effectiveTool === 'room') {
      const walls3d = all3d
        .filter((a) => a.isWall || a.toolRole === 'wall-3d' || this.isWallAsset(a))
        .sort((x, y) =>
          x.id === 'obj-4f9776736fb571f1' ? -1 : y.id === 'obj-4f9776736fb571f1' ? 1 : 0,
        );
      const walls2d = all2d.filter(
        (a) => a.isWall || a.toolRole === 'wall-texture' || this.isWallAsset(a),
      );
      const combined = [...walls3d, ...walls2d];
      return combined.length > 0 ? combined : [...all3d, ...all2d];
    }
    if (effectiveTool === 'door') {
      return all3d.filter((a) => a.isDoor || a.toolRole === 'door-3d' || this.isDoorAsset(a));
    }
    if (effectiveTool === 'scatter') {
      const scatterList = all3d
        .filter(
          (a) =>
            a.isScatter ||
            a.toolRole === 'scatter-3d' ||
            a.matVisTool === 'randon_stamp' ||
            a.category === 'Nature' ||
            a.category === 'Rocks & Cliffs',
        )
        .sort((x, y) => {
          const xScat = x.isScatter || x.matVisTool === 'randon_stamp' ? 1 : 0;
          const yScat = y.isScatter || y.matVisTool === 'randon_stamp' ? 1 : 0;
          return yScat - xScat;
        });
      return scatterList.length > 0 ? scatterList : all3d;
    }
    if (this.dimensionMode() === '2d') {
      return all2d.filter((a) => !a.isFloor);
    }
    return [...all3d, ...all2d.filter((a) => !a.isFloor)];
  });

  readonly displayedCategories = computed<readonly string[]>(() => {
    const list = this.displayedAssets();
    const cats = new Set<string>(['All']);
    for (const a of list) {
      if (a.category) cats.add(a.category);
    }
    return Array.from(cats);
  });

  readonly show3dCanvas = computed(() => true);
  readonly show2dCanvas = computed(() => false);

  @HostListener('window:keydown.escape')
  onEscapePressed(): void {
    if (this.assetModalOpen()) {
      this.assetModalOpen.set(false);
      return;
    }
    this.cancelActivePlacement();
  }

  ngAfterViewInit(): void {
    this.audio.pause();
    if (!this.showLandingHub()) {
      this.pngApi.ensureManifestLoaded();
      this.studio.ensureStudioResourcesLoaded();
    }
  }

  ngOnDestroy(): void {
    this.stage.dispose();
  }

  cancelActivePlacement(): void {
    if (this.wallStartAnchor() || this.freehandWallPoints().length > 0) {
      this.wallStartAnchor.set(null);
      this.freehandWallPoints.set([]);
      this.syncGhostCursorToStage();
      this.pngPipelineBanner.set('Canceled wall placement.');
      return;
    }
    this.selectedPlacedId.set(null);
    this.selectedPlacedKind.set(null);
    this.selectedPlacedWallId.set(null);
    this.stage.focusGizmoAt(null);
    this.activeDockToolId.set('select');
    this.syncSurfaceLock();
    this.syncGhostCursorToStage();
  }

  private viewportMountTimer: ReturnType<typeof setTimeout> | null = null;

  private mountStudioViewports(): void {
    this.pngApi.ensureManifestLoaded();
    this.studio.ensureStudioResourcesLoaded();
    if (this.viewportMountTimer !== null) {
      clearTimeout(this.viewportMountTimer);
    }
    this.viewportMountTimer = setTimeout(() => {
      this.viewportMountTimer = null;
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        this.stage.mountCanvas(
          canvas,
          this.sceneGraph(),
          (x, z, pickedMeta) => this.applyCanvasStrokeAt(x, z, pickedMeta),
          (hx, hz) => this.onCanvasHoverAt(hx, hz),
          (dx, dz, holdTicks) => this.onSurfaceDragAt(dx, dz, holdTicks),
          (rx, rz) => this.onSurfaceReleaseAt(rx, rz),
          () => { if(this.activeDockToolId() === 'water') this.waterEditor.beginStroke(); },
        );
        this.stage.setQualityPreset(this.activeQuality());
        this.stage.setCameraMode(this.cameraView());
        this.stage.configureGrid(
          {
            mode: this.gridSizeLabel(),
            scaleFactor: this.gridScalePct() / 100,
            offsetX: this.gridOffsetX(),
            offsetZ: this.gridOffsetZ(),
            opacity: this.gridOpacityPct() / 100,
          },
          true,
        );
        this.wireLightDrag();
        this.wireStampDrag();
        this.syncSurfaceLock();
        this.syncGhostCursorToStage();
        this.pushCelestialLightToStage();
      }
      this.render2dViewport();
    }, 35);
  }

  private syncSurfaceLock(): void {
    const tool = this.activeDockToolId();
    const isFreehandWall =
      (tool === 'wall' || tool === 'room') && this.wallDrawMode() === 'freehand';
    const isFloorBrush = tool === 'floor-bump' && this.floorBrushActive();
    const shouldLockSurface =
      tool === 'terrain' ||
      tool === 'water' ||
      tool === 'scatter' ||
      isFreehandWall ||
      isFloorBrush || (tool === 'select' && this.selectedPlacedKind() === 'wall' && this.wallBrush().active);
    this.stage.setSurfaceDrawingLock(shouldLockSurface);
  }

  onCreateMapFromLanding(intent: LwCreateMapLaunchIntent): void {
    this.mapTitle.set(intent.name);
    this.studio.mapTitle.set(intent.name);
    const targetSquares = Math.max(15, Math.min(120, intent.gridCols || 50));
    const derivedScalePct = Math.max(
      40,
      Math.min(250, Math.round((TerrainMeshBuilder.BASE_GRID_SQUARES / targetSquares) * 100)),
    );
    this.gridScalePct.set(derivedScalePct);
    this.gridCols.set(targetSquares);
    this.gridRows.set(targetSquares);
    if (intent.campaignId !== this.store.activeCampaignId()) {
      this.store.setCampaign(intent.campaignId);
    }

    const validSessionId =
      this.sessions().find((s) => s.id === intent.sessionId)?.id ??
      this.sessions()[0]?.id ??
      intent.sessionId;
    if (validSessionId) {
      this.store.setActiveSession(validSessionId);
    }
    const validEncounterId =
      this.encounters().find((e) => e.id === intent.encounterId)?.id ??
      this.encounters()[0]?.id ??
      intent.encounterId;
    this.assignEncounterId.set(validEncounterId);
    this.dimensionMode.set(intent.dimensionMode);
    this.cameraView.set(intent.dimensionMode === '2d' ? 'real-2d' : 'isometric');

    const starterFloor = this.pngApi
      .bumpHeightAssets2d()
      .find((f) => f.id === intent.starterFloorBumpId && f.isFloor);

    this.stage.resetTerrainElevations();
    const blank = createBlankSceneGraph(intent.name);
    this.selectedSceneKey.set(blank.sceneKey);
    this.sceneGraph.set({
      ...blank,
      gridScalePct: this.gridScalePct(),
      gridCols: this.gridCols(),
      gridRows: this.gridRows(),
      gridMode: this.gridSizeLabel(),
      floorAlbedoUrl: starterFloor?.albedoUrl,
      floorNormalUrl: starterFloor?.normalUrl,
      floorHeightUrl: starterFloor?.heightUrl,
      floorTilingScale: this.floorTilingScale(),
    });
    this.selectedPlacedId.set(null);
    this.selectedPlacedKind.set(null);
    this.wallStartAnchor.set(null);
    this.freehandWallPoints.set([]);
    this.activeDockToolId.set('select');
    this.leftDockCollapsed.set(false);
    this.rightDockCollapsed.set(true);
    this.showLandingHub.set(false);
    this.mountStudioViewports();
  }

  onApplyMarketplaceMap(intent: LwApplyMarketplaceMapIntent): void {
    const mkt = intent.marketMap;
    const campaignObj =
      this.campaigns().find((c) => c.id === intent.campaignId) ?? {
        id: intent.campaignId,
        name: 'Untitled Campaign',
      };
    const sessionObj =
      this.sessions().find((s) => s.id === intent.sessionId) ?? this.sessions()[0];
    const encounterObj =
      this.encounters().find((e) => e.id === intent.encounterId) ?? this.encounters()[0];

    const summary: LwExistingMapSummary = {
      sceneKey: mkt.sceneKey,
      name: mkt.name,
      dimensionMode: mkt.dimensionMode,
      campaignId: campaignObj.id,
      campaignName: campaignObj.name,
      sessionLabel: sessionObj?.label ?? 'Current Session',
      encounterLabel: encounterObj?.label ?? 'Campaign Battlemap',
      gridSummary: mkt.gridSummary,
      floorBumpName: mkt.floorBumpName,
      previewUrl: mkt.previewUrl,
      updatedLabel: `Applied from Marketplace · ${mkt.creatorAccount}`,
      revision: 1,
      creatorAccount: mkt.creatorAccount,
      popularityRating: `${mkt.popularityRating} · ${mkt.tablesRunLabel}`,
      priceLabel: mkt.accessKind === 'free' ? 'Free Market Map' : mkt.priceLabel,
      accessKind: mkt.accessKind,
    };

    this.existingMaps.update((cur) => [
      summary,
      ...cur.filter((m) => m.sceneKey !== summary.sceneKey),
    ]);

    const validSessionId =
      this.sessions().find((s) => s.id === intent.sessionId)?.id ??
      this.sessions()[0]?.id ??
      intent.sessionId;
    if (validSessionId) {
      this.store.setActiveSession(validSessionId);
    }
    const validEncounterId =
      this.encounters().find((e) => e.id === intent.encounterId)?.id ??
      this.encounters()[0]?.id ??
      intent.encounterId;
    this.assignEncounterId.set(validEncounterId);
    this.onOpenExistingMapFromLanding(summary);
    this.pngPipelineBanner.set(
      `Applied '${mkt.name}' (${mkt.creatorAccount}) to ${sessionObj?.label ?? 'current session'}.`,
    );
  }

  onPurchaseMarketplaceMap(item: LwMarketplaceMapItem): void {
    this.marketplaceMaps.update((cur) =>
      cur.map((m) =>
        m.id === item.id
          ? {
              ...m,
              accessKind: 'purchased',
              priceLabel: `Purchased ($${item.priceUsd.toFixed(2)})`,
            }
          : m,
      ),
    );
  }

  onAssignExistingMapToSession(evt: { map: LwExistingMapSummary; sessionId: string }): void {
    const { map, sessionId } = evt;
    const sessObj = this.sessions().find((s) => s.id === sessionId) ?? this.sessions()[0];
    const resolvedSessionId = sessObj?.id || sessionId || this.store.activeSessionId() || 'session-1';
    const sessLabel =
      sessObj?.label ||
      this.store.activeSession()?.label ||
      this.store.activeSession()?.title ||
      'Selected Session';

    this.store.setActiveSession(resolvedSessionId);
    this.adventureGuide.assignBattlemapToSessionAndPlace({
      sceneKey: map.sceneKey,
      sceneTitle: map.name,
      sessionId: resolvedSessionId,
      sessionTitle: sessLabel,
      locationNodeId: this.assignLocationNodeId() || '',
      locationTitle: map.encounterLabel || 'Session Battlemap',
      artworkUrl: map.previewUrl || '/battlemap-showcase.jpg',
      biome: map.floorBumpName || 'Custom Map',
    });
    this.store.attachElementToSession({
      sessionId: resolvedSessionId,
      elementKind: 'Map',
      targetKey: map.sceneKey,
      title: map.name,
      subtitle: `${map.dimensionMode.toUpperCase()} Battlemap · ${map.floorBumpName}`,
      summary: `${sessLabel} · ${map.encounterLabel}`,
      routeLink: `/arcane-screen?scene=${map.sceneKey}`,
      visibility: 'players',
      artworkUrl: map.previewUrl || '/battlemap-showcase.jpg',
    });
    this.existingMaps.update((cur) =>
      cur.map((m) =>
        m.sceneKey === map.sceneKey
          ? {
              ...m,
              sessionLabel: sessLabel,
              updatedLabel: `Assigned to ${sessLabel}`,
            }
          : m,
      ),
    );
    this.pngPipelineBanner.set(`Assigned '${map.name}' directly to ${sessLabel}.`);
  }

  onOpenExistingMapFromLanding(summary: LwExistingMapSummary): void {
    this.selectedSceneKey.set(summary.sceneKey);
    this.mapTitle.set(summary.name);
    this.studio.mapTitle.set(summary.name);
    this.store.setCampaign(summary.campaignId);
    this.dimensionMode.set(summary.dimensionMode);
    this.cameraView.set(summary.dimensionMode === '2d' ? 'real-2d' : 'isometric');
    this.stage.resetTerrainElevations();
    this.stage.clearFloorPaint();
    this.sceneGraph.set(createBlankSceneGraph(summary.name, summary.sceneKey));
    this.selectedPlacedId.set(null);
    this.selectedPlacedKind.set(null);
    this.wallStartAnchor.set(null);
    this.freehandWallPoints.set([]);
    this.activeDockToolId.set('select');
    this.leftDockCollapsed.set(false);
    this.rightDockCollapsed.set(true);
    this.showLandingHub.set(false);
    this.mountStudioViewports();
    this.studio.loadSceneDocument(summary.campaignId, summary.sceneKey, (document) => {
      if (!document.customElevations || document.customElevations.length === 0) {
        this.stage.resetTerrainElevations();
      }
      if (!document.floorPaintDabs || document.floorPaintDabs.length === 0) {
        this.stage.clearFloorPaint();
      }
      this.sceneGraph.set(document);
      this.mapTitle.set(document.name);
      this.studio.mapTitle.set(document.name);
      if (document.gridScalePct !== undefined && document.gridScalePct > 0) {
        this.gridScalePct.set(document.gridScalePct);
      }
      if (document.gridCols !== undefined && document.gridCols > 0) {
        this.gridCols.set(document.gridCols);
        this.gridRows.set(document.gridRows ?? document.gridCols);
      } else if (document.gridScalePct !== undefined && document.gridScalePct > 0) {
        const sq = Math.max(
          15,
          Math.round(TerrainMeshBuilder.BASE_GRID_SQUARES / (document.gridScalePct / 100)),
        );
        this.gridCols.set(sq);
        this.gridRows.set(sq);
      }
      if (document.gridMode !== undefined) {
        this.gridSizeLabel.set(document.gridMode);
      }
      if (document.gridOffsetX !== undefined) {
        this.gridOffsetX.set(document.gridOffsetX);
      }
      if (document.gridOffsetZ !== undefined) {
        this.gridOffsetZ.set(document.gridOffsetZ);
      }
      if (document.gridOpacityPct !== undefined) {
        this.gridOpacityPct.set(document.gridOpacityPct);
      }
      this.stage.configureGrid(
        {
          mode: this.gridSizeLabel(),
          scaleFactor: this.gridScalePct() / 100,
          offsetX: this.gridOffsetX(),
          offsetZ: this.gridOffsetZ(),
          opacity: this.gridOpacityPct() / 100,
        },
        true,
      );
      this.stage.syncSceneGraph(document);
      this.render2dViewport();
    });
  }

  onDimensionModeSwitch(mode: LwMapDimensionMode): void {
    this.dimensionMode.set(mode);
    this.onCameraViewChange(mode === '2d' ? 'real-2d' : 'isometric');
    if (mode === '3d') this.mountStudioViewports();
  }

  onDockToolSelected(dockToolId: string): void {
    this.activeDockToolId.set(dockToolId);
    this.rightDockCollapsed.set(false);
    this.wallStartAnchor.set(null);
    this.freehandWallPoints.set([]);
    this.waterEditor.finish();

    if (dockToolId !== 'select') {
      this.selectedPlacedId.set(null);
      this.selectedPlacedKind.set(null);
      this.selectedPlacedWallId.set(null);
      this.stage.focusGizmoAt(null);
    }
    if (dockToolId === 'room') {
      if (this.wallDrawMode() === 'line' || this.wallDrawMode() === 'freehand') {
        this.wallDrawMode.set('room');
      }
    } else if (dockToolId === 'wall') {
      this.wallDrawMode.set('line');
    }

    if (dockToolId === 'floor-bump') {
      const floorAsset =
        this.userSelectedFloorAsset ??
        this.pngApi.bumpHeightAssets2d().find((a) => a.isFloor);
      if (floorAsset) this.equipAssetOnNode(floorAsset);
    } else if (dockToolId === 'wall' || dockToolId === 'room') {
      const defaultStoneWall: LwMapPngAssetItem =
        this.userSelectedWallAsset ??
        this.pngApi.pngAssets3d().find((a) => a.id === 'obj-4f9776736fb571f1') ??
        this.pngApi.pngAssets3d().find((a) => this.isWallAsset(a) && !a.modelUrl?.startsWith('proc-wall://')) ?? {
          id: 'obj-4f9776736fb571f1',
          name: 'A Wall Made Of Stone',
          category: 'Architecture',
          thumbnailUrl: '/assets/previews-png/obj-4f9776736fb571f1.png',
          modelUrl: '/assets/object-library/models/obj-4f9776736fb571f1.glb',
          isFloor: false,
          isWall: true,
          toolRole: 'wall-3d',
        };
      this.userSelectedWallAsset = defaultStoneWall;
      this.equipAssetOnNode(defaultStoneWall);
    } else if (dockToolId === 'door') {
      const doorAsset: LwMapPngAssetItem =
        this.userSelectedDoorAsset ??
        this.pngApi
          .pngAssets3d()
          .find((a) => (a.isDoor || this.isDoorAsset(a)) && !a.modelUrl?.startsWith('proc-door://')) ?? {
          id: 'obj-89c62a2b01238531',
          name: 'Gothic Arch Door (3D GLB)',
          category: 'Architecture',
          isDoor: true,
          toolRole: 'door-3d',
          modelUrl: '/assets/object-library/models/obj-89c62a2b01238531.glb',
          thumbnailUrl: '/assets/previews-png/obj-89c62a2b01238531.png',
        };
      this.userSelectedDoorAsset = doorAsset;
      this.equipAssetOnNode(doorAsset);
    } else if (dockToolId === 'objects' || dockToolId === 'scatter') {
      const wantScatter = dockToolId === 'scatter';
      const currentOk =
        this.userSelectedObjectAsset &&
        (!wantScatter ||
          this.userSelectedObjectAsset.isScatter ||
          this.userSelectedObjectAsset.matVisTool === 'randon_stamp' ||
          this.userSelectedObjectAsset.category.toLowerCase().includes('nature'));
      const objAsset =
        (currentOk ? this.userSelectedObjectAsset : null) ??
        this.pngApi
          .pngAssets3d()
          .find(
            (a) =>
              !a.isFloor &&
              !this.isWallAsset(a) &&
              !this.isDoorAsset(a) &&
              (!wantScatter ||
                a.isScatter ||
                a.matVisTool === 'randon_stamp' ||
                a.toolRole === 'scatter-3d' ||
                a.category.toLowerCase().includes('nature')),
          ) ??
        this.pngApi
          .pngAssets3d()
          .find((a) => !a.isFloor && !this.isWallAsset(a) && !this.isDoorAsset(a)) ??
        this.pngApi.pngAssets3d()[0];
      if (objAsset) {
        this.userSelectedObjectAsset = objAsset;
        this.equipAssetOnNode(objAsset);
      }
    }

    this.syncSurfaceLock();
    this.pushCelestialLightToStage();
    this.syncGhostCursorToStage();
  }

  private equipAssetOnNode(asset: LwMapPngAssetItem): void {
    this.selectedPngAssetId.set(asset.id);
    const activeTool = this.activeDockToolId();
    const isWall = Boolean(
      activeTool === 'wall' ||
        activeTool === 'room' ||
        asset.isWall ||
        asset.toolRole === 'wall-texture' ||
        asset.toolRole === 'wall-3d' ||
        this.isWallAsset(asset),
    );
    const isDoor = Boolean(
      activeTool === 'door' ||
        asset.isDoor ||
        asset.toolRole === 'door-3d' ||
        this.isDoorAsset(asset),
    );
    const activeTier = lodTierForQualityPreset(this.activeQuality());
    const tierVar = asset.lodVariants?.[activeTier];
    const defaultGrid = tierVar?.defaultScaleGrid ?? asset.defaultScaleGrid ?? [1, 1, 1];
    const tierStampScale =
      typeof tierVar?.stampScale === 'number' && tierVar.stampScale > 0 ? tierVar.stampScale : 1.0;
    const hasPlacedSelection = this.selectedPlacedId() !== null;
    const lowerName = asset.name.toLowerCase();
    const lowerCat = asset.category.toLowerCase();
    const isLargePropOrNature =
      !isWall &&
      !isDoor &&
      !asset.isFloor &&
      (lowerCat.includes('nature') ||
        lowerName.includes('tree') ||
        lowerName.includes('rock') ||
        lowerName.includes('boulder') ||
        lowerName.includes('mushroom') ||
        lowerName.includes('bush') ||
        lowerName.includes('statue') ||
        lowerName.includes('fountain') ||
        lowerName.includes('wagon') ||
        lowerName.includes('cart') ||
        lowerName.includes('tent'));
    const defaultPropScale =
      (isWall || isDoor ? 1.0 : isLargePropOrNature ? 2.5 : 1.6) * tierStampScale;
    this.selectedNode.update((cur) => ({
      ...cur,
      id: asset.id,
      materialId: asset.id,
      name: asset.name,
      kind: isDoor ? 'door' : isWall ? 'wall' : 'prop',
      subtitle: isWall
        ? asset.modelUrl
          ? `3D Wall Stamp · ${asset.category}`
          : `Procedural 3D Relief Wall · ${asset.category}`
        : asset.modelUrl
          ? `3D Asset · ${asset.category}`
          : asset.isFloor
            ? 'Seamless 2D Bump/Height Flooring'
            : `2D Floor Stamp · ${asset.category}`,
      thumbnailUrl: asset.thumbnailUrl,
      modelUrl: asset.modelUrl || undefined,
      albedoUrl: asset.albedoUrl,
      normalUrl: asset.normalUrl,
      heightUrl: asset.heightUrl,
      isFloor: asset.isFloor,
      placementMode: hasPlacedSelection ? cur.placementMode : (asset.defaultPlacement ?? 'floor'),
      elevationY: hasPlacedSelection
        ? cur.elevationY
        : isWall
          ? cur.kind === 'wall'
            ? cur.elevationY
            : -0.06
          : 0,
      connectionOverlap: cur.connectionOverlap ?? 15,
      scale: hasPlacedSelection || (this.userCustomizedObjectScale && !isWall && !isDoor)
        ? cur.scale
        : defaultPropScale,
      scaleX: hasPlacedSelection ? cur.scaleX : defaultGrid[0],
      scaleY: hasPlacedSelection ? cur.scaleY : defaultGrid[1],
      scaleZ: hasPlacedSelection ? cur.scaleZ : defaultGrid[2],
      colorHex: hasPlacedSelection ? cur.colorHex : (asset.defaultColorTint ?? '#ffffff'),
    }));
    if (asset.modelUrl) {
      this.stage.preloadModel(
        asset.modelUrl,
        activeTool === 'scatter' || Boolean(asset.isScatter),
      );
    }
  }

  onInspectorMaterialChange(styleId: string): void {
    const wallAsset = PROCEDURAL_WALL_ASSET_ITEMS.find((a) => a.id === styleId);
    if (wallAsset) {
      this.onSelectPngAsset(wallAsset);
      return;
    }
    const doorAsset = PROCEDURAL_DOOR_ASSET_ITEMS.find((a) => a.id === styleId);
    if (doorAsset) {
      this.onSelectPngAsset(doorAsset);
    }
  }

  onSelectPngAsset(asset: LwMapPngAssetItem): void {
    const activeTool = this.activeDockToolId();
    const placedKind = this.selectedPlacedKind();
    const placedId = this.selectedPlacedId();

    if (asset.isFloor) {
      this.userSelectedFloorAsset = asset;
    } else if (activeTool === 'wall' || activeTool === 'room' || placedKind === 'wall') {
      this.userSelectedWallAsset = asset;
    } else if (activeTool === 'door' || placedKind === 'door') {
      this.userSelectedDoorAsset = asset;
    } else {
      this.userSelectedObjectAsset = asset;
    }

    this.equipAssetOnNode(asset);

    if (asset.isFloor && asset.albedoUrl && asset.normalUrl) {
      this.applyFloorTextureToScene(asset.name, asset.albedoUrl, asset.normalUrl, asset.heightUrl);
      return;
    }

    // If a placed Wall, Door, or Object is currently selected, live-swap its 3D asset AND update the active tool ghost!
    if (placedId && placedKind === 'wall') {
      this.commitSceneUpdate((cur) => ({
        ...cur,
        revision: cur.revision + 1,
        walls: (cur.walls ?? []).map((w) =>
          w.id === placedId
            ? {
                ...w,
                name: asset.name,
                material: asset.id,
                modelUrl: asset.modelUrl || undefined,
                albedoUrl: asset.albedoUrl,
                normalUrl: asset.normalUrl,
                thumbnailUrl: asset.thumbnailUrl,
              }
            : w,
        ),
      }));
      this.pngPipelineBanner.set(`Updated Wall Style -> ${asset.name}`);
      this.syncGhostCursorToStage();
      return;
    }
    if (placedId && placedKind === 'door') {
      const doorSpec = resolveProceduralDoorStyle({
        name: asset.name,
        modelUrl: asset.modelUrl,
      });
      this.commitSceneUpdate((cur) => ({
        ...cur,
        revision: cur.revision + 1,
        walls: (cur.walls ?? []).map((w) => ({
          ...w,
          openings: w.openings.map((op) =>
            op.id === placedId
              ? {
                  ...op,
                  name: asset.name,
                  doorStyle: asset.modelUrl?.startsWith('proc-door://') ? doorSpec.style : undefined,
                  modelUrl: asset.modelUrl || undefined,
                  thumbnailUrl: asset.thumbnailUrl,
                }
              : op,
          ),
        })),
      }));
      this.pngPipelineBanner.set(`Updated Door Style -> ${asset.name}`);
      this.syncGhostCursorToStage();
      return;
    }
    if (placedId && placedKind === 'object') {
      if (activeTool === 'select') {
        const isDecal = Boolean(asset.albedoUrl && !asset.modelUrl && !asset.isFloor);
        this.commitSceneUpdate((cur) => ({
          ...cur,
          revision: cur.revision + 1,
          stamps: cur.stamps.map((s) =>
            s.id === placedId
              ? {
                  ...s,
                  label: asset.name,
                  category: isDecal ? 'DecalStamp' : 'Prop',
                  modelUrl: asset.modelUrl || undefined,
                  albedoUrl: isDecal ? asset.albedoUrl : undefined,
                  normalUrl: isDecal ? asset.normalUrl : undefined,
                  thumbnailUrl: asset.thumbnailUrl,
                }
              : s,
          ),
        }));
        this.pngPipelineBanner.set(`Updated Selected Object -> ${asset.name}`);
      } else {
        // In Objects stamp tool: selecting a new object in the modal prepares the cursor to stamp the new object
        this.selectedPlacedId.set(null);
        this.selectedPlacedKind.set(null);
        this.stage.focusGizmoAt(null);
        this.pngPipelineBanner.set(`Equipped Object Stamp -> ${asset.name}`);
      }
      this.syncGhostCursorToStage();
      return;
    }

    this.syncGhostCursorToStage();
  }

  private applyFloorTextureToScene(
    name: string,
    albedoUrl: string,
    normalUrl: string,
    heightUrl?: string,
  ): void {
    this.stage.applyFloorBumpMap(
      albedoUrl,
      normalUrl,
      this.floorTilingScale(),
      heightUrl,
    );
    this.stage.configureFloorProperties({
      albedoUrl,
      normalUrl,
      heightUrl,
      tilingScale: this.floorTilingScale(),
      bumpIntensity: this.floorBumpIntensity(),
      heightScale: this.floorHeightScale(),
      surfaceFinish: this.floorSurfaceFinish(),
      roughness: this.floorRoughness(),
      specularIntensity: this.floorSpecularIntensity(),
      ambientOcclusion: this.floorAmbientOcclusion(),
      colorHex: this.floorColorHex(),
      colorStrength: this.floorColorStrength(),
      colorBlendMode: this.floorColorBlendMode(),
    });
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      floorAlbedoUrl: albedoUrl,
      floorNormalUrl: normalUrl,
      floorHeightUrl: heightUrl,
      floorTilingScale: this.floorTilingScale(),
    }));
    this.pngPipelineBanner.set(`Applied Seamless Flooring: ${name}`);
    this.syncGhostCursorToStage();
  }

  onFloorTilingChange(scale: number): void {
    this.floorTilingScale.set(scale);
    const node = this.selectedNode();
    const albedo = node.albedoUrl || this.sceneGraph().floorAlbedoUrl;
    const normal = node.normalUrl || this.sceneGraph().floorNormalUrl;
    if (albedo && normal) {
      this.stage.configureFloorProperties({
        albedoUrl: albedo,
        normalUrl: normal,
        tilingScale: scale,
      });
      this.commitSceneUpdate((cur) => ({
        ...cur,
        floorTilingScale: scale,
      }));
    }
  }

  onFloorBumpIntensityChange(val: number): void {
    this.floorBumpIntensity.set(val);
    this.stage.configureFloorProperties({ bumpIntensity: val });
    this.render2dViewport();
  }

  onFloorHeightScaleChange(val: number): void {
    this.floorHeightScale.set(val);
    this.stage.configureFloorProperties({ heightScale: val });
    this.render2dViewport();
  }

  onFloorSurfaceFinishChange(finish: LwFloorSurfaceFinish): void {
    this.floorSurfaceFinish.set(finish);
    if (finish === 'matte') {
      this.floorRoughness.set(86);
      this.floorSpecularIntensity.set(14);
    } else if (finish === 'semi-glossy') {
      this.floorRoughness.set(46);
      this.floorSpecularIntensity.set(58);
    } else if (finish === 'shiny') {
      this.floorRoughness.set(14);
      this.floorSpecularIntensity.set(115);
    }
    this.stage.configureFloorProperties({
      surfaceFinish: finish,
      roughness: this.floorRoughness(),
      specularIntensity: this.floorSpecularIntensity(),
    });
  }

  onFloorRoughnessChange(val: number): void {
    this.floorRoughness.set(val);
    this.stage.configureFloorProperties({ roughness: val });
  }

  onFloorSpecularIntensityChange(val: number): void {
    this.floorSpecularIntensity.set(val);
    this.stage.configureFloorProperties({ specularIntensity: val });
  }

  onFloorAmbientOcclusionChange(val: number): void {
    this.floorAmbientOcclusion.set(val);
    this.stage.configureFloorProperties({ ambientOcclusion: val });
    this.render2dViewport();
  }

  onFloorColorHexChange(hex: string): void {
    this.floorColorHex.set(hex);
    if (hex !== '#ffffff' && this.floorColorStrength() === 0) {
      this.floorColorStrength.set(45);
    }
    this.stage.configureFloorProperties({
      colorHex: hex,
      colorStrength: this.floorColorStrength(),
      colorBlendMode: this.floorColorBlendMode(),
    });
    this.render2dViewport();
  }

  onFloorColorStrengthChange(val: number): void {
    this.floorColorStrength.set(val);
    this.stage.configureFloorProperties({
      colorHex: this.floorColorHex(),
      colorStrength: val,
      colorBlendMode: this.floorColorBlendMode(),
    });
    this.render2dViewport();
  }

  onFloorColorBlendModeChange(mode: MapFloorBlendMode): void {
    this.floorColorBlendMode.set(mode);
    this.stage.configureFloorProperties({
      colorHex: this.floorColorHex(),
      colorStrength: this.floorColorStrength(),
      colorBlendMode: mode,
    });
    this.render2dViewport();
  }

  onFloorBrushActiveChange(active: boolean): void {
    this.floorBrushActive.set(active);
    this.syncSurfaceLock();
    this.syncGhostCursorToStage();
  }

  onFloorBrushColorHexChange(hex: string): void {
    this.floorBrushColorHex.set(hex);
    this.syncGhostCursorToStage();
  }

  onFloorBrushBlendModeChange(mode: MapFloorBlendMode): void {
    this.floorBrushBlendMode.set(mode);
    this.syncGhostCursorToStage();
  }

  onClearFloorPaint(): void {
    this.stage.clearFloorPaint();
    this.render2dViewport();
    this.pngPipelineBanner.set('Cleared painted floor color layer.');
  }

  private paintFloorDabAt(x: number, z: number): void {
    this.stage.paintFloorStrokeAt({
      x,
      z,
      radius: this.floorBrushRadius(),
      sharpness: this.floorBrushSharpness(),
      opacity: this.floorBrushOpacity(),
      colorHex: this.floorBrushColorHex(),
      blendMode: this.floorBrushBlendMode(),
    });
    if (this.show2dCanvas()) {
      this.render2dViewport(x, z);
    }
  }

  syncGhostCursorToStage(): void {
    const tool = this.activeDockToolId();
    const node = this.selectedNode();
    const isFloorPaint = tool === 'floor-bump' && this.floorBrushActive();
    const lightEditing = tool === 'select' || tool === 'lighting';
    this.stage.setLightEditing(lightEditing, lightEditing);
    this.stage.setStampDragging(tool === 'select' || tool === 'tokens' || tool === 'objects');
    const isDecalStamp = Boolean(node.albedoUrl && !node.modelUrl && !node.isFloor);
    const kind = isFloorPaint
      ? 'floor-paint'
      : tool === 'wall' || tool === 'room'
        ? 'wall'
        : tool === 'door'
          ? 'door'
          : tool === 'terrain'
            ? 'terrain'
            : tool === 'water'
              ? 'water'
              : tool === 'scatter'
                ? 'scatter'
                : tool === 'lighting'
                  ? 'light'
                  : isDecalStamp
                    ? 'decal'
                    : 'prop';
    const isObjectStamp = tool === 'objects' || tool === 'annotate';
    const effectiveObjectScale =
      isObjectStamp && this.objectRandomScalePct() > 0
        ? Math.max(0.25, node.scale * this.previewedObjectScaleFactor)
        : node.scale;
    const effectiveRotDeg =
      tool === 'scatter'
        ? this.scatterRotationDeg()
        : isObjectStamp &&
            this.objectRandomRotationDeg() > 0 &&
            this.previewedObjectRotationDeg !== null
          ? this.previewedObjectRotationDeg
          : node.rotationDeg;

    const scale = isFloorPaint
      ? this.floorBrushRadius()
      : tool === 'terrain' || tool === 'scatter'
        ? this.terrainBrushRadius()
        : tool === 'water'
          ? this.waterWidthMeters() * 0.5
          : tool === 'door'
            ? this.doorWidthMeters()
            : effectiveObjectScale;

    this.stage.setGhostConfig(
      {
        enabled:
          tool !== 'select' &&
          tool !== 'sun-moon' &&
          (tool !== 'floor-bump' || isFloorPaint),
        label: node.name,
        kind,
        modelUrl: tool === 'lighting' ? undefined : node.modelUrl,
        albedoUrl: tool === 'lighting' ? undefined : node.albedoUrl,
        normalUrl: tool === 'lighting' ? undefined : node.normalUrl,
        thumbnailUrl: tool === 'lighting' ? undefined : node.thumbnailUrl,
        scale,
        stampScale: tool === 'scatter' ? this.scatterScale() : undefined,
        scaleX: node.scaleX ?? 1,
        scaleY: node.scaleY ?? 1,
        scaleZ: node.scaleZ ?? 1,
        offsetY: node.placementMode === 'custom' ? node.elevationY : 0,
        placementMode: node.placementMode ?? 'floor',
        rotationRad: (effectiveRotDeg * Math.PI) / 180,
        heightMeters: tool === 'door' ? this.doorHeightMeters() : node.heightSquares * 1.5,
        thicknessMeters: 0.45 * node.thickness,
        wallDrawMode: this.wallDrawMode(),
        wallStampScale: node.scale || 1.0,
        wallOffsetY: node.elevationY ?? -0.06,
        wallRotationOffsetDeg: node.rotationDeg || 0,
        freehandPoints: this.freehandWallPoints(),
        colorHex: isFloorPaint ? this.floorBrushColorHex() : (node.colorHex ?? '#ffffff'),
        surfaceFinish: node.surfaceFinish ?? 'standard',
        brushSharpness: this.floorBrushSharpness(),
        waterBankWidth: tool === 'water' ? 0.08 + this.waterEditor.settings().bankWidth * this.waterEditor.settings().bankFeathering / 100 : undefined,
        terrainFeathering: this.terrainFeathering(),
      },
      this.wallStartAnchor(),
    );
  }

  onCanvasHoverAt(hx: number, hz: number): void {
    if (this.activeDockToolId() === 'sun-moon') {
      this.celestialAzimuthDeg.set(Math.round(((Math.atan2(hz, hx) * 180) / Math.PI + 360) % 360));
      this.celestialAltitudeDeg.set(
        Math.max(10, Math.min(86, Math.round(85 - Math.min(20, Math.hypot(hx, hz)) * 3.4))),
      );
      this.pushCelestialLightToStage();
    }
    if (this.show2dCanvas()) this.render2dViewport(hx, hz);
  }

  onSurfaceDragAt(x: number, z: number, holdTicks: number): void {
    const tool = this.activeDockToolId();
    if (tool === 'floor-bump' && this.floorBrushActive()) {
      const minStep = Math.max(0.22, this.floorBrushRadius() * 0.22);
      if (
        this.lastFloorPaintPos &&
        Math.hypot(x - this.lastFloorPaintPos.x, z - this.lastFloorPaintPos.z) < minStep
      ) {
        return;
      }
      this.lastFloorPaintPos = { x, z };
      this.paintFloorDabAt(x, z);
      return;
    }

    if (tool === 'terrain') {
      const rateFactor = this.terrainGradualRate() / 100;
      const stepDelta = Math.max(0.025, this.terrainBrushDelta() * rateFactor * 0.14);
      const expandedRadius =
        this.terrainBrushRadius() * (1 + Math.min(1.1, holdTicks * 0.025 * rateFactor));
      this.stage.sculptTerrainAt(
        x,
        z,
        expandedRadius,
        stepDelta,
        this.terrainSculptOp(),
        this.terrainFeathering(),
        this.terrainPlateauLimit(),
      );
      return;
    }

    if (tool === 'water') {
      this.waterEditor.draw(x,z);
      return;
    }

    if (tool === 'scatter') {
      if (
        this.lastScatterPaintPos &&
        Math.hypot(x - this.lastScatterPaintPos.x, z - this.lastScatterPaintPos.z) < 1.35
      ) {
        return;
      }
      this.lastScatterPaintPos = { x, z };
      const node = this.selectedNode();
      this.sceneGraph.update((cur) => {
        const updated: MapSceneGraphState = {
          ...cur,
          revision: cur.revision + 1,
          scatterClusters: [
            ...(cur.scatterClusters ?? []),
            {
              id: `scat-${Date.now()}-${(cur.scatterClusters ?? []).length}`,
              x,
              z,
              radius: this.terrainBrushRadius(),
              density: this.scatterDensity(),
              seed: Math.round(Math.abs(x * 137 + z * 293)) + cur.revision * 17,
              modelUrl: node.modelUrl,
              label: node.name,
              scale: this.scatterScale(),
              scaleJitterPct: this.scatterScaleJitterPct(),
              rotationDeg: this.scatterRotationDeg(),
              rotationJitterDeg: this.scatterRotationJitterDeg(),
            },
          ],
        };
        this.stage.syncScatterOnly(updated);
        return updated;
      });
      if (this.scatterRotationJitterDeg() > 0) {
        const nextPreview = Math.round(
          (this.scatterRotationDeg() +
            (Math.random() - 0.5) * this.scatterRotationJitterDeg() +
            360) %
            360,
        );
        this.stage.setGhostConfig(
          this.buildScatterPreviewGhostConfig(nextPreview),
          this.wallStartAnchor(),
        );
      }
      return;
    }

    if ((tool === 'wall' || tool === 'room') && this.wallDrawMode() === 'freehand') {
      const snapped = TerrainMeshBuilder.snapWorldCoordinates(
        x,
        z,
        this.snapEnabled(),
        'wall',
      );
      const pts = this.freehandWallPoints();
      const last = pts[pts.length - 1];
      const minStep = this.snapEnabled() ? 0.1 : 0.65;
      if (!last || Math.hypot(snapped.x - last[0], snapped.z - last[1]) >= minStep) {
        this.freehandWallPoints.set([...pts, [snapped.x, snapped.z]]);
        this.syncGhostCursorToStage();
      }
    }
  }

  onSurfaceReleaseAt(x: number, z: number): void {
    this.waterEditor.finish();
    this.lastScatterPaintPos = null;
    this.lastFloorPaintPos = null;
    const tool = this.activeDockToolId();
    if (tool === 'terrain' || tool === 'water') {
      this.stage.finalizeTerrainStroke();
      return;
    }
    if ((tool === 'wall' || tool === 'room') && this.wallDrawMode() === 'freehand') {
      const pts = this.freehandWallPoints();
      if (pts.length >= 2) {
        const node = this.selectedNode();
        const wallId = `wall-${this.sceneGraph().revision + 1}`;
        const newWall: MapWallSegmentNode = {
          id: wallId,
          name: node.name,
          drawMode: 'freehand',
          material: node.materialId || node.id || 'proc-wall-dungeon-stone',
          modelUrl: node.modelUrl,
          albedoUrl: node.albedoUrl,
          normalUrl: node.normalUrl,
          thumbnailUrl: node.thumbnailUrl,
          colorHex: node.colorHex ?? '#ffffff',
          heightMeters: node.heightSquares * 1.5,
          thicknessMeters: 0.45 * node.thickness,
          offsetY: node.elevationY ?? -0.06,
          stampScale: node.scale || 1.0,
          wallTextureScale: this.wallTextureScale(),
          wallStretchX: this.wallStretchX(),
          wallStretchY: this.wallStretchY(),
          connectionOverlap: node.connectionOverlap ?? 15,
          rotationOffsetDeg: node.rotationDeg || 0,
          perspective: 'auto',
          projection: 'inward',
          hasCornerPosts: this.wallCornerPosts(),
          cornerPostScale: this.wallCornerPostScale(),
          levelIndex: 0,
          points: pts,
          openings: [],
        };
        this.freehandWallPoints.set([]);
        this.recordHistoryBeforeEdit('Draw Freehand 3D Wall');
        this.commitSceneUpdate((cur) => ({
          ...cur,
          revision: cur.revision + 1,
          walls: [...(cur.walls ?? []), newWall],
        }));
        this.selectedPlacedId.set(wallId);
        this.selectedPlacedKind.set('wall');
        this.syncGhostCursorToStage();
      } else {
        this.freehandWallPoints.set([]);
      }
    }
  }

  private selectPlacedEntity(meta: PickedSceneEntityMeta, fallbackX: number, fallbackZ: number): boolean {
    const kind = meta.lwKind;
    const id = meta.lwEntityId;
    if (!kind || !id) return false;

    const state = this.sceneGraph();
    this.selectedPlacedId.set(id);
    this.selectedPlacedKind.set(kind);
    this.selectedPlacedWallId.set(meta.lwWallId ?? null);
    this.rightDockCollapsed.set(false);

    if (kind === 'wall') {
      const wall = (state.walls ?? []).find((w) => w.id === id);
      if (wall) {
        const p0 = wall.points[0] ?? [fallbackX, fallbackZ];
        this.wallCornerPosts.set(wall.hasCornerPosts !== false);
        this.wallCornerPostScale.set(wall.cornerPostScale ?? 1.0);
        this.wallTextureScale.set(wall.wallTextureScale ?? 100);
        this.wallStretchX.set(wall.wallStretchX ?? 100);
        this.wallStretchY.set(wall.wallStretchY ?? 100);
        this.selectedNode.update((cur) => ({
          ...cur,
          id: wall.id,
          name: wall.name,
          kind: 'wall',
          subtitle: `3D Wall · ${Math.round(wall.heightMeters / 0.3048)} ft`,
          thumbnailUrl: wall.thumbnailUrl || cur.thumbnailUrl,
          modelUrl: wall.modelUrl,
          albedoUrl: wall.albedoUrl,
          normalUrl: wall.normalUrl,
          colorHex: wall.colorHex ?? '#ffffff',
          heightSquares: Math.max(1, Math.round(wall.heightMeters / 1.5)),
          thickness: Math.round((wall.thicknessMeters / 0.45) * 100) / 100,
          elevationY: wall.offsetY ?? -0.06,
          scale: wall.stampScale ?? 1.0,
          connectionOverlap: wall.connectionOverlap ?? 15,
          rotationDeg: wall.rotationOffsetDeg ?? 0,
          gridX: p0[0],
          gridZ: p0[1],
        }));
        this.stage.focusGizmoAt(p0[0], 0.1, p0[1]);
        return true;
      }
    }

    if (kind === 'door') {
      const parentWall = (state.walls ?? []).find((w) =>
        w.openings.some((op) => op.id === id),
      );
      const op = parentWall?.openings.find((o) => o.id === id);
      if (parentWall && op) {
        this.selectedPlacedWallId.set(parentWall.id);
        this.doorWallPositionPct.set(Math.round(op.t * 100));
        this.doorWidthMeters.set(op.widthMeters);
        this.doorHeightMeters.set(op.heightMeters ?? 2.6);
        this.doorIsOpen.set(op.isOpen);
        this.doorHingeSide.set(op.hingeSide ?? 'left');
        this.doorSwingDirection.set(op.swingDirection ?? 'inward');
        this.doorHasSidePosts.set(Boolean(op.hasSidePosts));
        this.doorSidePostStyle.set(op.sidePostStyle ?? 'quoin');
        this.doorSidePostScale.set(op.sidePostScale ?? 1.0);
        this.selectedNode.update((cur) => ({
          ...cur,
          id: op.id,
          name: op.name || 'Gothic Arch Door (3D GLB)',
          kind: 'door',
          subtitle: `Wall Cutout Door · ${op.widthMeters.toFixed(1)}m`,
          thumbnailUrl: op.thumbnailUrl || '/assets/previews-png/obj-89c62a2b01238531.png',
          modelUrl: op.modelUrl || '/assets/object-library/models/obj-89c62a2b01238531.glb',
        }));
        this.stage.focusGizmoAt(fallbackX, 0.1, fallbackZ);
        return true;
      }
    }

    if (kind === 'object') {
      const st = state.stamps.find((s) => s.id === id);
      if (st) {
        const placementMode =
          st.placementMode ?? ((st.offsetY ?? 0) !== 0 ? 'custom' : 'floor');
        this.selectedNode.update((cur) => ({
          ...cur,
          id: st.id,
          name: st.label,
          kind: 'prop',
          subtitle: st.modelUrl ? 'Placed 3D Object' : 'Placed 2D Floor Stamp',
          thumbnailUrl: st.thumbnailUrl || st.albedoUrl || cur.thumbnailUrl,
          modelUrl: st.modelUrl,
          albedoUrl: st.albedoUrl,
          normalUrl: st.normalUrl,
          gridX: st.x,
          gridZ: st.z,
          elevationY: st.offsetY ?? 0,
          placementMode,
          scale: st.scale,
          scaleX: st.scaleX ?? 1,
          scaleY: st.scaleY ?? 1,
          scaleZ: st.scaleZ ?? 1,
          rotationDeg: Math.round((st.rotationY * 180) / Math.PI),
          tiltDeg: st.tiltX ?? 0,
          colorHex: st.colorHex || '#ffffff',
          surfaceFinish: st.surfaceFinish ?? 'standard',
          opacity: st.opacity ?? 1,
          gmSecretOnly: Boolean(st.gmSecretOnly),
          blocksMovement: st.blocksMovement !== false,
          blocksVision: Boolean(st.blocksVision),
        }));
        this.stage.focusGizmoAt(st.x, (st.offsetY ?? 0) + 0.1, st.z);
        return true;
      }
    }

    if (kind === 'light') {
      const lt = state.lights.find((l) => l.id === id);
      if (lt) {
        this.lightDraft.set(resolveLightSettings(lt));
        this.stage.focusGizmoAt(lt.x, lt.y, lt.z, 0.35);
        return true;
      }
    }

    return false;
  }

  applyCanvasStrokeAt(x: number, z: number, pickedMeta?: PickedSceneEntityMeta): void {
    const dockTool = this.activeDockToolId();

    if (dockTool === 'select') {
      if (pickedMeta && this.selectPlacedEntity(pickedMeta, x, z)) {
        return;
      }
      this.selectedPlacedId.set(null);
      this.selectedPlacedKind.set(null);
      this.selectedPlacedWallId.set(null);
      this.stage.focusGizmoAt(null);
      return;
    }

    if (dockTool === 'terrain' || dockTool === 'water' || dockTool === 'scatter') {
      // Handled continuously by onSurfaceDragAt
      return;
    }

    if (dockTool === 'floor-bump') {
      if (this.floorBrushActive()) {
        this.paintFloorDabAt(x, z);
        return;
      }
      const node = this.selectedNode();
      if (node.albedoUrl && node.normalUrl) {
        this.applyFloorTextureToScene(node.name, node.albedoUrl, node.normalUrl, node.heightUrl);
      }
      return;
    }

    if (dockTool === 'sun-moon') {
      this.celestialAzimuthDeg.set(Math.round(((Math.atan2(z, x) * 180) / Math.PI + 360) % 360));
      this.celestialAltitudeDeg.set(
        Math.max(10, Math.min(86, Math.round(85 - Math.min(20, Math.hypot(x, z)) * 3.4))),
      );
      this.activeDockToolId.set('select');
      this.syncSurfaceLock();
      this.pushCelestialLightToStage();
      this.syncGhostCursorToStage();
      const bodyLabel = this.celestialMode() === 'sun' ? 'Sun' : 'Moon';
      this.pngPipelineBanner.set(
        `Placed ${bodyLabel} at Azimuth ${this.celestialAzimuthDeg()}° / Altitude ${this.celestialAltitudeDeg()}°.`,
      );
      return;
    }

    if (dockTool === 'lighting') {
      this.onSpawnCustomLightAt(x, z);
      return;
    }

    if (dockTool === 'door') {
      this.placeDoorCutoutOnClosestWall(x, z);
      return;
    }

    if (dockTool === 'wall' || dockTool === 'room') {
      if (this.wallDrawMode() === 'freehand') {
        return;
      }
      const anchor = this.wallStartAnchor();
      const snappedPt = WallMeshBuilder.snapWallCursorPoint(
        this.sceneGraph().walls,
        x,
        z,
        anchor,
        this.snapEnabled(),
      );
      if (!anchor) {
        this.wallStartAnchor.set({ x: snappedPt.x, z: snappedPt.z });
        this.syncGhostCursorToStage();
        return;
      }
      if (Math.hypot(snappedPt.x - anchor.x, snappedPt.z - anchor.z) < 0.25) {
        return;
      }
      const pts = WallMeshBuilder.buildShapePoints(
        this.wallDrawMode(),
        anchor.x,
        anchor.z,
        snappedPt.x,
        snappedPt.z,
        undefined,
        this.snapEnabled(),
      );
      const node = this.selectedNode();
      const newWall: MapWallSegmentNode = {
        id: `wall-${this.sceneGraph().revision + 1}`,
        name: node.name,
        drawMode: this.wallDrawMode(),
        material: node.materialId || node.id || 'proc-wall-dungeon-stone',
        modelUrl: node.modelUrl,
        albedoUrl: node.albedoUrl,
        normalUrl: node.normalUrl,
        thumbnailUrl: node.thumbnailUrl,
        colorHex: node.colorHex ?? '#ffffff',
        heightMeters: node.heightSquares * 1.5,
        thicknessMeters: 0.45 * node.thickness,
        offsetY: node.elevationY ?? -0.06,
        stampScale: node.scale || 1.0,
        wallTextureScale: this.wallTextureScale(),
        wallStretchX: this.wallStretchX(),
        wallStretchY: this.wallStretchY(),
        connectionOverlap: node.connectionOverlap ?? 15,
        rotationOffsetDeg: node.rotationDeg || 0,
        perspective: 'auto',
        projection: 'inward',
        hasCornerPosts: this.wallCornerPosts(),
        cornerPostScale: this.wallCornerPostScale(),
        levelIndex: 0,
        points: pts,
        openings: [],
      };
      this.wallStartAnchor.set(null);
      this.recordHistoryBeforeEdit(`Draw Wall (${this.wallDrawMode()})`);
      let placedWallId = newWall.id;
      this.commitSceneUpdate((cur) => {
        const merged = WallMeshBuilder.mergeSharedWallsOnPlacement(
          cur.walls ?? [],
          newWall,
          this.snapEnabled(),
        );
        placedWallId = merged.primaryWallId;
        return {
          ...cur,
          revision: cur.revision + 1,
          walls: merged.walls,
        };
      });
      this.selectedPlacedId.set(placedWallId);
      this.selectedPlacedKind.set('wall');
      this.syncGhostCursorToStage();
      return;
    }

    if (dockTool === 'tokens') {
      this.placeReferenceTokenAt(x, z);
      return;
    }

    if (dockTool === 'objects' || dockTool === 'annotate') {
      this.placeStampAt(x, z);
    }
  }

  private placeDoorCutoutOnClosestWall(x: number, z: number): void {
    const walls = this.sceneGraph().walls ?? [];
    const hit = WallMeshBuilder.findClosestWallAttachment(walls, x, z, 6.0);
    if (!hit) {
      this.pngPipelineBanner.set('Move cursor near an existing wall to attach and cut a Door.');
      return;
    }
    const node = this.selectedNode();
    const doorId = `door-${this.sceneGraph().revision + 1}`;
    const resolvedDoor = resolveProceduralDoorStyle({
      name: node.name,
      modelUrl: node.modelUrl,
    });
    const isExplicitGlb = Boolean(
      node.modelUrl && !node.modelUrl.startsWith('proc-door://'),
    );
    const clampedDoorH = Math.min(hit.wallHeight, this.doorHeightMeters());
    this.doorHeightMeters.set(clampedDoorH);
    const newOpening: WallOpeningNode = {
      id: doorId,
      type: resolvedDoor.style === 'archway' ? 'archway' : resolvedDoor.style === 'bars' ? 'bars' : 'door',
      doorStyle: isExplicitGlb ? undefined : resolvedDoor.style,
      name: node.name,
      modelUrl: isExplicitGlb
        ? node.modelUrl
        : '/assets/object-library/models/obj-89c62a2b01238531.glb',
      thumbnailUrl: node.thumbnailUrl || '/assets/previews-png/obj-89c62a2b01238531.png',
      tintColorHex: node.colorHex !== '#ffffff' ? node.colorHex : undefined,
      t: hit.t,
      widthMeters: this.doorWidthMeters(),
      heightMeters: clampedDoorH,
      isOpen: this.doorIsOpen(),
      hingeSide: this.doorHingeSide(),
      swingDirection: this.doorSwingDirection(),
      hasSidePosts: false,
      sidePostStyle: this.doorSidePostStyle(),
      sidePostScale: this.doorSidePostScale(),
      isSecret: false,
      isRevealedToPlayers: true,
    };

    this.recordHistoryBeforeEdit(`Cut Door (${node.name}) into Wall`);
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      walls: (cur.walls ?? []).map((w) =>
        w.id === hit.wallId ? { ...w, openings: [...w.openings, newOpening] } : w,
      ),
    }));
    this.selectedPlacedId.set(doorId);
    this.selectedPlacedKind.set('door');
    this.selectedPlacedWallId.set(hit.wallId);
    this.doorWallPositionPct.set(Math.round(hit.t * 100));
    this.stage.focusGizmoAt(hit.x, 0.1, hit.z);
    this.pngPipelineBanner.set(`Cut ${node.name} into wall. Adjust style, width, or swing state in right panel.`);
  }

  private placeStampAt(x: number, z: number): void {
    const node = this.selectedNode();
    const lowerName = node.name.toLowerCase();
    const isWallMountableProp =
      node.placementMode === 'custom' ||
      lowerName.includes('sconce') ||
      lowerName.includes('torch') ||
      lowerName.includes('lantern') ||
      lowerName.includes('banner') ||
      lowerName.includes('shield') ||
      lowerName.includes('tapestry') ||
      lowerName.includes('painting') ||
      lowerName.includes('sign') ||
      lowerName.includes('mirror');

    const wallSnap = isWallMountableProp
      ? snapToNearestWallFace(this.sceneGraph().walls, x, z, 0.18, 0.90)
      : null;

    const snapped = wallSnap?.snapped
      ? { x: wallSnap.x, z: wallSnap.z }
      : TerrainMeshBuilder.snapWorldCoordinates(
          x,
          z,
          this.snapEnabled(),
          'cell-center',
        );
    const isDecal = Boolean(node.albedoUrl && !node.modelUrl && !node.isFloor);
    const stampId = `st-${this.sceneGraph().revision + 1}`;
    const placementMode: LwObjectPlacementMode = wallSnap?.snapped
      ? 'custom'
      : (node.placementMode ?? 'floor');
    const effectiveOffsetY = wallSnap?.snapped
      ? (node.elevationY > 0.2 ? node.elevationY : wallSnap.suggestedElevationY)
      : placementMode === 'custom'
        ? node.elevationY
        : 0;
    const stampedRotDeg =
      this.objectRandomRotationDeg() > 0 && this.previewedObjectRotationDeg !== null
        ? this.previewedObjectRotationDeg
        : node.rotationDeg;
    const effectiveRotY = wallSnap?.snapped
      ? wallSnap.rotationYRad
      : (stampedRotDeg * Math.PI) / 180;
    const stampedScale =
      this.objectRandomScalePct() > 0
        ? Math.max(0.25, Math.round(node.scale * this.previewedObjectScaleFactor * 100) / 100)
        : node.scale;

    this.recordHistoryBeforeEdit(`Place -> ${node.name}`);
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      stamps: [
        ...cur.stamps,
        {
          id: stampId,
          label: node.name,
          category: isDecal ? 'DecalStamp' : 'Prop',
          modelUrl: node.modelUrl,
          albedoUrl: isDecal ? node.albedoUrl : undefined,
          normalUrl: isDecal ? node.normalUrl : undefined,
          thumbnailUrl: node.thumbnailUrl,
          x: snapped.x,
          z: snapped.z,
          offsetY: effectiveOffsetY,
          placementMode,
          scale: stampedScale,
          scaleX: node.scaleX ?? 1,
          scaleY: node.scaleY ?? 1,
          scaleZ: node.scaleZ ?? 1,
          rotationY: effectiveRotY,
          tiltX: node.tiltDeg ?? 0,
          colorHex: node.colorHex || '#ffffff',
          surfaceFinish: node.surfaceFinish ?? 'standard',
          opacity: node.opacity ?? 1,
          gmSecretOnly: node.gmSecretOnly,
          blocksMovement: node.blocksMovement,
          blocksVision: node.blocksVision,
        },
      ],
    }));
    this.selectedPlacedId.set(stampId);
    this.selectedPlacedKind.set('object');
    this.selectedNode.update((cur) => ({
      ...cur,
      gridX: snapped.x,
      gridZ: snapped.z,
      elevationY: effectiveOffsetY,
      placementMode,
    }));
    this.rollNextObjectGhostVariation();
    this.syncGhostCursorToStage();
    this.stage.focusGizmoAt(snapped.x, effectiveOffsetY + 0.1, snapped.z);
    if (wallSnap?.snapped) {
      this.pngPipelineBanner.set(`Mounted '${node.name}' flush onto wall face.`);
    }
  }

  onDeleteSelectedPlacedNode(): void {
    const pickedId = this.selectedPlacedId();
    const pickedKind = this.selectedPlacedKind();
    if (!pickedId) return;
    this.recordHistoryBeforeEdit('Delete Selected Item');
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      stamps: pickedKind === 'object' ? cur.stamps.filter((s) => s.id !== pickedId) : cur.stamps,
      walls:
        pickedKind === 'wall'
          ? (cur.walls ?? []).filter((w) => w.id !== pickedId)
          : pickedKind === 'door'
            ? (cur.walls ?? []).map((w) => ({
                ...w,
                openings: w.openings.filter((op) => op.id !== pickedId),
              }))
            : cur.walls,
      lights: pickedKind === 'light' ? cur.lights.filter((l) => l.id !== pickedId) : cur.lights,
    }));
    this.selectedPlacedId.set(null);
    this.selectedPlacedKind.set(null);
    this.selectedPlacedWallId.set(null);
    this.stage.focusGizmoAt(null);
  }

  onSpawnCustomLightAt(x?: number, z?: number): void {
    const coords = this.stage.lastPickedCoords();
    const rawX = x ?? coords.x;
    const rawZ = z ?? coords.z;
    const wallSnap = snapToNearestWallFace(this.sceneGraph().walls, rawX, rawZ, 0.16, 0.95);
    const lx = wallSnap.snapped ? wallSnap.x : rawX;
    const lz = wallSnap.snapped ? wallSnap.z : rawZ;
    const lightId = `light-${this.sceneGraph().revision + 1}`;
    const draft = this.lightDraft();
    const effectiveY = wallSnap.snapped ? wallSnap.suggestedElevationY : draft.y;
    const labels = { point: 'Point', spot: 'Spot', aoe: 'Ambient' } as const;
    this.recordHistoryBeforeEdit(wallSnap.snapped ? 'Mount Wall Sconce Light' : 'Add Scene Light');
    this.commitLightUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      lights: [
        ...cur.lights,
        {
          ...draft,
          id: lightId,
          label: wallSnap.snapped ? 'Wall Sconce' : `${labels[draft.kind]} Light`,
          x: lx,
          z: lz,
          y: effectiveY,
          showFixture: wallSnap.snapped,
          attachedWallId: wallSnap.wallId,
          wallNormalX: wallSnap.outwardNormalX,
          wallNormalZ: wallSnap.outwardNormalZ,
          wallRotationYRad: wallSnap.rotationYRad,
        },
      ],
    }));
    this.selectedPlacedId.set(lightId);
    this.selectedPlacedKind.set('light');
    this.stage.focusGizmoAt(lx, effectiveY, lz, 0.35);
    if (wallSnap.snapped) {
      this.pngPipelineBanner.set('Mounted 3D Wall Sconce onto wall face.');
    }
  }

  /** Edits the selected light; with none selected they become the defaults for the next placement. */
  onLightSettingsChanged(patch: Partial<LightSettings>): void {
    let next: LightSettings = { ...this.lightDraft(), ...patch };
    if ('y' in patch) {
      next = { ...next, y: snapLightElevation(next.y, this.snapEnabled()) };
    }
    this.lightDraft.set(next);
    const targetId = this.selectedPlacedKind() === 'light' ? this.selectedPlacedId() : null;
    if (!targetId) return;
    this.commitLightUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      lights: cur.lights.map((lt) => (lt.id === targetId ? { ...lt, ...next } : lt)),
    }));
    const lt = this.sceneGraph().lights.find((l) => l.id === targetId);
    if (lt) this.stage.focusGizmoAt(lt.x, next.y, lt.z, 0.35);
  }

  onLightPresetApplied(patch: Partial<LightSettings>): void {
    this.onLightSettingsChanged(patch);
  }

  onDeleteSelectedLight(): void {
    if (this.selectedPlacedKind() === 'light') this.onDeleteSelectedPlacedNode();
  }

  private commitLightUpdate(updater: (cur: MapSceneGraphState) => MapSceneGraphState): void {
    this.sceneGraph.update((cur) => {
      const updated = updater(cur);
      this.stage.updateLightsOnly(updated);
      return updated;
    });
    if (this.dimensionMode() === '2d') {
      this.render2dViewport();
    }
  }

  private wireLightDrag(): void {
    this.stage.lightDrag.onStart = (id) => {
      this.selectPlacedEntity({ lwKind: 'light', lwEntityId: id } as PickedSceneEntityMeta, 0, 0);
      this.recordHistoryBeforeEdit('Move Scene Light');
    };
    this.stage.lightDrag.onEnd = (id, x, z, moved) => {
      if (!moved) return;
      const wallSnap = snapToNearestWallFace(this.sceneGraph().walls, x, z, 0.16, 0.95);
      const lx = wallSnap.snapped ? wallSnap.x : x;
      const lz = wallSnap.snapped ? wallSnap.z : z;
      this.commitLightUpdate((cur) => ({
        ...cur,
        revision: cur.revision + 1,
        lights: cur.lights.map((lt) =>
          lt.id === id
            ? {
                ...lt,
                x: lx,
                z: lz,
                showFixture: wallSnap.snapped || lt.showFixture,
                attachedWallId: wallSnap.snapped ? wallSnap.wallId : undefined,
                wallNormalX: wallSnap.snapped ? wallSnap.outwardNormalX : undefined,
                wallNormalZ: wallSnap.snapped ? wallSnap.outwardNormalZ : undefined,
                wallRotationYRad: wallSnap.snapped ? wallSnap.rotationYRad : undefined,
              }
            : lt,
        ),
      }));
      const lt = this.sceneGraph().lights.find((l) => l.id === id);
      if (lt) this.stage.focusGizmoAt(lx, lt.y, lz, 0.35);
    };
  }

  private wireStampDrag(): void {
    this.stage.stampDrag.onStart = (id) => {
      const st = this.sceneGraph().stamps.find((s) => s.id === id);
      this.selectPlacedEntity(
        { lwKind: 'object', lwEntityId: id } as PickedSceneEntityMeta,
        st?.x ?? 0,
        st?.z ?? 0,
      );
      this.recordHistoryBeforeEdit(st?.category === 'Token' ? 'Move Reference Token' : 'Move Object');
    };
    this.stage.stampDrag.onMove = (id, x, z, distFeet, distSquares) => {
      const st = this.sceneGraph().stamps.find((s) => s.id === id);
      if (st?.category === 'Token') {
        this.pngPipelineBanner.set(
          `${st.label}: Moved ${distFeet} ft (${distSquares.toFixed(1)} sq) · 30 ft turn limit shown`,
        );
      }
      this.stage.focusGizmoAt(x, (st?.offsetY ?? 0) + 0.1, z);
    };
    this.stage.stampDrag.onEnd = (id, x, z, moved, distFeet) => {
      if (!moved) return;
      this.commitSceneUpdate((cur) => ({
        ...cur,
        revision: cur.revision + 1,
        stamps: cur.stamps.map((s) => (s.id === id ? { ...s, x, z } : s)),
      }));
      this.selectedNode.update((cur) => ({ ...cur, gridX: x, gridZ: z }));
      const st = this.sceneGraph().stamps.find((s) => s.id === id);
      if (st) {
        this.stage.focusGizmoAt(x, (st.offsetY ?? 0) + 0.1, z);
        if (st.category === 'Token') {
          this.pngPipelineBanner.set(`${st.label} placed after ${distFeet} ft movement.`);
        }
      }
    };
  }

  private placeReferenceTokenAt(x: number, z: number, presetOverride?: string): void {
    const snapped = TerrainMeshBuilder.snapWorldCoordinates(
      x,
      z,
      this.snapEnabled(),
      'cell-center',
    );
    const preset = presetOverride ?? this.activeTokenPreset();
    const catalog: Record<
      string,
      { label: string; sizeSq: number; colorHex: string; portraitUrl: string }
    > = {
      'hero-5ft': {
        label: 'Dal (5ft PC)',
        sizeSq: 1,
        colorHex: '#49e892',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Knight.webp',
      },
      'ally-5ft': {
        label: 'Fivi (5ft Fey)',
        sizeSq: 1,
        colorHex: '#38bdf8',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Mage.webp',
      },
      'large-10ft': {
        label: 'Ogre (10ft Large)',
        sizeSq: 2,
        colorHex: '#f59e0b',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Ogre.webp',
      },
      'huge-15ft': {
        label: 'Dragon (15ft Huge)',
        sizeSq: 3,
        colorHex: '#ef4444',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Adult Red Dragon.webp',
      },
    };
    const spec = catalog[preset] ?? catalog['hero-5ft'];
    const stampId = `token-${Date.now()}-${this.sceneGraph().stamps.length + 1}`;
    this.recordHistoryBeforeEdit(`Place Reference Token (${spec.label})`);
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      stamps: [
        ...cur.stamps,
        {
          id: stampId,
          label: spec.label,
          category: 'Token',
          thumbnailUrl: spec.portraitUrl,
          albedoUrl: spec.portraitUrl,
          x: snapped.x,
          z: snapped.z,
          offsetY: 0,
          placementMode: 'floor',
          scale: 1,
          scaleX: spec.sizeSq,
          scaleY: spec.sizeSq,
          scaleZ: spec.sizeSq,
          rotationY: 0,
          colorHex: spec.colorHex,
          surfaceFinish: 'standard',
          opacity: 1,
          gmSecretOnly: false,
          blocksMovement: true,
          blocksVision: false,
        },
      ],
    }));
    this.selectedPlacedId.set(stampId);
    this.selectedPlacedKind.set('object');
    this.stage.focusGizmoAt(snapped.x, 0.1, snapped.z);
    this.pngPipelineBanner.set(
      `Placed ${spec.label}. Drag token on the map to visualize 30ft movement & scale.`,
    );
  }

  onSpawnSampleParty(): void {
    this.recordHistoryBeforeEdit('Spawn Sample Reference Tokens');
    const step = TerrainMeshBuilder.getCellStepMeters();
    const entries = [
      {
        label: 'Dal (5ft PC)',
        sizeSq: 1,
        colorHex: '#49e892',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Knight.webp',
        x: -step * 1.5,
        z: step * 0.5,
      },
      {
        label: 'Munk (5ft PC)',
        sizeSq: 1,
        colorHex: '#2ee66b',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Berserker.webp',
        x: -step * 0.5,
        z: step * 0.5,
      },
      {
        label: 'Fivi (5ft Fey)',
        sizeSq: 1,
        colorHex: '#38bdf8',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Mage.webp',
        x: -step * 1.5,
        z: -step * 0.5,
      },
      {
        label: 'Ogre (10ft Large)',
        sizeSq: 2,
        colorHex: '#ef4444',
        portraitUrl: '/assets/5etools/img/bestiary/tokens/MM/Ogre.webp',
        x: step * 2.0,
        z: 0,
      },
    ];
    const now = Date.now();
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      stamps: [
        ...cur.stamps.filter((s) => s.category !== 'Token'),
        ...entries.map((e, idx) => ({
          id: `token-${now}-${idx}`,
          label: e.label,
          category: 'Token' as const,
          thumbnailUrl: e.portraitUrl,
          albedoUrl: e.portraitUrl,
          x: e.x,
          z: e.z,
          offsetY: 0,
          placementMode: 'floor' as const,
          scale: 1,
          scaleX: e.sizeSq,
          scaleY: e.sizeSq,
          scaleZ: e.sizeSq,
          rotationY: 0,
          colorHex: e.colorHex,
          surfaceFinish: 'standard' as const,
          opacity: 1,
          gmSecretOnly: false,
          blocksMovement: true,
          blocksVision: false,
        })),
      ],
    }));
    this.stage.setStampDragging(true);
    this.pngPipelineBanner.set(
      'Spawned 4 Reference Tokens (3 Medium 5ft PCs + 1 Large 10ft Ogre). Drag any token to test scale & 30ft movement.',
    );
  }

  onClearRefTokens(): void {
    this.recordHistoryBeforeEdit('Clear Reference Tokens');
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      stamps: cur.stamps.filter((s) => s.category !== 'Token'),
    }));
    this.pngPipelineBanner.set('Cleared reference tokens from map.');
  }

  onToggleRefTokensFromBar(): void {
    if (this.hasRefTokens()) {
      this.onClearRefTokens();
    } else {
      this.onSpawnSampleParty();
    }
  }

  onGridScalePctChange(pct: number): void {
    const clampedPct = Math.max(40, Math.min(250, Math.round(pct)));
    this.gridScalePct.set(clampedPct);
    const squares = Math.max(
      15,
      Math.round(TerrainMeshBuilder.BASE_GRID_SQUARES / (clampedPct / 100)),
    );
    this.gridCols.set(squares);
    this.gridRows.set(squares);
    this.stage.configureGrid({ scaleFactor: clampedPct / 100 });
    this.sceneGraph.update((cur) => ({
      ...cur,
      gridScalePct: clampedPct,
      gridCols: squares,
      gridRows: squares,
    }));
    this.render2dViewport();
  }

  onGridSquaresAcrossChange(squaresAcross: number): void {
    const sq = Math.max(15, Math.min(120, Math.round(squaresAcross)));
    const pct = Math.max(
      40,
      Math.min(250, Math.round((TerrainMeshBuilder.BASE_GRID_SQUARES / sq) * 100)),
    );
    this.gridCols.set(sq);
    this.gridRows.set(sq);
    this.gridScalePct.set(pct);
    this.stage.configureGrid({ scaleFactor: pct / 100 });
    this.sceneGraph.update((cur) => ({
      ...cur,
      gridScalePct: pct,
      gridCols: sq,
      gridRows: sq,
    }));
    this.render2dViewport();
    this.pngPipelineBanner.set(
      `Grid perspective set to ${sq}×${sq} squares (${sq * 5}×${sq * 5} ft world view). Reference tokens rescaled to 5ft.`,
    );
  }

  onGridOffsetXChange(val: number): void {
    this.gridOffsetX.set(val);
    this.stage.configureGrid({ offsetX: val });
    this.sceneGraph.update((cur) => ({ ...cur, gridOffsetX: val }));
    this.render2dViewport();
  }

  onGridOffsetZChange(val: number): void {
    this.gridOffsetZ.set(val);
    this.stage.configureGrid({ offsetZ: val });
    this.sceneGraph.update((cur) => ({ ...cur, gridOffsetZ: val }));
    this.render2dViewport();
  }

  onGridOpacityPctChange(pct: number): void {
    this.gridOpacityPct.set(pct);
    this.stage.configureGrid({ opacity: pct / 100 });
    this.sceneGraph.update((cur) => ({ ...cur, gridOpacityPct: pct }));
    this.render2dViewport();
  }

  onDoorPropertyChanged(): void {
    this.syncGhostCursorToStage();
    const doorId = this.selectedPlacedKind() === 'door' ? this.selectedPlacedId() : null;
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      walls: (cur.walls ?? []).map((w) => ({
        ...w,
        openings: w.openings.map((op, idx) =>
          (doorId ? op.id === doorId : idx === w.openings.length - 1)
            ? {
                ...op,
                t: this.doorWallPositionPct() / 100,
                widthMeters: this.doorWidthMeters(),
                heightMeters: this.doorHeightMeters(),
                isOpen: this.doorIsOpen(),
                hingeSide: this.doorHingeSide(),
                swingDirection: this.doorSwingDirection(),
                hasSidePosts: this.doorHasSidePosts(),
                sidePostStyle: this.doorSidePostStyle(),
                sidePostScale: this.doorSidePostScale(),
              }
            : op,
        ),
      })),
    }));
  }

  onWallCornerPostsToggle(): void {
    const next = !this.wallCornerPosts();
    this.wallCornerPosts.set(next);
    this.syncGhostCursorToStage();
    this.updateTargetWall((w) => ({ ...w, hasCornerPosts: next }));
  }

  onWallCornerPostScaleChange(scale: number): void {
    this.wallCornerPostScale.set(scale);
    this.syncGhostCursorToStage();
    this.updateTargetWall((w) => ({ ...w, cornerPostScale: scale }));
  }

  pushCelestialLightToStage(): void {
    this.stage.updateCelestialLight({
      mode: this.celestialMode(),
      azimuthDeg: this.celestialAzimuthDeg(),
      altitudeDeg: this.celestialAltitudeDeg(),
      shadowDarkness: this.shadowDarkness(),
      showSkyOrb: this.activeDockToolId() === 'sun-moon',
    });
  }

  onGridModeChange(mode: string): void {
    this.gridSizeLabel.set(mode);
    this.stage.setGridMode(mode);
    this.render2dViewport();
  }

  on2dCanvasDown(event: PointerEvent): void {
    if(event.button!==0 || this.activeDockToolId()!=='water')return;
    const canvas=this.canvas2dRef?.nativeElement;
    if(!canvas)return;
    canvas.setPointerCapture(event.pointerId);
    this.waterEditor.beginStroke();
    const point=Real2dMapRenderer.screenToWorld(canvas,event.clientX,event.clientY);
    this.waterEditor.draw(point.x,point.z);
  }

  on2dCanvasMove(event: MouseEvent): void {
    const canvas = this.canvas2dRef?.nativeElement;
    if (!canvas) return;
    const coords = Real2dMapRenderer.screenToWorld(canvas, event.clientX, event.clientY);
    this.onCanvasHoverAt(coords.x, coords.z);
    if (event.buttons === 1) {
      this.onSurfaceDragAt(coords.x, coords.z, 1);
    }
  }

  on2dCanvasClick(event: MouseEvent): void {
    const canvas = this.canvas2dRef?.nativeElement;
    if (!canvas) return;
    const coords = Real2dMapRenderer.screenToWorld(canvas, event.clientX, event.clientY);
    this.applyCanvasStrokeAt(coords.x, coords.z);
  }

  on2dCanvasWheel(event: WheelEvent): void {
    // Prevent laptop trackpad pinch-to-zoom from zooming the browser UI
    event.preventDefault();
    event.stopPropagation();
  }

  private render2dViewport(ghostX?: number, ghostZ?: number): void {
    const canvas = this.canvas2dRef?.nativeElement;
    if (!canvas) return;
    const isFloorPaint =
      this.activeDockToolId() === 'floor-bump' && this.floorBrushActive();
    Real2dMapRenderer.renderSceneToCanvas(canvas, this.sceneGraph(), {
      hideGmSecrets: this.showPlayerSafeOnly(),
      selectedNodeId: this.selectedPlacedId() ?? this.selectedNode().id,
      gridMode: this.gridSizeLabel(),
      floorAlbedoUrl: this.sceneGraph().floorAlbedoUrl,
      floorTilingScale: this.floorTilingScale(),
      floorColorHex: this.floorColorHex(),
      floorColorStrength: this.floorColorStrength(),
      floorColorBlendMode: this.floorColorBlendMode(),
      ghostX,
      ghostZ,
      ghostLabel: this.selectedNode().name,
      ghostRadiusMeters: isFloorPaint ? this.floorBrushRadius() : undefined,
      ghostSharpness: isFloorPaint ? this.floorBrushSharpness() : undefined,
      ghostColorHex: isFloorPaint ? this.floorBrushColorHex() : undefined,
      wallStartAnchor: this.wallStartAnchor(),
      celestialMode: this.celestialMode(),
      celestialAzimuthDeg: this.celestialAzimuthDeg(),
      celestialAltitudeDeg: this.celestialAltitudeDeg(),
      onImageLoaded: () => this.render2dViewport(),
    });
  }

  onCameraViewChange(view: LwMapCameraView): void {
    this.cameraView.set(view);
    this.dimensionMode.set(view === 'real-2d' ? '2d' : '3d');
    this.stage.setCameraMode(view);
    setTimeout(() => {
      this.stage.resize();
      this.render2dViewport();
    }, 30);
  }

  onThemeChange(theme: string): void {
    this.activeTheme.set(theme);
    this.commitSceneUpdate((cur) => ({ ...cur, biome: theme, revision: cur.revision + 1 }));
  }

  onQualityChange(preset: LwMapQualityPreset): void {
    this.activeQuality.set(preset);
    this.stage.setQualityPreset(preset);
    this.vttDisplay.setMapQuality(studioPresetToVttQuality(preset));
  }

  onTogglePlayerSafeView(): void {
    this.showPlayerSafeOnly.update((v) => !v);
    this.stage.setPlayerSafeFilter(this.showPlayerSafeOnly(), this.sceneGraph());
    this.render2dViewport();
  }

  onExportScenePng(variant: 'gm' | 'player-safe'): void {
    this.showPlayerSafeOnly.set(variant === 'player-safe');
    this.stage.setPlayerSafeFilter(variant === 'player-safe', this.sceneGraph());
    this.render2dViewport();
    this.pngPipelineBanner.set(
      `Exported ${variant === 'player-safe' ? 'Player-Safe' : 'GM Master'} PNG.`,
    );
  }

  private updateTargetStamp(
    updater: (s: MapSceneGraphState['stamps'][number]) => MapSceneGraphState['stamps'][number],
  ): void {
    const targetId =
      this.selectedPlacedKind() === 'object' ? this.selectedPlacedId() : null;
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      stamps: cur.stamps.map((s, idx) =>
        (targetId ? s.id === targetId : idx === cur.stamps.length - 1) ? updater(s) : s,
      ),
    }));
  }

  onInspectorPositionChange(axis: 'x' | 'z', value: number): void {
    this.selectedNode.update((cur) =>
      axis === 'x' ? { ...cur, gridX: value } : { ...cur, gridZ: value },
    );
    this.updateTargetStamp((s) => (axis === 'x' ? { ...s, x: value } : { ...s, z: value }));
  }

  private updateTargetWall(
    updater: (w: MapWallSegmentNode) => MapWallSegmentNode,
  ): void {
    const targetWallId =
      this.selectedPlacedKind() === 'wall' ? this.selectedPlacedId() : null;
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      walls: (cur.walls ?? []).map((w, idx, arr) =>
        (targetWallId ? w.id === targetWallId : idx === arr.length - 1)
          ? updater(w)
          : w,
      ),
    }));
  }

  onWallConnectionOverlapChange(overlap: number): void {
    this.selectedNode.update((cur) => ({ ...cur, connectionOverlap: overlap }));
    this.syncGhostCursorToStage();
    this.updateTargetWall((w) => ({ ...w, connectionOverlap: overlap }));
  }

  onInspectorElevationChange(elevationY: number): void {
    this.selectedNode.update((cur) => ({ ...cur, elevationY }));
    this.syncGhostCursorToStage();
    if (
      this.selectedPlacedKind() === 'wall' ||
      this.activeDockToolId() === 'wall' ||
      this.activeDockToolId() === 'room'
    ) {
      this.updateTargetWall((w) => ({ ...w, offsetY: elevationY }));
      return;
    }
    this.updateTargetStamp((s) => ({ ...s, offsetY: elevationY }));
  }

  onInspectorHeightChange(heightSquares: number): void {
    this.selectedNode.update((cur) => ({
      ...cur,
      heightSquares,
      subtitle: `3D Wall · ${heightSquares * 5} ft`,
    }));
    this.syncGhostCursorToStage();
    this.updateTargetWall((w) => ({ ...w, heightMeters: heightSquares * 1.5 }));
  }

  onInspectorThicknessChange(thickness: number): void {
    this.selectedNode.update((cur) => ({ ...cur, thickness }));
    this.syncGhostCursorToStage();
    this.updateTargetWall((w) => ({ ...w, thicknessMeters: 0.45 * thickness }));
  }

  onInspectorRotationChange(rotationDeg: number): void {
    this.selectedNode.update((cur) => ({ ...cur, rotationDeg }));
    this.rollNextObjectGhostVariation();
    this.syncGhostCursorToStage();
    if (
      this.selectedPlacedKind() === 'wall' ||
      this.activeDockToolId() === 'wall' ||
      this.activeDockToolId() === 'room'
    ) {
      this.updateTargetWall((w) => ({ ...w, rotationOffsetDeg: rotationDeg }));
      return;
    }
    const rad = (rotationDeg * Math.PI) / 180;
    this.updateTargetStamp((s) => ({ ...s, rotationY: rad }));
  }

  onInspectorTiltChange(tiltDeg: number): void {
    this.selectedNode.update((cur) => ({ ...cur, tiltDeg }));
    this.updateTargetStamp((s) => ({ ...s, tiltX: tiltDeg }));
  }

  onInspectorScaleChange(scale: number): void {
    this.userCustomizedObjectScale = true;
    this.selectedNode.update((cur) => ({ ...cur, scale }));
    this.syncGhostCursorToStage();
    if (
      this.selectedPlacedKind() === 'wall' ||
      this.activeDockToolId() === 'wall' ||
      this.activeDockToolId() === 'room'
    ) {
      this.updateTargetWall((w) => ({ ...w, stampScale: scale }));
      return;
    }
    this.updateTargetStamp((s) => ({ ...s, scale }));
  }

  onInspectorAxisScaleChange(axis: 'x' | 'y' | 'z', val: number): void {
    this.selectedNode.update((cur) =>
      axis === 'x'
        ? { ...cur, scaleX: val }
        : axis === 'y'
          ? { ...cur, scaleY: val }
          : { ...cur, scaleZ: val },
    );
    this.syncGhostCursorToStage();
    this.updateTargetStamp((s) =>
      axis === 'x'
        ? { ...s, scaleX: val }
        : axis === 'y'
          ? { ...s, scaleY: val }
          : { ...s, scaleZ: val },
    );
  }

  onObjectRandomRotationChange(spreadDeg: number): void {
    const clamped = Math.max(0, Math.min(360, Math.round(spreadDeg)));
    this.objectRandomRotationDeg.set(clamped);
    this.rollNextObjectGhostVariation();
    this.syncGhostCursorToStage();
  }

  onObjectRandomScaleChange(jitterPct: number): void {
    const clamped = Math.max(0, Math.min(50, Math.round(jitterPct)));
    this.objectRandomScalePct.set(clamped);
    this.rollNextObjectGhostVariation();
    this.syncGhostCursorToStage();
  }

  private rollNextObjectGhostVariation(): void {
    const rotSpread = this.objectRandomRotationDeg();
    if (rotSpread <= 0) {
      this.previewedObjectRotationDeg = null;
    } else {
      const baseDeg = this.selectedNode().rotationDeg;
      const delta = (Math.random() - 0.5) * rotSpread;
      this.previewedObjectRotationDeg = Math.round((baseDeg + delta + 360) % 360);
    }

    const scaleJitter = this.objectRandomScalePct() / 100;
    if (scaleJitter <= 0) {
      this.previewedObjectScaleFactor = 1.0;
    } else {
      this.previewedObjectScaleFactor = Math.max(
        0.35,
        1 + (Math.random() * 2 - 1) * scaleJitter,
      );
    }
  }

  onScatterDensityChange(density: number): void {
    this.scatterDensity.set(density);
    this.updateActiveScatterClusters((c) => ({ ...c, density }));
  }

  onScatterScaleChange(scale: number): void {
    const clamped = Math.max(0.4, Math.min(8.0, Math.round(scale * 100) / 100));
    this.scatterScale.set(clamped);
    this.syncGhostCursorToStage();
    this.updateActiveScatterClusters((c) => ({ ...c, scale: clamped }));
  }

  onScatterScaleJitterChange(jitterPct: number): void {
    const clamped = Math.max(0, Math.min(60, Math.round(jitterPct)));
    this.scatterScaleJitterPct.set(clamped);
    this.updateActiveScatterClusters((c) => ({ ...c, scaleJitterPct: clamped }));
  }

  onScatterRotationChange(rotDeg: number): void {
    const clamped = ((Math.round(rotDeg) % 360) + 360) % 360;
    this.scatterRotationDeg.set(clamped);
    this.syncGhostCursorToStage();
    this.updateActiveScatterClusters((c) => ({ ...c, rotationDeg: clamped }));
  }

  onScatterRotationJitterChange(spreadDeg: number): void {
    const clamped = Math.max(0, Math.min(360, Math.round(spreadDeg)));
    this.scatterRotationJitterDeg.set(clamped);
    if (clamped > 0) {
      const nextPreview = Math.round(
        (this.scatterRotationDeg() + (Math.random() - 0.5) * clamped + 360) % 360,
      );
      this.stage.setGhostConfig(
        {
          ...this. buildScatterPreviewGhostConfig(nextPreview),
        },
        this.wallStartAnchor(),
      );
    } else {
      this.syncGhostCursorToStage();
    }
    this.updateActiveScatterClusters((c) => ({ ...c, rotationJitterDeg: clamped }));
  }

  private buildScatterPreviewGhostConfig(rotDeg: number): GhostAssetConfig {
    const node = this.selectedNode();
    return {
      enabled: true,
      label: node.name,
      kind: 'scatter',
      modelUrl: node.modelUrl,
      albedoUrl: node.albedoUrl,
      normalUrl: node.normalUrl,
      thumbnailUrl: node.thumbnailUrl,
      scale: this.terrainBrushRadius(),
      stampScale: this.scatterScale(),
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      offsetY: 0,
      placementMode: 'floor',
      rotationRad: (rotDeg * Math.PI) / 180,
      heightMeters: node.heightSquares * 1.5,
      thicknessMeters: 0.45 * node.thickness,
      wallDrawMode: this.wallDrawMode(),
      colorHex: node.colorHex ?? '#ffffff',
      surfaceFinish: node.surfaceFinish ?? 'standard',
      terrainFeathering: this.terrainFeathering(),
    };
  }

  private updateActiveScatterClusters(
    updater: (c: MapScatterClusterNode) => MapScatterClusterNode,
  ): void {
    const clusters = this.sceneGraph().scatterClusters;
    if (!clusters || clusters.length === 0) return;
    const activeModelUrl = this.selectedNode().modelUrl;
    const hasMatchingModel = Boolean(
      activeModelUrl && clusters.some((c) => c.modelUrl === activeModelUrl),
    );
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      scatterClusters: (cur.scatterClusters ?? []).map((c) =>
        !hasMatchingModel || c.modelUrl === activeModelUrl ? updater(c) : c,
      ),
    }));
  }

  onInspectorSecretToggle(): void {
    this.selectedNode.update((cur) => ({ ...cur, gmSecretOnly: !cur.gmSecretOnly }));
    const nextVal = this.selectedNode().gmSecretOnly;
    this.updateTargetStamp((s) => ({ ...s, gmSecretOnly: nextVal }));
  }

  onInspectorPlacementModeChange(mode: LwObjectPlacementMode): void {
    this.selectedNode.update((cur) => ({
      ...cur,
      placementMode: mode,
      elevationY: mode === 'floor' ? 0 : cur.elevationY,
    }));
    this.syncGhostCursorToStage();
    this.updateTargetStamp((s) => ({
      ...s,
      placementMode: mode,
      offsetY: mode === 'floor' ? 0 : s.offsetY ?? 0,
    }));
  }

  onInspectorGridSizePreset(squares: number): void {
    this.userCustomizedObjectScale = true;
    this.selectedNode.update((cur) => ({
      ...cur,
      scale: squares,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    }));
    this.syncGhostCursorToStage();
    this.updateTargetStamp((s) => ({
      ...s,
      scale: squares,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    }));
  }

  onInspectorColorHexChange(colorHex: string): void {
    this.selectedNode.update((cur) => ({ ...cur, colorHex }));
    this.syncGhostCursorToStage();
    if (this.selectedPlacedKind() === 'wall' || this.activeDockToolId() === 'wall' || this.activeDockToolId() === 'room') {
      const targetWallId =
        this.selectedPlacedKind() === 'wall' ? this.selectedPlacedId() : null;
      this.commitSceneUpdate((cur) => ({
        ...cur,
        revision: cur.revision + 1,
        walls: (cur.walls ?? []).map((w, idx, arr) =>
          (targetWallId ? w.id === targetWallId : idx === arr.length - 1)
            ? { ...w, colorHex }
            : w,
        ),
      }));
      return;
    }
    this.updateTargetStamp((s) => ({ ...s, colorHex }));
  }

  onInspectorSurfaceFinishChange(surfaceFinish: LwObjectSurfaceFinish): void {
    this.selectedNode.update((cur) => ({ ...cur, surfaceFinish }));
    this.syncGhostCursorToStage();
    this.updateTargetStamp((s) => ({ ...s, surfaceFinish }));
  }

  onInspectorOpacityChange(opacity: number): void {
    this.selectedNode.update((cur) => ({ ...cur, opacity }));
    this.updateTargetStamp((s) => ({ ...s, opacity }));
  }

  onInspectorBlocksVisionToggle(): void {
    this.selectedNode.update((cur) => ({ ...cur, blocksVision: !cur.blocksVision }));
    const nextVal = this.selectedNode().blocksVision;
    this.updateTargetStamp((s) => ({ ...s, blocksVision: nextVal }));
  }

  onInspectorBlocksMovementToggle(): void {
    this.selectedNode.update((cur) => ({ ...cur, blocksMovement: !cur.blocksMovement }));
    const nextVal = this.selectedNode().blocksMovement;
    this.updateTargetStamp((s) => ({ ...s, blocksMovement: nextVal }));
  }

  onDuplicateSelectedPlacedNode(): void {
    const pickedId = this.selectedPlacedId();
    const pickedKind = this.selectedPlacedKind();
    if (!pickedId || pickedKind !== 'object') return;
    const orig = this.sceneGraph().stamps.find((s) => s.id === pickedId);
    if (!orig) return;
    const dupId = `st-${this.sceneGraph().revision + 1}`;
    const nextX = Math.min(16.5, orig.x + 1.5);
    this.recordHistoryBeforeEdit(`Duplicate -> ${orig.label}`);
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      stamps: [
        ...cur.stamps,
        {
          ...orig,
          id: dupId,
          x: nextX,
        },
      ],
    }));
    this.selectedPlacedId.set(dupId);
    this.selectedNode.update((cur) => ({ ...cur, gridX: nextX }));
    this.stage.focusGizmoAt(nextX, (orig.offsetY ?? 0) + 0.1, orig.z);
    this.pngPipelineBanner.set(`Duplicated '${orig.label}' to next grid square.`);
  }

  onClearWaterSplines(): void {
    this.waterEditor.select('');
    this.recordHistoryBeforeEdit('Clear Water Splines');
    this.commitSceneUpdate((cur) => ({ ...cur, revision: cur.revision + 1, waterSplines: [] }));
  }

  onClearScatterClusters(): void {
    this.recordHistoryBeforeEdit('Clear Scatter Clusters');
    this.commitSceneUpdate((cur) => ({
      ...cur,
      revision: cur.revision + 1,
      scatterDensity: 0,
      scatterClusters: [],
    }));
  }

  onUploadSingleGlb(file: File): void {
    this.pngApi.uploadSingleGlb(file, (asset) => this.onSelectPngAsset(asset));
  }

  private captureCurrentSnapshot(label: string): MapStudioSnapshot {
    return {
      label,
      timestamp: `Rev ${this.sceneGraph().revision}`,
      sceneGraph: this.sceneGraph(),
      layers: this.studio.layers(),
      activeLevelIndex: this.studio.activeLevelIndex(),
    };
  }

  private recordHistoryBeforeEdit(label: string): void {
    this.history.pushSnapshot(this.captureCurrentSnapshot(label));
  }

  private commitSceneUpdate(updater: (cur: MapSceneGraphState) => MapSceneGraphState): void {
    this.sceneGraph.update((cur) => {
      const updated = updater(cur);
      this.stage.syncSceneGraph(updated);
      return updated;
    });
    this.render2dViewport();
  }

  undoLastCommand(): void {
    const prev = this.history.undo(this.captureCurrentSnapshot('Current State'));
    if (prev) {
      this.sceneGraph.set(prev.sceneGraph);
      this.stage.syncSceneGraph(prev.sceneGraph);
      this.waterEditor.select(this.waterEditor.selectedId() ?? '');
      this.render2dViewport();
    }
  }

  redoLastCommand(): void {
    const next = this.history.redo(this.captureCurrentSnapshot('Current State'));
    if (next) {
      this.sceneGraph.set(next.sceneGraph);
      this.stage.syncSceneGraph(next.sceneGraph);
      this.waterEditor.select(this.waterEditor.selectedId() ?? '');
      this.render2dViewport();
    }
  }

  saveSceneRevision(): void {
    const key = this.selectedSceneKey() || this.sceneGraph().sceneKey || 'scene-untitled-map';
    if (this.selectedSceneKey() !== key) {
      this.selectedSceneKey.set(key);
    }
    const customElevations = this.stage.exportTerrainElevations();
    const floorPaintDabs = this.stage.exportFloorPaintDabs();
    const updatedGraph: MapSceneGraphState = {
      ...this.sceneGraph(),
      sceneKey: key,
      name: this.mapTitle() || this.sceneGraph().name || 'Untitled Map',
      gridScalePct: this.gridScalePct(),
      gridCols: this.gridCols(),
      gridRows: this.gridRows(),
      gridMode: this.gridSizeLabel(),
      gridOffsetX: this.gridOffsetX(),
      gridOffsetZ: this.gridOffsetZ(),
      gridOpacityPct: this.gridOpacityPct(),
      customElevations,
      floorPaintDabs,
    };
    this.sceneGraph.set(updatedGraph);
    this.studio.saveAuthoritativeRevision(
      this.store.activeCampaignId(),
      key,
      updatedGraph,
    );
    const campName = this.store.activeCampaign().name || 'Active Campaign';
    const sessLabel =
      this.sessions().find((s) => s.id === this.assignSessionId())?.label ?? 'Current Session';
    this.mergeIntoExistingMaps([
      {
        sceneKey: key,
        name: updatedGraph.name,
        dimensionMode: this.dimensionMode(),
        campaignId: this.store.activeCampaignId(),
        campaignName: campName,
        sessionLabel: sessLabel,
        encounterLabel: 'Campaign Battlemap',
        gridSummary: `${this.gridCols()}x${this.gridRows()} (5ft sq)`,
        floorBumpName: this.activeTheme(),
        previewUrl:
          this.stage.captureViewportDataUrl() ??
          updatedGraph.floorAlbedoUrl ??
          '/battlemap-showcase.jpg',
        updatedLabel: `Saved Rev ${updatedGraph.revision}`,
        revision: updatedGraph.revision,
        creatorAccount: 'GM Studio',
        popularityRating: 'Saved Campaign Map',
        priceLabel: 'Campaign Map',
        accessKind: 'owned',
      },
    ]);
  }

  private legacySaveSceneRevisionUnused(): void {
    this.studio.saveAuthoritativeRevision(
      this.store.activeCampaignId(),
      this.selectedSceneKey(),
      this.sceneGraph(),
    );
  }

  publishMapToCoreCampaign(): void {
    const sessList = this.sessions();
    const sessionObj =
      sessList.find((s) => s.id === this.assignSessionId()) ?? sessList[0];
    const sessionId = sessionObj?.id || this.store.activeSessionId() || 'session-1';
    const sessLabel =
      sessionObj?.label ||
      this.store.activeSession()?.label ||
      this.store.activeSession()?.title ||
      'Current Session';

    const encList = this.encounters();
    const encounterObj =
      encList.find((e) => e.id === this.assignEncounterId()) ?? encList[0];
    if (encounterObj && this.assignEncounterId() !== encounterObj.id) {
      this.assignEncounterId.set(encounterObj.id);
    }
    const encLabel = encounterObj?.label || 'Campaign Battlemap';

    this.store.setActiveSession(sessionId);
    this.saveSceneRevision();
    const campName = this.store.activeCampaign().name;
    const previewArt =
      this.stage.captureViewportDataUrl() ??
      this.sceneGraph().floorAlbedoUrl ??
      '/battlemap-showcase.jpg';
    const sceneKey = this.selectedSceneKey();

    this.adventureGuide.assignBattlemapToSessionAndPlace({
      sceneKey,
      sceneTitle: this.mapTitle(),
      sessionId,
      sessionTitle: sessLabel,
      locationNodeId: this.assignLocationNodeId() || encounterObj?.id || '',
      locationTitle: encLabel,
      artworkUrl: previewArt,
      biome: this.activeTheme(),
    });
    this.store.attachElementToSession({
      sessionId,
      elementKind: 'Map',
      targetKey: sceneKey,
      title: this.mapTitle(),
      subtitle: `${this.dimensionMode().toUpperCase()} Battlemap · ${this.activeTheme()}`,
      summary: `${sessLabel} · ${encLabel}`,
      routeLink: `/arcane-screen?scene=${sceneKey}`,
      visibility: 'players',
      artworkUrl: previewArt,
    });
    this.existingMaps.update((cur) => {
      const updatedSummary: LwExistingMapSummary = {
        sceneKey,
        name: this.mapTitle(),
        dimensionMode: this.dimensionMode(),
        campaignId: this.store.activeCampaignId(),
        campaignName: campName,
        sessionLabel: sessLabel,
        encounterLabel: encLabel,
        gridSummary: `${this.gridCols()}x${this.gridRows()} (5ft sq)`,
        floorBumpName: this.activeTheme(),
        previewUrl: previewArt,
        updatedLabel: 'Published just now',
        revision: this.sceneGraph().revision,
        creatorAccount: 'GM Studio',
        popularityRating: 'Active Table Map',
        priceLabel: 'Campaign Map',
        accessKind: 'owned',
      };
      return [updatedSummary, ...cur.filter((m) => m.sceneKey !== sceneKey)];
    });
    this.pngPipelineBanner.set(
      `Published '${this.mapTitle()}' (${this.dimensionMode().toUpperCase()}) -> ${campName} · ${sessLabel} · ${encLabel}`,
    );
    this.audio.fireTrigger('battlemap', sceneKey, this.mapTitle(), false);
  }

  private legacyPublishMapToCoreCampaignUnused(): void {
    const sessionId = this.assignSessionId() || this.sessions()[0]?.id || 'session-1';
    this.store.setActiveSession(sessionId);
    this.saveSceneRevision();
    const campName = this.store.activeCampaign().name;
    const sessLabel =
      this.sessions().find((s) => s.id === sessionId)?.label ?? 'Selected session';
    const encLabel =
      this.encounters().find((e) => e.id === this.assignEncounterId())?.label ??
      'Unassigned encounter';
    const previewArt =
      this.stage.captureViewportDataUrl() ??
      this.sceneGraph().floorAlbedoUrl ??
      '/battlemap-showcase.jpg';
    this.adventureGuide.assignBattlemapToSessionAndPlace({
      sceneKey: this.selectedSceneKey(),
      sceneTitle: this.mapTitle(),
      sessionId,
      locationNodeId: this.assignLocationNodeId(),
      artworkUrl: previewArt,
      biome: this.activeTheme(),
    });
    this.store.attachElementToSession({
      sessionId,
      elementKind: 'Map',
      targetKey: this.selectedSceneKey(),
      title: this.mapTitle(),
      subtitle: `${this.dimensionMode().toUpperCase()} Battlemap · ${this.activeTheme()}`,
      summary: `Published to ${sessLabel} (${encLabel})`,
      routeLink: `/arcane-screen?scene=${this.selectedSceneKey()}`,
      visibility: 'players',
      artworkUrl: previewArt,
    });
    this.pngPipelineBanner.set(
      `Published '${this.mapTitle()}' (${this.dimensionMode().toUpperCase()}) -> ${campName} · ${sessLabel} · ${encLabel}`,
    );
    this.audio.fireTrigger('battlemap', this.selectedSceneKey(), this.mapTitle(), false);
  }
}
