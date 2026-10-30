import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwAssetCardComponent,
  LwAudioScenePresetItem,
  LwAudioStemMixerComponent,
  LwBadgeComponent,
  LwButtonComponent,
  LwPanelComponent,
  LwStemGainChangeEvent,
  LwPageHeaderComponent,
} from '../../shared/ui/public-api';
import { WebAudioAmbienceService } from './engine/web-audio-ambience.service';

interface ServerAudioStateResponse {
  readonly campaignId: number;
  readonly activePresetId: string;
  readonly masterVolume: number;
  readonly stems: readonly {
    id: string;
    name: string;
    role: string;
    waveform: string;
    baseFrequencyHz: number;
    defaultGain: number;
  }[];
  readonly presets: readonly LwAudioScenePresetItem[];
}

@Component({
  selector: 'lw-assets-page',
  standalone: true,
  imports: [
    LwPageHeaderComponent,
    RouterLink,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwAssetCardComponent,
    LwAudioStemMixerComponent,
  ],
  templateUrl: './assets.page.html',
  styleUrl: './assets.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsPageComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  readonly store = inject(LoomWeaverStoreService);
  readonly audio = inject(WebAudioAmbienceService);

  readonly selectedCategory = signal<string>('All');
  readonly categories = ['All', 'Map Pack', 'Dice Skin', 'Spell FX', 'Audio Pack', 'Module'];
  readonly lastSyncBanner = signal<string>('Synchronized with campaign audio bus');

  readonly filteredAssets = computed(() => {
    const cat = this.selectedCategory();
    return this.store.assets().filter((a) => cat === 'All' || a.category === cat);
  });

  readonly activePreset = computed(
    () =>
      this.audio.presets().find((p) => p.id === this.audio.activePresetId()) ??
      this.audio.presets()[0],
  );

  constructor() {
    this.http.get<ServerAudioStateResponse>(`/api/v2/campaigns/${this.store.activeCampaignId()}/audio-state`).subscribe({
      next: (res) => {
        if (res) {
          this.audio.hydrateFromServer(
            res.activePresetId,
            res.masterVolume,
            res.stems,
            res.presets,
          );
        }
      },
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    // Keep audio playing across navigation unless explicitly stopped, or clean up if desired.
  }

  handlePresetTransition(presetId: string): void {
    const preset = this.audio.crossfadeToPreset(presetId);
    if (!preset) return;

    this.http
      .post(`/api/v2/campaigns/${this.store.activeCampaignId()}/audio-state/transition`, {
        presetId: preset.id,
        crossfadeSeconds: preset.crossfadeSeconds,
        role: this.store.viewerRole(),
      })
      .subscribe({
        next: () => {
          this.lastSyncBanner.set(
            `Crossfaded to "${preset.name}" (${preset.crossfadeSeconds}s ramp · .NET event synced)`,
          );
        },
        error: () => {
          this.lastSyncBanner.set(`Crossfaded locally to "${preset.name}" (${preset.crossfadeSeconds}s ramp)`);
        },
      });
  }

  handleStemGainChange(event: LwStemGainChangeEvent): void {
    this.audio.setStemGain(event.stemId, event.gain);
  }
}
