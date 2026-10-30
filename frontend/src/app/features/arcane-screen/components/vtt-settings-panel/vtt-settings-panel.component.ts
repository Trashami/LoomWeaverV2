import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { VTT_MAP_QUALITY_OPTIONS, VttDisplaySettingsService, VttMapQuality } from '../../services/vtt-display-settings.service';

/** Right-panel Settings tab: map asset quality now, with placeholders for future display options. */
@Component({
  selector: 'lw-vtt-settings-panel',
  standalone: true,
  templateUrl: './vtt-settings-panel.component.html',
  styleUrl: './vtt-settings-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttSettingsPanelComponent {
  readonly display = inject(VttDisplaySettingsService);
  readonly qualityOptions = VTT_MAP_QUALITY_OPTIONS;

  select(value: VttMapQuality): void {
    this.display.setMapQuality(value);
  }
}
