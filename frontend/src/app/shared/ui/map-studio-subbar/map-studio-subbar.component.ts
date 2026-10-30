import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../icon/icon.component';
import { LwMapDimensionMode } from '../map-studio-landing/map-studio-landing.component';

export type MapEditorModeTab = 'build' | 'playtest' | 'encounter';
export type MapSceneScopeMode = 'battlemap' | 'world_overlay';

@Component({
  selector: 'lw-map-studio-subbar',
  standalone: true,
  imports: [FormsModule, NgpButton, LwIconComponent],
  templateUrl: './map-studio-subbar.component.html',
  styleUrl: './map-studio-subbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapStudioSubbarComponent {
  readonly mapTitle = input<string>('Untitled Map');
  readonly dimensionMode = input<LwMapDimensionMode>('3d');
  readonly gridCols = input<number>(50);
  readonly gridRows = input<number>(50);
  readonly gridCellFeet = input<number>(5);
  readonly revision = input<number>(15);
  readonly sceneScope = input<MapSceneScopeMode>('battlemap');
  readonly activeMode = input<MapEditorModeTab>('build');
  readonly canUndo = input<boolean>(false);
  readonly canRedo = input<boolean>(false);
  readonly saving = input<boolean>(false);
  readonly viewerRole = input<'gm' | 'players'>('gm');
  readonly leftCollapsed = input<boolean>(false);
  readonly rightCollapsed = input<boolean>(false);

  readonly campaigns = input<readonly { id: number; name: string }[]>([]);
  readonly activeCampaignId = input<number>(1);
  readonly sessions = input<readonly { id: string; label: string }[]>([]);
  readonly selectedSessionId = input<string>('session-15');
  readonly encounters = input<readonly { id: string; label: string }[]>([]);
  readonly selectedEncounterId = input<string>('enc-cinth-masquerade');

  readonly titleChanged = output<string>();
  readonly dimensionModeChanged = output<LwMapDimensionMode>();
  readonly scopeChanged = output<MapSceneScopeMode>();
  readonly modeChanged = output<MapEditorModeTab>();
  readonly campaignChanged = output<number>();
  readonly sessionChanged = output<string>();
  readonly encounterChanged = output<string>();
  readonly toggleLeftDock = output<void>();
  readonly toggleRightDock = output<void>();
  readonly undoRequested = output<void>();
  readonly redoRequested = output<void>();
  readonly saveRequested = output<void>();
  readonly publishRequested = output<void>();
  readonly exportRequested = output<'gm' | 'player-safe'>();
  readonly backRequested = output<void>();

  readonly editingTitle = signal<boolean>(false);
  readonly moreMenuOpen = signal<boolean>(false);

  toggleTitleEdit(): void {
    this.editingTitle.update((v) => !v);
  }

  onCampaignSelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const id = Number(select?.value ?? 1);
    if (!Number.isNaN(id)) {
      this.campaignChanged.emit(id);
    }
  }

  onSessionSelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (select?.value) {
      this.sessionChanged.emit(select.value);
    }
  }

  onEncounterSelect(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (select?.value) {
      this.encounterChanged.emit(select.value);
    }
  }

  onExportClick(variant: 'gm' | 'player-safe'): void {
    this.moreMenuOpen.set(false);
    this.exportRequested.emit(variant);
  }
}
