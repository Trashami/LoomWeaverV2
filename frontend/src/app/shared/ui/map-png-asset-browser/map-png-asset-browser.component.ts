import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../icon/icon.component';

export type LwRightBrowserTab = 'assets' | 'materials' | 'themes' | 'layers';

export type LwAssetToolRole =
  | 'wall-texture'
  | 'wall-3d'
  | 'floor-texture'
  | 'door-3d'
  | 'object-3d'
  | 'floor-stamp-2d';

export interface LwMapPngAssetItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly modelUrl: string;
  readonly thumbnailUrl: string;
  readonly albedoUrl?: string;
  readonly normalUrl?: string;
  readonly heightUrl?: string;
  readonly isFloor?: boolean;
  readonly isWall?: boolean;
  readonly isDoor?: boolean;
  readonly isObject?: boolean;
  readonly toolRole?: LwAssetToolRole;
  readonly defaultScaleGrid?: readonly [number, number, number];
  readonly defaultPlacement?: 'floor' | 'custom';
  readonly snapToGrid?: boolean;
  readonly defaultColorTint?: string;
  readonly contentHash?: string;
  readonly vertexCount?: number;
  readonly faceCount?: number;
  readonly dimensions?: readonly number[];
  readonly tags?: readonly string[];
}

export interface LwMapMaterialPreset {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly baseHex: string;
  readonly accentHex: string;
  readonly roughnessLabel: string;
}

export interface LwMapLayerStatusItem {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly gmSecretOnly: boolean;
  readonly itemCount: number;
}

@Component({
  selector: 'lw-map-png-asset-browser',
  imports: [NgpButton, LwIconComponent],
  templateUrl: './map-png-asset-browser.component.html',
  styleUrl: './map-png-asset-browser.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapPngAssetBrowserComponent {
  readonly assets = input<readonly LwMapPngAssetItem[]>([]);
  readonly selectedAssetId = input<string>('');
  readonly categories = input<readonly string[]>([
    'All',
    'Architecture',
    'Furniture',
    'Props',
    'Nature',
    'Rocks & Cliffs',
    'Lighting',
    'Tokens',
    'Water',
  ]);
  readonly materials = input<readonly LwMapMaterialPreset[]>([]);
  readonly selectedMaterialId = input<string>('aged-dungeon-stone');
  readonly layers = input<readonly LwMapLayerStatusItem[]>([]);
  readonly themes = input<readonly string[]>([
    'Abandoned Crypt',
    'Ballroom',
    'Poisoned Canopy',
    'Battlefield',
    'Cliff Keep',
  ]);
  readonly activeTheme = input<string>('Abandoned Crypt');
  readonly batchBusy = input<boolean>(false);
  readonly statusBanner = input<string>('');

  readonly assetSelect = output<LwMapPngAssetItem>();
  readonly assetPlaceInScene = output<LwMapPngAssetItem>();
  readonly materialSelect = output<LwMapMaterialPreset>();
  readonly themeSelect = output<string>();
  readonly layerToggleVisible = output<string>();
  readonly layerToggleSecret = output<string>();
  readonly triggerBatchRender = output<void>();
  readonly uploadSingleGlb = output<File>();

  readonly activeTab = signal<LwRightBrowserTab>('assets');
  readonly activeCategory = signal<string>('All');
  readonly searchQuery = signal<string>('');
  readonly pageLimit = signal<number>(48);

  readonly filteredAssets = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const cat = this.activeCategory();
    return this.assets().filter((item) => {
      const catMatch = cat === 'All' || item.category.toLowerCase() === cat.toLowerCase();
      if (!catMatch) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.tags ?? []).some((tag) => tag.toLowerCase().includes(query))
      );
    });
  });

  readonly visibleAssets = computed(() => this.filteredAssets().slice(0, this.pageLimit()));

  readonly hasMoreAssets = computed(() => this.filteredAssets().length > this.pageLimit());

  selectTab(tab: LwRightBrowserTab): void {
    this.activeTab.set(tab);
  }

  selectCategory(category: string): void {
    this.activeCategory.set(category);
    this.pageLimit.set(48);
  }

  onSearchInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement | null;
    this.searchQuery.set(inputEl?.value ?? '');
    this.pageLimit.set(48);
  }

  showMoreAssets(): void {
    this.pageLimit.update((current) => current + 48);
  }

  onSingleFilePicked(event: Event): void {
    const inputEl = event.target as HTMLInputElement | null;
    const file = inputEl?.files?.[0];
    if (file) {
      this.uploadSingleGlb.emit(file);
      inputEl.value = '';
    }
  }
}
