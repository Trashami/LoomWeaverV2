import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { LwIconComponent } from '../icon/icon.component';

export interface MapDockToolItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly layerHint: string;
}

export const DEFAULT_MAP_DOCK_TOOLS: readonly MapDockToolItem[] = [
  { id: 'select', label: 'Select', icon: 'cursor', layerHint: 'Select & Inspect Properties' },
  { id: 'floor-bump', label: 'Flooring', icon: 'pipette', layerHint: '2D Bump/Height Floor Texture' },
  { id: 'terrain', label: 'Raise/Lower', icon: 'map', layerHint: 'Raise or Lower Terrain Heightfield' },
  { id: 'wall', label: 'Wall Line', icon: 'shield', layerHint: 'Draw Grid-Snapped 3D Stone Wall Line' },
  { id: 'room', label: 'Room', icon: 'grid', layerHint: 'Draw Grid-Snapped Square & Shaped Rooms' },
  { id: 'door', label: 'Door', icon: 'key-round', layerHint: 'Portals, Archways & Wall-Cutout Doors' },
  { id: 'objects', label: 'Objects', icon: 'cube', layerHint: 'Place 1x1x1 3D Assets or 2D Floor Stamps' },
  { id: 'tokens', label: 'Tokens', icon: 'users', layerHint: 'Place & Drag Scale/Movement Reference Tokens' },
  { id: 'lighting', label: 'Lights', icon: 'zap', layerHint: 'Torches, Lanterns, Spotlights & Glow' },
  { id: 'sun-moon', label: 'Sun/Moon', icon: 'compass', layerHint: 'Adjust Sun & Moon Shadow Position' },
  { id: 'water', label: 'Water', icon: 'globe', layerHint: 'Spline Rivers, Pools & Ocean' },
  { id: 'scatter', label: 'Scatter', icon: 'layers', layerHint: 'Seeded Foliage & Rock Brush' },
  { id: 'annotate', label: 'Annotate', icon: 'pen', layerHint: 'World Overlays & GM Secrets' },
];

@Component({
  selector: 'lw-map-tool-dock',
  standalone: true,
  imports: [NgpButton, LwIconComponent],
  templateUrl: './map-tool-dock.component.html',
  styleUrl: './map-tool-dock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwMapToolDockComponent {
  readonly tools = input<readonly MapDockToolItem[]>(DEFAULT_MAP_DOCK_TOOLS);
  readonly activeToolId = input<string>('select');

  readonly toolSelected = output<string>();
  readonly collapseRequested = output<void>();
}
