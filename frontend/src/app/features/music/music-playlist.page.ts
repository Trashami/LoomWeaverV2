import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LoomWeaverStoreService } from '../../core/services/loomweaver-store.service';
import {
  LwBadgeComponent,
  LwButtonComponent,
  LwIconComponent,
  LwPageHeaderComponent,
  LwPanelComponent,
} from '../../shared/ui/public-api';
import {
  LwGmMusicTriggerItem,
  LwGmPlaylistItem,
  LwMusicTrackItem,
  LwMusicTriggerScope,
  WebAudioAmbienceService,
} from '../assets/engine/web-audio-ambience.service';

@Component({
  selector: 'lw-music-playlist-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    LwPageHeaderComponent,
    LwPanelComponent,
    LwBadgeComponent,
    LwButtonComponent,
  ],
  templateUrl: './music-playlist.page.html',
  styleUrl: './music-playlist.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MusicPlaylistPageComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(LoomWeaverStoreService);
  readonly audio = inject(WebAudioAmbienceService);

  readonly playlistId = signal<string>('');
  readonly editName = signal<string>('');
  readonly editDesc = signal<string>('');
  readonly isEditing = signal<boolean>(false);
  readonly statusBanner = signal<string>('');

  // Trigger form state for this specific playlist
  readonly triggerScopeDraft = signal<LwMusicTriggerScope>('battlemap');
  readonly triggerTargetKeyDraft = signal<string>('*');
  readonly triggerTrackIdDraft = signal<string>('');
  readonly triggerCrossfadeDraft = signal<number>(2.0);

  readonly playlist = computed<LwGmPlaylistItem | null>(() => {
    const id = this.playlistId();
    return this.audio.playlists().find((p) => p.id === id) ?? null;
  });

  readonly isDefaultPlaylist = computed<boolean>(() => {
    const id = this.playlistId();
    return (
      id === 'playlist-campaign-overworld' ||
      id === 'playlist-session-start' ||
      id === 'playlist-battlemap-combat'
    );
  });

  readonly playlistTracks = computed<readonly LwMusicTrackItem[]>(() => {
    const pl = this.playlist();
    const all = this.audio.tracks();
    if (!pl) return [];
    return pl.trackIds
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is LwMusicTrackItem => !!t);
  });

  readonly availableLibraryTracks = computed<readonly LwMusicTrackItem[]>(() => {
    const pl = this.playlist();
    const all = this.audio.tracks();
    if (!pl) return all;
    return all.filter((t) => !pl.trackIds.includes(t.id));
  });

  readonly playlistTriggers = computed<readonly LwGmMusicTriggerItem[]>(() => {
    const id = this.playlistId();
    return this.audio.triggers().filter((t) => t.playlistId === id);
  });

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
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id') || '';
      this.playlistId.set(id);
      const pl = this.audio.playlists().find((p) => p.id === id);
      if (pl) {
        this.editName.set(pl.name);
        this.editDesc.set(pl.description);
        this.triggerTrackIdDraft.set(pl.trackIds[0] || this.audio.tracks()[0]?.id || '');
      }
    });
  }

  formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  getTrackTitle(trackId: string): string {
    return this.audio.tracks().find((t) => t.id === trackId)?.title || trackId;
  }

  onPlayPlaylist(): void {
    const id = this.playlistId();
    const pl = this.audio.selectPlaylist(id, true);
    if (pl) {
      this.statusBanner.set(`Playing playlist "${pl.name}"`);
      this.syncMusicStateToServer();
    }
  }

  onPlayTrack(trackId: string): void {
    const track = this.audio.playTrack(trackId, this.playlistId(), 1.2);
    if (track) {
      this.statusBanner.set(`Playing "${track.title}"`);
      this.syncMusicStateToServer();
    }
  }

  onStartEdit(): void {
    const pl = this.playlist();
    if (pl) {
      this.editName.set(pl.name);
      this.editDesc.set(pl.description);
      this.isEditing.set(true);
    }
  }

  onSavePlaylistDetails(): void {
    const name = this.editName().trim();
    if (!name) return;
    const desc = this.editDesc().trim();
    this.audio.updatePlaylist(this.playlistId(), {
      name,
      description: desc,
    });
    this.isEditing.set(false);
    this.statusBanner.set(`Updated playlist "${name}"`);
    this.syncMusicStateToServer();
  }

  onAddTrack(trackId: string): void {
    this.audio.addTrackToPlaylist(this.playlistId(), trackId);
    this.statusBanner.set('Added song to playlist');
    this.syncMusicStateToServer();
  }

  onRemoveTrack(trackId: string): void {
    this.audio.removeTrackFromPlaylist(this.playlistId(), trackId);
    this.statusBanner.set('Removed song from playlist');
    this.syncMusicStateToServer();
  }

  onDeletePlaylist(): void {
    if (this.isDefaultPlaylist()) return;
    const name = this.playlist()?.name || 'playlist';
    this.audio.deletePlaylist(this.playlistId());
    this.syncMusicStateToServer();
    this.router.navigate(['/music']);
  }

  onSaveTrigger(): void {
    const pl = this.playlist();
    if (!pl) return;
    const scope = this.triggerScopeDraft();
    const targetKey = this.triggerTargetKeyDraft() || '*';
    let targetLabel = 'All / Default';
    if (scope === 'campaign') {
      targetLabel = `${this.store.activeCampaign().name} (Campaign Start)`;
    } else if (scope === 'session') {
      targetLabel =
        targetKey === '*'
          ? 'When Any Session Starts / Goes Active'
          : (this.availableSessions().find((s) => s.id === targetKey)?.label ?? targetKey);
    } else {
      targetLabel =
        targetKey === '*'
          ? 'When Any Battlemap Goes Live on VTT'
          : (this.availableBattlemaps().find((b) => b.id === targetKey)?.label ?? targetKey);
    }

    const openingTrackId =
      this.triggerTrackIdDraft() || pl.trackIds[0] || this.audio.tracks()[0]?.id || '';

    const trig = this.audio.upsertTrigger({
      scope,
      targetKey,
      targetLabel,
      playlistId: pl.id,
      trackId: openingTrackId,
      autoPlay: true,
      crossfadeSeconds: this.triggerCrossfadeDraft(),
    });

    this.statusBanner.set(`Saved trigger for ${trig.targetLabel}`);
    this.syncMusicStateToServer();
  }

  onRemoveTrigger(triggerId: string): void {
    this.audio.removeTrigger(triggerId);
    this.statusBanner.set('Removed trigger rule');
    this.syncMusicStateToServer();
  }

  onTestTrigger(trig: LwGmMusicTriggerItem): void {
    this.audio.fireTrigger(trig.scope, trig.targetKey, trig.targetLabel, true);
    this.statusBanner.set(`Tested trigger -> ${trig.targetLabel}`);
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
