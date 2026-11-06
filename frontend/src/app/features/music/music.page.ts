import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwBadgeComponent,
  LwButtonComponent,
  LwIconComponent,
  LwModalComponent,
  LwPageHeaderComponent,
  LwPanelComponent,
} from '../../shared/ui/public-api';
import {
  LwGmPlaylistItem,
  LwMusicTrackItem,
  WebAudioAmbienceService,
} from '../assets/engine/web-audio-ambience.service';

interface ServerAudioStateResponse {
  readonly campaignId: number;
  readonly activePresetId: string;
  readonly masterVolume: number;
  readonly activeTrackId?: string;
  readonly activePlaylistId?: string;
  readonly tracks?: readonly LwMusicTrackItem[];
  readonly playlists?: readonly LwGmPlaylistItem[];
}

@Component({
  selector: 'lw-music-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    LwPageHeaderComponent,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
    LwIconComponent,
    LwModalComponent,
  ],
  templateUrl: './music.page.html',
  styleUrl: './music.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MusicPageComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly store = inject(LoomWeaverStoreService);
  readonly audio = inject(WebAudioAmbienceService);

  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<string>('All');
  readonly showCreateModal = signal<boolean>(false);
  readonly newPlaylistName = signal<string>('');
  readonly newPlaylistDesc = signal<string>('');
  readonly lastSyncBanner = signal<string>('Soundtrack bus active');

  readonly categories = computed<readonly string[]>(() => {
    const list = this.audio.tracks();
    const set = new Set<string>();
    for (const t of list) {
      if (t.category) set.add(t.category);
    }
    return ['All', ...Array.from(set)];
  });

  readonly filteredTracks = computed<readonly LwMusicTrackItem[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();
    return this.audio.tracks().filter((t) => {
      const matchesCat = cat === 'All' || t.category === cat;
      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.mood.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  });

  readonly playlistsWithMeta = computed(() => {
    const allTriggers = this.audio.triggers();
    const allTracks = this.audio.tracks();
    return this.audio.playlists().map((pl) => {
      const triggerCount = allTriggers.filter((tr) => tr.playlistId === pl.id).length;
      const trackObjects = pl.trackIds
        .map((id) => allTracks.find((t) => t.id === id))
        .filter((t): t is LwMusicTrackItem => !!t);
      const totalSec = trackObjects.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
      return {
        ...pl,
        triggerCount,
        previewTracks: trackObjects.slice(0, 3),
        totalDurationFormatted: this.formatTime(totalSec),
      };
    });
  });

  constructor() {
    this.hydrateAudioFromServer();
  }

  formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  isSongInPlaylist(playlistId: string, trackId: string): boolean {
    const pl = this.audio.playlists().find((p) => p.id === playlistId);
    return pl ? pl.trackIds.includes(trackId) : false;
  }

  handleToggleSongInPlaylist(playlistId: string, trackId: string): void {
    this.audio.toggleTrackInPlaylist(playlistId, trackId);
    this.syncMusicStateToServer();
  }

  onPlayTrack(trackId: string): void {
    const track = this.audio.playTrack(trackId, this.audio.activePlaylistId(), 1.2);
    if (track) {
      this.lastSyncBanner.set(`Playing "${track.title}"`);
      this.syncMusicStateToServer();
    }
  }

  onPlayPlaylist(playlistId: string): void {
    const pl = this.audio.selectPlaylist(playlistId, true);
    if (pl) {
      this.lastSyncBanner.set(`Playing playlist "${pl.name}"`);
      this.syncMusicStateToServer();
    }
  }

  onNavigateToPlaylist(playlistId: string): void {
    this.router.navigate(['/music/playlists', playlistId]);
  }

  onCreatePlaylist(): void {
    const name = this.newPlaylistName().trim();
    if (!name) return;
    const desc = this.newPlaylistDesc().trim() || 'Custom GM Soundtrack Playlist';
    const created = this.audio.createPlaylist({
      name,
      description: desc,
      trackIds: [this.audio.activeTrackId()],
    });
    this.newPlaylistName.set('');
    this.newPlaylistDesc.set('');
    this.showCreateModal.set(false);
    this.syncMusicStateToServer();
    this.router.navigate(['/music/playlists', created.id]);
  }

  onMasterSliderInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.audio.setMasterVolume(Number(target.value));
  }

  onSeekSliderInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.audio.seekTo(Number(target.value));
  }

  onFileUploadChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    if (inputEl.files && inputEl.files.length > 0) {
      this.audio.addCustomAudioFiles(inputEl.files);
      inputEl.value = '';
      this.syncMusicStateToServer();
    }
  }

  private hydrateAudioFromServer(): void {
    const cid = this.store.activeCampaignId() || 1;
    this.http.get<ServerAudioStateResponse>(`/api/v2/campaigns/${cid}/audio-state`).subscribe({
      next: (res) => {
        if (res) {
          this.audio.hydrateFromServer(
            res.activePresetId,
            res.masterVolume,
            [],
            [],
            res.tracks,
            res.playlists,
            undefined,
            res.activeTrackId,
            res.activePlaylistId,
          );
        }
      },
      error: () => {},
    });
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
