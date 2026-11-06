import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwIconComponent } from '../icon/icon.component';

export type LwMapDimensionMode = '2d' | '3d';
export type LwMarketAccessKind = 'free' | 'purchased' | 'paid';
export type LwMarketFilterTab = 'all' | 'free' | 'purchased' | 'paid';

export interface LwExistingMapSummary {
  readonly sceneKey: string;
  readonly name: string;
  readonly dimensionMode: LwMapDimensionMode;
  readonly campaignId: number;
  readonly campaignName: string;
  readonly sessionLabel: string;
  readonly encounterLabel: string;
  readonly gridSummary: string;
  readonly floorBumpName: string;
  readonly previewUrl: string;
  readonly updatedLabel: string;
  readonly revision: number;
  readonly creatorAccount: string;
  readonly popularityRating: string;
  readonly priceLabel: string;
  readonly accessKind?: 'owned' | 'free' | 'purchased' | 'paid';
}

export interface LwMarketplaceMapItem {
  readonly id: string;
  readonly sceneKey: string;
  readonly name: string;
  readonly dimensionMode: LwMapDimensionMode;
  readonly creatorAccount: string;
  readonly popularityRating: string;
  readonly tablesRunLabel: string;
  readonly priceLabel: string;
  readonly priceUsd: number;
  readonly accessKind: LwMarketAccessKind;
  readonly gridSummary: string;
  readonly floorBumpName: string;
  readonly previewUrl: string;
  readonly biomeTag: string;
  readonly description: string;
}

export interface LwCreateMapLaunchIntent {
  readonly name: string;
  readonly dimensionMode: LwMapDimensionMode;
  readonly gridCols: number;
  readonly gridRows: number;
  readonly campaignId: number;
  readonly sessionId: string;
  readonly encounterId: string;
  readonly starterFloorBumpId: string;
}

export interface LwApplyMarketplaceMapIntent {
  readonly marketMap: LwMarketplaceMapItem;
  readonly campaignId: number;
  readonly sessionId: string;
  readonly encounterId: string;
}

@Component({
  selector: 'lw-map-studio-landing',
  standalone: true,
  imports: [FormsModule, NgpButton, LwBadgeComponent, LwIconComponent],
  templateUrl: './map-studio-landing.component.html',
  styleUrl: './map-studio-landing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapStudioLandingComponent {
  readonly existingMaps = input<readonly LwExistingMapSummary[]>([]);
  readonly marketplaceMaps = input<readonly LwMarketplaceMapItem[]>([]);
  readonly campaigns = input<readonly { id: number; name: string }[]>([]);
  readonly sessions = input<readonly { id: string; label: string }[]>([]);
  readonly encounters = input<readonly { id: string; label: string }[]>([]);
  readonly activeCampaignId = input<number>(1);
  readonly selectedSessionId = input<string>('');
  readonly selectedEncounterId = input<string>('');

  readonly createNewMap = output<LwCreateMapLaunchIntent>();
  readonly openExistingMap = output<LwExistingMapSummary>();
  readonly applyMarketplaceMap = output<LwApplyMarketplaceMapIntent>();
  readonly purchaseMarketplaceMap = output<LwMarketplaceMapItem>();
  readonly campaignChange = output<number>();
  readonly assignMapToSession = output<{ map: LwExistingMapSummary; sessionId: string }>();

  readonly cardSessionSelections = signal<Readonly<Record<string, string>>>({});

  readonly showCreatePrompt = signal<boolean>(false);
  readonly showMarketplaceModal = signal<boolean>(false);
  readonly selectedDimension = signal<LwMapDimensionMode>('3d');
  readonly draftMapName = signal<string>('Untitled Map');
  readonly draftGridCols = signal<number>(50);
  readonly draftGridRows = signal<number>(50);
  readonly draftSessionId = signal<string>('');
  readonly draftEncounterId = signal<string>('');
  readonly draftStarterFloorId = signal<string>('bump-worn-castle-flagstone');

  constructor() {
    effect(
      () => {
        const list = this.sessions();
        const preferred = this.selectedSessionId();
        const current = this.draftSessionId();
        if (list.length > 0 && !list.some((s) => s.id === current)) {
          const match = list.find((s) => s.id === preferred)?.id ?? list[0].id;
          this.draftSessionId.set(match);
        }
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const list = this.encounters();
        const preferred = this.selectedEncounterId();
        const current = this.draftEncounterId();
        if (list.length > 0 && !list.some((e) => e.id === current)) {
          const match = list.find((e) => e.id === preferred)?.id ?? list[0].id;
          this.draftEncounterId.set(match);
        }
      },
      { allowSignalWrites: true },
    );
  }

  readonly marketSearchQuery = signal<string>('');
  readonly marketFilterTab = signal<LwMarketFilterTab>('all');
  readonly marketDimensionFilter = signal<'all' | '2d' | '3d'>('all');
  readonly purchasedMarketIds = signal<ReadonlySet<string>>(new Set<string>());

  @HostListener('window:keydown.escape')
  onEscapeKey(): void {
    if (this.showMarketplaceModal()) {
      this.showMarketplaceModal.set(false);
      return;
    }
    if (this.showCreatePrompt()) {
      this.showCreatePrompt.set(false);
    }
  }

  readonly resolvedMarketplaceMaps = computed<readonly LwMarketplaceMapItem[]>(() => {
    const unlocked = this.purchasedMarketIds();
    return this.marketplaceMaps().map((item) =>
      unlocked.has(item.id) && item.accessKind === 'paid'
        ? {
            ...item,
            accessKind: 'purchased' as const,
            priceLabel: `Purchased ($${item.priceUsd.toFixed(2)})`,
          }
        : item,
    );
  });

  readonly filteredMarketplaceMaps = computed<readonly LwMarketplaceMapItem[]>(() => {
    const q = this.marketSearchQuery().trim().toLowerCase();
    const tab = this.marketFilterTab();
    const dim = this.marketDimensionFilter();

    return this.resolvedMarketplaceMaps().filter((item) => {
      if (tab === 'free' && item.accessKind !== 'free') return false;
      if (tab === 'purchased' && item.accessKind !== 'purchased') return false;
      if (tab === 'paid' && item.accessKind !== 'paid') return false;
      if (dim !== 'all' && item.dimensionMode !== dim) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.creatorAccount.toLowerCase().includes(q) ||
        item.biomeTag.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  });

  openNewMapModal(defaultMode: LwMapDimensionMode = '3d'): void {
    this.selectedDimension.set(defaultMode);
    const sList = this.sessions();
    if (sList.length > 0 && !sList.some((s) => s.id === this.draftSessionId())) {
      this.draftSessionId.set(
        sList.find((s) => s.id === this.selectedSessionId())?.id ?? sList[0].id,
      );
    }
    const eList = this.encounters();
    if (eList.length > 0 && !eList.some((e) => e.id === this.draftEncounterId())) {
      this.draftEncounterId.set(
        eList.find((e) => e.id === this.selectedEncounterId())?.id ?? eList[0].id,
      );
    }
    this.showCreatePrompt.set(true);
  }

  openMarketplaceBrowser(): void {
    this.showMarketplaceModal.set(true);
  }

  private resolveValidSessionId(): string {
    const sList = this.sessions();
    const draft = this.draftSessionId();
    if (sList.some((s) => s.id === draft)) return draft;
    const pref = this.selectedSessionId();
    if (sList.some((s) => s.id === pref)) return pref;
    return sList[0]?.id ?? draft;
  }

  private resolveValidEncounterId(): string {
    const eList = this.encounters();
    const draft = this.draftEncounterId();
    if (eList.some((e) => e.id === draft)) return draft;
    const pref = this.selectedEncounterId();
    if (eList.some((e) => e.id === pref)) return pref;
    return eList[0]?.id ?? draft;
  }

  confirmCreateMap(): void {
    const cleanName = this.draftMapName().trim() || 'Untitled Campaign Map';
    this.createNewMap.emit({
      name: cleanName,
      dimensionMode: this.selectedDimension(),
      gridCols: this.draftGridCols(),
      gridRows: this.draftGridRows(),
      campaignId: this.activeCampaignId(),
      sessionId: this.resolveValidSessionId(),
      encounterId: this.resolveValidEncounterId(),
      starterFloorBumpId: this.draftStarterFloorId(),
    });
    this.showCreatePrompt.set(false);
  }

  onMarketAction(item: LwMarketplaceMapItem): void {
    const sessionId = this.resolveValidSessionId();
    const encounterId = this.resolveValidEncounterId();
    if (item.accessKind === 'paid') {
      const next = new Set(this.purchasedMarketIds());
      next.add(item.id);
      this.purchasedMarketIds.set(next);
      this.purchaseMarketplaceMap.emit(item);
      const purchasedItem: LwMarketplaceMapItem = {
        ...item,
        accessKind: 'purchased',
        priceLabel: `Purchased ($${item.priceUsd.toFixed(2)})`,
      };
      this.applyMarketplaceMap.emit({
        marketMap: purchasedItem,
        campaignId: this.activeCampaignId(),
        sessionId,
        encounterId,
      });
      this.showMarketplaceModal.set(false);
      return;
    }

    this.applyMarketplaceMap.emit({
      marketMap: item,
      campaignId: this.activeCampaignId(),
      sessionId,
      encounterId,
    });
    this.showMarketplaceModal.set(false);
  }

  onMarketSearchInput(event: Event): void {
    const el = event.target as HTMLInputElement | null;
    this.marketSearchQuery.set(el?.value ?? '');
  }

  onCampaignSelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const id = Number(select?.value ?? 1);
    if (!Number.isNaN(id)) {
      this.campaignChange.emit(id);
    }
  }

  getCardSelectedSessionId(sceneKey: string): string {
    const mapSel = this.cardSessionSelections()[sceneKey];
    if (mapSel && this.sessions().some((s) => s.id === mapSel)) {
      return mapSel;
    }
    return this.resolveValidSessionId();
  }

  onCardSessionChange(sceneKey: string, sessionId: string): void {
    this.cardSessionSelections.update((cur) => ({ ...cur, [sceneKey]: sessionId }));
  }

  onAssignCardToSession(map: LwExistingMapSummary, event: Event): void {
    event.stopPropagation();
    const sessionId = this.getCardSelectedSessionId(map.sceneKey);
    if (!sessionId) return;
    this.assignMapToSession.emit({ map, sessionId });
  }
}
