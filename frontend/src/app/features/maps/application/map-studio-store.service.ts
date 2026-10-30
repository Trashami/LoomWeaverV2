import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  MapCatalogAssetItem,
  MapGridConfig,
  MapLayerBlendMode,
  MapLevelFloor,
  MapPresetTemplate,
  MapStudioLayer,
  StampOcclusionMode,
} from './map-studio.models';
import type { MapSceneGraphState } from '../engine/map-scene-contract';
import { GlbModelCache } from '../engine/rendering/glb-model-cache';
import { ModelManifestResponse, buildGlbLodManifest } from '../engine/rendering/glb-lod';

interface SavedMapSceneDocument extends MapSceneGraphState {
  readonly studio?: {
    readonly mapTitle: string;
    readonly activeLevelIndex: number;
    readonly ghostLowerFloors: boolean;
    readonly testTokenSandbox: boolean;
    readonly gridConfig: MapGridConfig;
    readonly levels: readonly MapLevelFloor[];
    readonly layers: readonly MapStudioLayer[];
  };
}

@Injectable({ providedIn: 'root' })
export class MapStudioStoreService {
  private readonly http = inject(HttpClient);

  readonly mapTitle = signal<string>('Untitled Map');
  readonly activeLevelIndex = signal<number>(1);
  readonly ghostLowerFloors = signal<boolean>(true);
  readonly testTokenSandbox = signal<boolean>(false);
  readonly activeLayerId = signal<string>('layer-objects');
  readonly selectedStampId = signal<string>('');
  readonly selectedOcclusionMode = signal<StampOcclusionMode>('fade');
  readonly savingRevision = signal<boolean>(false);
  readonly serverSceneRevision = signal<number>(0);
  readonly saveStatusBanner = signal<string>(
    'Scene edits stay local until saved to the campaign.',
  );
  private sceneLoadVersion = 0;

  readonly gridConfig = signal<MapGridConfig>({
    gridType: 'square',
    gridSizePx: 50,
    gridOpacityPercent: 40,
    showGrid: true,
    snapToGrid: true,
    mapScope: 'battlemap',
  });

  readonly levels = signal<readonly MapLevelFloor[]>([
    { id: 'lvl-0', levelIndex: 0, name: 'L0 · Lower Level', elevationMinFt: -20, elevationMaxFt: 0 },
    { id: 'lvl-1', levelIndex: 1, name: 'L1 · Ground Level', elevationMinFt: 0, elevationMaxFt: 15 },
    { id: 'lvl-2', levelIndex: 2, name: 'L2 · Upper Level', elevationMinFt: 15, elevationMaxFt: 35 },
  ]);

  readonly layers = signal<readonly MapStudioLayer[]>([
    { id: 'layer-base', name: 'Base Floor & Marble', type: 'floors', icon: 'Grid', visible: true, locked: false, opacityPercent: 100, blendMode: 'normal', zIndex: 10 },
    { id: 'layer-terrain', name: 'Biome & Elevation Relief', type: 'terrain', icon: 'Map', visible: true, locked: false, opacityPercent: 100, blendMode: 'normal', zIndex: 20 },
    { id: 'layer-water', name: 'Reflective Canals & Splines', type: 'water', icon: 'book', visible: true, locked: false, opacityPercent: 95, blendMode: 'screen', zIndex: 30 },
    { id: 'layer-walls', name: 'Cutaway Walls & Portals', type: 'walls', icon: 'Shield', visible: true, locked: false, opacityPercent: 100, blendMode: 'normal', zIndex: 40 },
    { id: 'layer-objects', name: '2D/3D Linked Stamps & Props', type: 'objects', icon: 'Layers', visible: true, locked: false, opacityPercent: 100, blendMode: 'normal', zIndex: 50 },
    { id: 'layer-lights', name: '2.5D Dynamic Lights & Shadows', type: 'lights', icon: 'Flame', visible: true, locked: false, opacityPercent: 100, blendMode: 'screen', zIndex: 60 },
    { id: 'layer-notes', name: 'GM Scene Notes & Secrets', type: 'notes', icon: 'Eye', visible: true, locked: false, opacityPercent: 90, blendMode: 'normal', zIndex: 70 },
    { id: 'layer-overlays', name: 'Cartography & Weather FX', type: 'overlays', icon: 'Compass', visible: true, locked: false, opacityPercent: 85, blendMode: 'overlay', zIndex: 80 },
  ]);

  readonly presets = signal<readonly MapPresetTemplate[]>([]);

  readonly catalogAssets = signal<readonly MapCatalogAssetItem[]>([]);

  constructor() {
    this.loadStudioResources();
  }

  loadStudioResources(): void {
    this.http.get<MapPresetTemplate[]>('/api/v2/maps/presets').subscribe({
      next: (list) => {
        if (Array.isArray(list) && list.length > 0) this.presets.set(list);
      },
      error: () => {},
    });

    this.http.get<MapCatalogAssetItem[]>('/api/v2/maps/catalog-assets').subscribe({
      next: (list) => {
        if (Array.isArray(list) && list.length > 0) this.catalogAssets.set(list);
      },
      error: () => {},
    });

    this.http.get<ModelManifestResponse>('/api/v2/maps/assets/model-manifest').subscribe({
      next: (res) => GlbModelCache.setLodManifest(buildGlbLodManifest(res)),
      error: () => {},
    });
  }

  addUpperLevel(): void {
    this.levels.update((cur) => {
      const nextIdx = cur.length;
      const prevMax = cur[cur.length - 1]?.elevationMaxFt ?? 20;
      return [
        ...cur,
        {
          id: `lvl-${nextIdx}`,
          levelIndex: nextIdx,
          name: `L${nextIdx} · Upper Tower Tier ${nextIdx}`,
          elevationMinFt: prevMax,
          elevationMaxFt: prevMax + 15,
        },
      ];
    });
    this.activeLevelIndex.set(this.levels().length - 1);
  }

  toggleLayerVisibility(layerId: string): void {
    this.layers.update((list) =>
      list.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    );
  }

  toggleLayerLock(layerId: string): void {
    this.layers.update((list) =>
      list.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)),
    );
  }

  updateLayerOpacity(layerId: string, opacityPercent: number): void {
    this.layers.update((list) =>
      list.map((l) => (l.id === layerId ? { ...l, opacityPercent } : l)),
    );
  }

  updateLayerBlendMode(layerId: string, blendMode: MapLayerBlendMode): void {
    this.layers.update((list) =>
      list.map((l) => (l.id === layerId ? { ...l, blendMode } : l)),
    );
  }

  addCustomLayer(): void {
    const idx = this.layers().length + 1;
    const id = `layer-custom-${idx}`;
    this.layers.update((list) => [
      ...list,
      {
        id,
        name: `Custom Studio Layer #${idx}`,
        type: 'custom',
        icon: 'Layers',
        visible: true,
        locked: false,
        opacityPercent: 100,
        blendMode: 'normal',
        zIndex: idx * 10,
      },
    ]);
    this.activeLayerId.set(id);
  }

  loadSceneDocument(
    campaignId: number,
    sceneKey: string,
    onLoaded: (scene: SavedMapSceneDocument) => void,
  ): void {
    const requestVersion = ++this.sceneLoadVersion;
    this.serverSceneRevision.set(0);
    this.http
      .get<{ revision: number; document: SavedMapSceneDocument }>(
        `/api/v2/campaigns/${campaignId}/maps/${encodeURIComponent(sceneKey)}/document`,
      )
      .subscribe({
        next: (res) => {
          if (requestVersion !== this.sceneLoadVersion) return;
          this.serverSceneRevision.set(res.revision);
          if (res.document.studio) {
            this.mapTitle.set(res.document.studio.mapTitle);
            this.activeLevelIndex.set(res.document.studio.activeLevelIndex);
            this.ghostLowerFloors.set(res.document.studio.ghostLowerFloors);
            this.testTokenSandbox.set(res.document.studio.testTokenSandbox);
            this.gridConfig.set(res.document.studio.gridConfig);
            this.levels.set(res.document.studio.levels);
            this.layers.set(res.document.studio.layers);
          }
          onLoaded(res.document);
          this.saveStatusBanner.set(`Loaded saved server scene at revision ${res.revision}.`);
        },
        error: (err) => {
          if (requestVersion !== this.sceneLoadVersion) return;
          this.saveStatusBanner.set(
            err.status === 404
              ? 'No saved server scene exists yet; the starter scene is ready to edit.'
              : 'The saved scene could not be loaded. Check the connection and try again.',
          );
        },
      });
  }

  saveAuthoritativeRevision(
    campaignId: number,
    sceneKey: string,
    sceneGraph: MapSceneGraphState,
  ): void {
    this.savingRevision.set(true);
    const payload = {
      expectedRevision: this.serverSceneRevision(),
      document: {
        ...sceneGraph,
        studio: {
          mapTitle: this.mapTitle(),
          activeLevelIndex: this.activeLevelIndex(),
          ghostLowerFloors: this.ghostLowerFloors(),
          testTokenSandbox: this.testTokenSandbox(),
          gridConfig: this.gridConfig(),
          levels: this.levels(),
          layers: this.layers(),
        },
      },
    };

    this.http
      .put<{ revision: number }>(
        `/api/v2/campaigns/${campaignId}/maps/${encodeURIComponent(sceneKey)}/document`,
        payload,
      )
      .subscribe({
        next: (res) => {
          this.savingRevision.set(false);
          this.serverSceneRevision.set(res.revision);
          this.saveStatusBanner.set(`Saved scene to the server at revision ${res.revision}.`);
        },
        error: (err) => {
          this.savingRevision.set(false);
          const msg = err?.error?.error ?? 'Scene save failed; no server copy was written.';
          this.saveStatusBanner.set(msg);
        },
      });
  }
}
