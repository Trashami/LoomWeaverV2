import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MapLevelFloor, MapScopeMode } from '../../../features/maps/application/map-studio.models';
import { MapRenderMode } from '../../../features/maps/engine/map-scene-contract';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwIconComponent } from '../icon/icon.component';

@Component({
  selector: 'lw-map-studio-ribbon',
  standalone: true,
  imports: [FormsModule, LwIconComponent, LwBadgeComponent, LwButtonComponent],
  templateUrl: './map-studio-ribbon.component.html',
  styleUrl: './map-studio-ribbon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapStudioRibbonComponent {
  readonly mapTitle = input<string>('Untitled Map');
  readonly mapScope = input<MapScopeMode>('battlemap');
  readonly renderMode = input<MapRenderMode>('Linked 2D <-> 3D');
  readonly levels = input<readonly MapLevelFloor[]>([]);
  readonly activeLevelIndex = input<number>(1);
  readonly ghostLowerFloors = input<boolean>(true);
  readonly testTokenSandbox = input<boolean>(false);
  readonly canUndo = input<boolean>(false);
  readonly canRedo = input<boolean>(false);
  readonly undoCount = input<number>(0);
  readonly redoCount = input<number>(0);
  readonly lastHistoryLabel = input<string>('Initial Scene Ready');
  readonly saving = input<boolean>(false);

  readonly titleChanged = output<string>();
  readonly scopeChanged = output<MapScopeMode>();
  readonly renderModeChanged = output<MapRenderMode>();
  readonly levelSelected = output<number>();
  readonly addLevelRequested = output<void>();
  readonly ghostModeToggled = output<void>();
  readonly testTokenToggled = output<void>();
  readonly undoRequested = output<void>();
  readonly redoRequested = output<void>();
  readonly openCatalogRequested = output<void>();
  readonly saveRevisionRequested = output<void>();
}
