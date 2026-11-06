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
  LwCreatePlaylistEvent,
  LwGmMusicTriggerItem,
  LwGmPlaylistItem,
  LwMusicTrackItem,
  LwPageHeaderComponent,
  LwPanelComponent,
  LwStemGainChangeEvent,
  LwTogglePlaylistTrackEvent,
  LwUpsertMusicTriggerEvent,
} from '../../shared/ui/public-api';
import { WebAudioAmbienceService } from './engine/web-audio-ambience.service';

interface ServerAudioStateResponse {
  readonly campaignId: number;
  readonly activePresetId: string;
  readonly masterVolume: number;
  readonly activeTrackId?: string;
  readonly activePlaylistId?: string;
  readonly tracks?: readonly LwMusicTrackItem[];
  readonly playlists?: readonly LwGmPlaylistItem[];
  readonly triggers?: readonly LwGmMusicTriggerItem[];
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
  readonly lastSyncBanner = signal<string>('Synchronized with campaign soundtrack bus');

  readonly filteredAssets = computed(() => {
    const cat = this.selectedCategory();
    return this.store.assets().filter((a) => cat === 'All' || a.category === cat);
  });

  readonly activePreset = computed(
    () =>
      this.audio.presets().find((p) => p.id === this.audio.activePresetId()) ??
      this.audio.presets()[0],
  );

  readonly availableSessions = computed(() =>
    this.store.sessions().map((s) => ({
      id: s.sessionId,
      label: s.label || s.title,
    })),
  );

  readonly availableBattlemaps = computed(() =>
    this.store.authorizedScenes().map((sc) => ({
      id: sc.sceneKey,
      label: `${sc.name} (${sc.biome})`,
    })),
  );

  constructor() {
    this.http
      .get<ServerAudioStateResponse>(`/api/v2/campaigns/${this.store.activeCampaignId() || 1}/audio-state`)
      .subscribe({
        next: (res) => {
          if (res) {
            this.audio.hydrateFromServer(
              res.activePresetId,
              res.masterVolume,
              res.stems,
              res.presets,
              res.tracks,
              res.playlists,
              res.triggers,
              res.activeTrackId,
              res.activePlaylistId,
            );
          }
        },
        error: () => {},
      });
  }

  ngOnDestroy(): void {
    // Keep audio playing across navigation unless explicitly stopped.
  }

  handleTrackSelected(trackId: string): void {
    const track = this.audio.playTrack(trackId, this.audio.activePlaylistId(), 1.2);
    if (!track) return;
    this.lastSyncBanner.set(`Playing "${track.title}" — ${track.artist}`);
    this.syncMusicStateToServer();
  }

  handlePlaylistSelected(playlistId: string): void {
    const pl = this.audio.selectPlaylist(playlistId, true);
    if (!pl) return;
    this.lastSyncBanner.set(`Activated playlist "${pl.name}" (${pl.trackIds.length} songs)`);
    this.syncMusicStateToServer();
  }

  handleCreatePlaylist(event: LwCreatePlaylistEvent): void {
    const pl = this.audio.createPlaylist(event);
    this.lastSyncBanner.set(`Created playlist "${pl.name}"`);
    this.syncMusicStateToServer();
  }

  handleDeletePlaylist(playlistId: string): void {
    this.audio.deletePlaylist(playlistId);
    this.lastSyncBanner.set('Removed custom playlist');
    this.syncMusicStateToServer();
  }

  handleTogglePlaylistTrack(event: LwTogglePlaylistTrackEvent): void {
    this.audio.toggleTrackInPlaylist(event.playlistId, event.trackId);
    this.syncMusicStateToServer();
  }

  handleUpsertTrigger(event: LwUpsertMusicTriggerEvent): void {
    const trig = this.audio.upsertTrigger(event);
    this.lastSyncBanner.set(
      `Saved ${trig.scope.toUpperCase()} trigger for ${trig.targetLabel}`,
    );
    this.syncMusicStateToServer();
  }

  handleRemoveTrigger(triggerId: string): void {
    this.audio.removeTrigger(triggerId);
    this.lastSyncBanner.set('Removed trigger rule');
    this.syncMusicStateToServer();
  }

  handleTestTrigger(trig: LwGmMusicTriggerItem): void {
    this.audio.fireTrigger(trig.scope, trig.targetKey, trig.targetLabel, true);
    this.lastSyncBanner.set(`Tested ${trig.scope.toUpperCase()} trigger -> ${trig.targetLabel}`);
  }

  handlePresetTransition(presetId: string): void {
    const preset = this.audio.crossfadeToPreset(presetId);
    if (!preset) return;

    this.http
      .post(`/api/v2/campaigns/${this.store.activeCampaignId() || 1}/audio-state/transition`, {
        presetId: preset.id,
        trackId: this.audio.activeTrackId(),
        playlistId: this.audio.activePlaylistId(),
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

  private syncMusicStateToServer(): void {
    const cid = this.store.activeCampaignId() || 1;
    this.http
      .post(`/api/v2/campaigns/${cid}/audio-state/playlists`, {
        activeTrackId: this.audio.activeTrackId(),
        activePlaylistId: this.audio.activePlaylistId(),
        masterVolume: this.audio.masterVolume(),
        playlists: this.audio.playlists(),
        triggers: this.audio.triggers(),
      })
      .subscribe({ error: () => {} });
  }
}
