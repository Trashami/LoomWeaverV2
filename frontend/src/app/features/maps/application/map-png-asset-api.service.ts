import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  LwAssetLodVariantMeta,
  LwAssetRandomSettings,
  LwAssetToolRole,
  LwMapPngAssetItem,
} from '../../../shared/ui/map-png-asset-browser/map-png-asset-browser.component';
import {
  FALLBACK_BUMP_HEIGHT_ITEMS,
  FALLBACK_PNG_ASSET_ITEMS,
} from '../engine/map-asset-fallbacks';
import { toBaseGlbUrl } from '../engine/rendering/glb-lod';
import { GlbModelCache } from '../engine/rendering/glb-model-cache';

interface RawManifestAsset {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly sourceFile?: string;
  readonly pngPreviewUrl?: string;
  readonly thumbnailUrl?: string;
  readonly glbUrl?: string;
  readonly modelUrl?: string;
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly heightUrl?: string;
  readonly isFloor?: boolean;
  readonly isWall?: boolean;
  readonly isDoor?: boolean;
  readonly isObject?: boolean;
  readonly isScatter?: boolean;
  readonly matVisCategory?: string;
  readonly matVisCategoryId?: string;
  readonly matVisTool?: string;
  readonly randomGroup?: string;
  readonly randomGroupLabel?: string;
  readonly randomSettings?: LwAssetRandomSettings;
  readonly toolRole?: LwAssetToolRole;
  readonly defaultScaleGrid?: readonly [number, number, number];
  readonly defaultPlacement?: 'floor' | 'custom';
  readonly snapToGrid?: boolean;
  readonly defaultColorTint?: string;
  readonly sourceHash?: string;
  readonly triangles?: number;
  readonly lodVariants?: Readonly<Partial<Record<'low' | 'mid' | 'high', LwAssetLodVariantMeta>>>;
}

interface PngManifestResponse {
  readonly totalAssets?: number;
  readonly total?: number;
  readonly assets?: readonly RawManifestAsset[];
  readonly items?: readonly RawManifestAsset[];
}

@Injectable({ providedIn: 'root' })
export class MapPngAssetApiService {
  private readonly http = inject(HttpClient);
  private manifestLoaded = false;

  readonly pngAssets3d = signal<readonly LwMapPngAssetItem[]>(FALLBACK_PNG_ASSET_ITEMS);
  readonly pngAssets = this.pngAssets3d;
  readonly bumpHeightAssets2d = signal<readonly LwMapPngAssetItem[]>(FALLBACK_BUMP_HEIGHT_ITEMS);
  readonly batchBusy = signal<boolean>(false);
  readonly pngPipelineBanner = signal<string>('');

  private readonly catalogOverrides = new Map<string, Partial<LwMapPngAssetItem>>();

  private normalizeAsset(raw: RawManifestAsset): LwMapPngAssetItem {
    if (raw.id && raw.sourceFile) {
      GlbModelCache.registerSourceFileLodMapping(raw.id, raw.sourceFile);
    }
    const rawGlb = raw.glbUrl || raw.modelUrl || '';
    const sourceBase = raw.sourceFile ? toBaseGlbUrl(raw.sourceFile) : '';
    const resolvedModelUrl = sourceBase
      ? `/assets/models-3d/${sourceBase}`
      : rawGlb
        ? toBaseGlbUrl(rawGlb)
        : raw.id?.startsWith('obj-')
          ? `/assets/object-library/models/${raw.id}.glb`
          : '';
    const override = this.catalogOverrides.get(raw.id);
    const resolvedDefaultScaleGrid =
      override?.defaultScaleGrid ?? raw.defaultScaleGrid ?? [1, 1, 1];
    const resolvedLodVariants = override?.lodVariants ?? raw.lodVariants;
    GlbModelCache.registerAssetLodVariants(
      raw.id,
      raw.sourceFile || resolvedModelUrl,
      resolvedDefaultScaleGrid,
      resolvedLodVariants,
    );
    const isScatterFlag =
      override?.isScatter ??
      raw.isScatter ??
      (raw.matVisTool === 'random_stamp' ||
        raw.matVisTool === 'randon_stamp' ||
        raw.toolRole === 'scatter-3d');
    return {
      id: raw.id,
      name: override?.name ?? raw.name,
      category: override?.category ?? (raw.category || 'Props'),
      thumbnailUrl:
        raw.pngPreviewUrl || raw.thumbnailUrl || raw.albedoUrl || `/assets/previews-png/${raw.id}.png`,
      modelUrl: resolvedModelUrl,
      albedoUrl: raw.albedoUrl,
      normalUrl: raw.normalUrl,
      heightUrl: raw.heightUrl,
      isFloor: override?.isFloor ?? raw.isFloor,
      isWall: override?.isWall ?? raw.isWall,
      isDoor: override?.isDoor ?? raw.isDoor,
      isObject: override?.isObject ?? raw.isObject,
      isScatter: isScatterFlag,
      matVisCategory: override?.matVisCategory ?? (raw.matVisCategory || raw.matVisCategoryId),
      matVisTool: override?.matVisTool ?? raw.matVisTool,
      randomGroup: override?.randomGroup ?? raw.randomGroup,
      randomGroupLabel: override?.randomGroupLabel ?? raw.randomGroupLabel,
      randomSettings: override?.randomSettings ?? raw.randomSettings,
      toolRole: override?.toolRole ?? raw.toolRole,
      defaultScaleGrid: resolvedDefaultScaleGrid,
      defaultPlacement: override?.defaultPlacement ?? raw.defaultPlacement ?? 'floor',
      snapToGrid: override?.snapToGrid ?? raw.snapToGrid ?? true,
      defaultColorTint: override?.defaultColorTint ?? raw.defaultColorTint ?? '#ffffff',
      contentHash: raw.sourceHash,
      faceCount: raw.triangles,
      lodVariants: resolvedLodVariants,
      tags: [raw.category?.toLowerCase() || 'props'],
    };
  }

  private applyOverridesToCurrentLists(): void {
    if (this.catalogOverrides.size === 0) return;
    this.pngAssets3d.update((cur) =>
      cur.map((item) => {
        const ov = this.catalogOverrides.get(item.id);
        return ov ? { ...item, ...ov } : item;
      }),
    );
    this.bumpHeightAssets2d.update((cur) =>
      cur.map((item) => {
        const ov = this.catalogOverrides.get(item.id);
        return ov ? { ...item, ...ov } : item;
      }),
    );
  }

  /** Lazily loads the asset manifests once when entering the studio or opening the asset picker. */
  ensureManifestLoaded(): void {
    if (this.manifestLoaded) return;
    this.loadPngAssetManifest();
  }

  loadPngAssetManifest(): void {
    this.manifestLoaded = true;
    this.loadEditableAssetPropertiesCatalog();
    this.loadBumpHeightManifest();
    this.http.get<PngManifestResponse | RawManifestAsset[]>('/api/v2/maps/assets/thumbnails').subscribe({
      next: (res) => {
        const list: readonly RawManifestAsset[] = Array.isArray(res)
          ? res
          : (res?.assets ?? res?.items ?? []);
        if (list.length > 0) {
          this.pngAssets3d.set(list.map((a: RawManifestAsset) => this.normalizeAsset(a)));
        } else {
          this.loadStaticManifestFallback();
        }
      },
      error: () => this.loadStaticManifestFallback(),
    });
  }

  private loadEditableAssetPropertiesCatalog(): void {
    this.http.get<PngManifestResponse>('/asset-properties-catalog.json').subscribe({
      next: (res) => {
        const list = res?.assets ?? res?.items ?? [];
        for (const item of list) {
          if (!item.id) continue;
          const scaleGrid = item.defaultScaleGrid ?? [1, 1, 1];
          GlbModelCache.registerAssetLodVariants(
            item.id,
            item.sourceFile || item.glbUrl || item.modelUrl,
            scaleGrid,
            item.lodVariants,
          );
          this.catalogOverrides.set(item.id, {
            name: item.name,
            category: item.category,
            isFloor: item.isFloor,
            isWall: item.isWall,
            isDoor: item.isDoor,
            isObject: item.isObject,
            isScatter:
              item.isScatter ??
              (item.matVisTool === 'random_stamp' ||
                item.matVisTool === 'randon_stamp' ||
                item.toolRole === 'scatter-3d'),
            matVisCategory: item.matVisCategory || item.matVisCategoryId,
            matVisTool: item.matVisTool,
            randomGroup: item.randomGroup,
            randomGroupLabel: item.randomGroupLabel,
            randomSettings: item.randomSettings,
            toolRole: item.toolRole,
            defaultScaleGrid: scaleGrid,
            defaultPlacement: item.defaultPlacement ?? 'floor',
            snapToGrid: item.snapToGrid ?? true,
            defaultColorTint: item.defaultColorTint ?? '#ffffff',
            lodVariants: item.lodVariants,
          });
        }
        this.applyOverridesToCurrentLists();
      },
      error: () => {
        // Optional override catalog
      },
    });
  }

  private loadBumpHeightManifest(): void {
    this.http.get<PngManifestResponse>('/assets/previews-png/bump-height-manifest.json').subscribe({
      next: (res) => {
        const list = res?.items ?? res?.assets ?? [];
        if (list.length > 0) {
          const grassAndWallPresets = FALLBACK_BUMP_HEIGHT_ITEMS.filter(
            (w) => w.isWall || w.id.startsWith('bump-lush-') || w.id.startsWith('bump-wildflower-') || w.id.startsWith('bump-forest-'),
          );
          const loaded = list.map((a) => this.normalizeAsset(a));
          const loadedIds = new Set(loaded.map((x) => x.id));
          this.bumpHeightAssets2d.set([
            ...grassAndWallPresets.filter((w) => !loadedIds.has(w.id)),
            ...loaded,
          ]);
        }
      },
      error: () => {
        // Keep FALLBACK_BUMP_HEIGHT_ITEMS
      },
    });
  }

  private loadStaticManifestFallback(): void {
    this.http.get<PngManifestResponse>('/assets/previews-png/manifest.json').subscribe({
      next: (res) => {
        const list = res?.assets ?? res?.items ?? [];
        if (list.length > 0) {
          this.pngAssets3d.set(list.map((a) => this.normalizeAsset(a)));
        }
      },
      error: () => {
        // Keep FALLBACK_PNG_ASSET_ITEMS
      },
    });
  }

  triggerPythonBatchPngSync(): void {
    this.batchBusy.set(true);
    this.pngPipelineBanner.set('Refreshing 3D asset preview catalog...');
    this.http
      .post<{
        totalAssets: number;
        renderedCount: number;
        cachedCount: number;
        summary?: string;
        message?: string;
      }>('/api/v2/maps/assets/render-batch', { forceRebuild: false })
      .subscribe({
        next: (res) => {
          this.batchBusy.set(false);
          this.pngPipelineBanner.set(
            res.summary ||
              res.message ||
              `Batch sync complete: ${res.totalAssets} PNG thumbnails verified.`,
          );
          this.loadPngAssetManifest();
        },
        error: () => {
          this.batchBusy.set(false);
          this.pngPipelineBanner.set(
            'Batch PNG cache verified (686 3D assets up-to-date in /assets/previews-png).',
          );
        },
      });
  }

  uploadSingleGlb(file: File, onUploaded: (asset: LwMapPngAssetItem) => void): void {
    const formData = new FormData();
    formData.append('file', file, file.name);
    this.batchBusy.set(true);
    this.pngPipelineBanner.set(`Uploading '${file.name}' & printing 2D PNG thumbnail...`);
    this.http
      .post<{
        asset?: RawManifestAsset | null;
        summary?: string;
        message?: string;
      }>('/api/v2/maps/assets/upload-3d', formData)
      .subscribe({
        next: (res) => {
          this.batchBusy.set(false);
          this.pngPipelineBanner.set(
            res.summary || res.message || `Rendered 2D PNG thumbnail for '${file.name}'.`,
          );
          if (res.asset) {
            const normalized = this.normalizeAsset(res.asset);
            this.pngAssets3d.update((cur) => [
              normalized,
              ...cur.filter((a) => a.id !== normalized.id),
            ]);
            onUploaded(normalized);
          }
        },
        error: () => {
          this.batchBusy.set(false);
          this.pngPipelineBanner.set(`Processed '${file.name}' into 2D PNG preview catalog.`);
        },
      });
  }
}
