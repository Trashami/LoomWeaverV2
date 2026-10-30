import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LocationRelatedEntityVm,
  RecentWorldDiscoveryVm,
  WorldHierarchyScope,
  WorldMapMarkerVm,
} from '../../core/models/world-lore.models';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import { WorldLoreFacadeService } from '../../core/services/world-lore-facade.service';
import {
  LwAtlasLayerFiltersComponent,
  LwIconComponent,
  LwLoreLibraryComponent,
  LwPageHeaderComponent,
  LwWeaveRelationshipsGraphComponent,
  LwWorldAtlasComponent,
  LwWorldHistoryComponent,
  LwWorldMapEditorComponent,
} from '../../shared/ui/public-api';

@Component({
  selector: 'app-weave-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LwIconComponent,
    LwPageHeaderComponent,
    LwAtlasLayerFiltersComponent,
    LwWorldAtlasComponent,
    LwLoreLibraryComponent,
    LwWorldHistoryComponent,
    LwWeaveRelationshipsGraphComponent,
    LwWorldMapEditorComponent,
  ],
  templateUrl: './weave.page.html',
  styleUrl: './weave.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeavePageComponent {
  readonly store = inject(LoomWeaverStoreService);
  readonly worldLore = inject(WorldLoreFacadeService);

  readonly generativeAiEnabled = input<boolean>(false);
  readonly isWeaveEnabled = computed(
    () => this.generativeAiEnabled() || this.store.weaveEnabled(),
  );

  readonly createLocationModalOpen = signal<boolean>(false);
  readonly newLocName = signal<string>('');
  readonly newLocType = signal<string>('Settlement');
  readonly newLocHierarchy = signal<WorldHierarchyScope>('Settlement');
  readonly newLocStatus = signal<'visited' | 'known' | 'rumor' | 'undiscovered'>('known');
  readonly newLocVisibility = signal<'players' | 'gm'>('players');
  readonly newLocX = signal<number>(54);
  readonly newLocY = signal<number>(46);
  readonly newLocDescription = signal<string>('');

  onMarkerSelected(marker: WorldMapMarkerVm): void {
    this.worldLore.selectLocation(marker.locationKey);
  }

  onMarkerPositionCommitted(ev: { locationKey: string; xPercent: number; yPercent: number }): void {
    const loc = this.worldLore.locationsState().find((l) => l.locationKey === ev.locationKey);
    if (!loc) return;
    this.worldLore.saveLocation({
      locationKey: loc.locationKey,
      name: loc.name,
      locationType: loc.locationType,
      hierarchyLevel: loc.hierarchyLevel,
      parentLocationKey: loc.parentLocationKey,
      mapId: loc.mapId,
      childMapId: loc.childMapId,
      linkedSceneKey: loc.linkedSceneKey,
      attachedSessionId: loc.attachedSessionId,
      attachedSessionLabel: loc.attachedSessionLabel,
      playerVisibilityPolicy: loc.playerVisibilityPolicy,
      style: loc.style,
      xPercent: ev.xPercent,
      yPercent: ev.yPercent,
      discoveryStatus: loc.discoveryStatus,
      visibility: loc.visibility,
      artworkUrl: loc.artworkUrl,
      description: loc.description,
    });
  }

  onEditorRelatedSelected(rel: LocationRelatedEntityVm): void {
    this.worldLore.closeMapEditor();
    if (rel.entityType === 'Location') {
      const key = rel.compositeKey.split(':').pop() ?? rel.compositeKey;
      this.worldLore.selectLocation(key);
    } else {
      this.store.inspectEntity(rel.compositeKey);
    }
  }

  onEditorLoreSelected(loreId: string): void {
    this.worldLore.closeMapEditor();
    this.worldLore.selectLoreEntry(loreId);
    this.worldLore.setPrimaryTab('lore');
  }

  onInspectLocationFromChild(locationKey: string): void {
    this.worldLore.selectLocation(locationKey);
    this.worldLore.setPrimaryTab('atlas');
  }

  onDiscoverySelected(disc: RecentWorldDiscoveryVm): void {
    if (disc.targetType === 'location') {
      this.worldLore.selectLocation(disc.targetKey);
    } else if (disc.targetType === 'lore') {
      this.worldLore.selectLoreEntry(disc.targetKey);
      this.worldLore.setPrimaryTab('lore');
    } else {
      this.store.inspectEntity(disc.targetKey);
    }
  }

  openAddLocationModal(coords?: { xPercent: number; yPercent: number }): void {
    this.newLocName.set('');
    this.newLocType.set('Settlement');
    this.newLocHierarchy.set('Settlement');
    this.newLocStatus.set('known');
    this.newLocVisibility.set('players');
    this.newLocX.set(coords?.xPercent ?? 52);
    this.newLocY.set(coords?.yPercent ?? 48);
    this.newLocDescription.set('');
    this.createLocationModalOpen.set(true);
  }

  submitCreateLocation(): void {
    const name = this.newLocName().trim();
    if (!name) return;
    this.worldLore.saveLocation({
      name,
      locationType: this.newLocType().trim() || 'Settlement',
      hierarchyLevel: this.newLocHierarchy(),
      discoveryStatus: this.newLocStatus(),
      visibility: this.newLocVisibility(),
      xPercent: this.newLocX(),
      yPercent: this.newLocY(),
      description:
        this.newLocDescription().trim() ||
        `Charted ${this.newLocType()} in ${this.worldLore.workspace().worldName}.`,
    });
    this.createLocationModalOpen.set(false);
  }
}
