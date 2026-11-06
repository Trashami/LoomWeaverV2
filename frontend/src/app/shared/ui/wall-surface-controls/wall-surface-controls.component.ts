import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgpButton } from 'ng-primitives/button';
import { DEFAULT_WALL_BRUSH, WallBrushSettings } from '../../../features/maps/engine/walls/wall-surface.models';

@Component({
  selector: 'lw-wall-surface-controls',
  standalone: true,
  imports: [NgpButton],
  templateUrl: './wall-surface-controls.component.html',
  styleUrl: './wall-surface-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwWallSurfaceControlsComponent {
  readonly brush = input<WallBrushSettings>(DEFAULT_WALL_BRUSH);
  readonly smoothing = input<number>(75);
  readonly brushChange = output<WallBrushSettings>();
  readonly smoothingChange = output<number>();
  readonly clearPaint = output<void>();
  readonly grimePresets = [
    { label: 'Damp Moss', hex: '#4e8c57' },
    { label: 'Dungeon Soot', hex: '#282426' },
    { label: 'Mildew Grime', hex: '#2c5952' },
    { label: 'Wet Mud', hex: '#5c432c' },
    { label: 'Rust Stain', hex: '#7c3a23' },
    { label: 'Blood', hex: '#7a1c1c' },
  ];
  patch(change: Partial<WallBrushSettings>): void {
    this.brushChange.emit({ ...this.brush(), ...change });
  }
  value(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }
  color(event: Event): void {
    this.patch({ colorHex: (event.target as HTMLInputElement).value });
  }
}
