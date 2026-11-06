import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LwBadgeComponent } from '../badge/badge.component';
import { LwButtonComponent } from '../button/button.component';
import { LwIconComponent } from '../icon/icon.component';

export interface LwAudioStemItem {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly waveform: string;
  readonly baseFrequencyHz: number;
  readonly gain: number;
}

export interface LwAudioScenePresetItem {
  readonly id: string;
  readonly name: string;
  readonly mood: string;
  readonly bpm: number;
  readonly keySignature: string;
  readonly description: string;
  readonly crossfadeSeconds: number;
  readonly stemGains: Readonly<Record<string, number>>;
}

export interface LwStemGainChangeEvent {
  readonly stemId: string;
  readonly gain: number;
}

export type LwMusicTriggerScope = 'campaign' | 'session' | 'battlemap';

export interface LwMusicTrackItem {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly category: string;
  readonly url: string;
  readonly durationSeconds: number;
  readonly mood: string;
}

export interface LwGmPlaylistItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trackIds: readonly string[];
  readonly loop: boolean;
}

export interface LwGmMusicTriggerItem {
  readonly id: string;
  readonly scope: LwMusicTriggerScope;
  readonly targetKey: string;
  readonly targetLabel: string;
  readonly playlistId: string;
  readonly trackId: string;
  readonly autoPlay: boolean;
  readonly crossfadeSeconds: number;
}

export interface LwCreatePlaylistEvent {
  readonly name: string;
  readonly description: string;
  readonly trackIds: readonly string[];
}

export interface LwTogglePlaylistTrackEvent {
  readonly playlistId: string;
  readonly trackId: string;
}

export interface LwUpsertMusicTriggerEvent {
  readonly scope: LwMusicTriggerScope;
  readonly targetKey: string;
  readonly targetLabel: string;
  readonly playlistId: string;
  readonly trackId: string;
  readonly autoPlay: boolean;
  readonly crossfadeSeconds: number;
}

@Component({
  selector: 'lw-audio-stem-mixer',
  standalone: true,
  imports: [FormsModule, LwBadgeComponent, LwButtonComponent, LwIconComponent],
  templateUrl: './audio-stem-mixer.component.html',
  styleUrl: './audio-stem-mixer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LwAudioStemMixerComponent {
  readonly isPlaying = input<boolean>(false);
  readonly activePresetId = input<string>('preset-cinth-ballroom');
  readonly masterVolume = input<number>(0.8);
  readonly stems = input<readonly LwAudioStemItem[]>([]);
  readonly presets = input<readonly LwAudioScenePresetItem[]>([]);

  // Real MP3 Music Player + GM Playlists & Triggers inputs
  readonly tracks = input<readonly LwMusicTrackItem[]>([]);
  readonly playlists = input<readonly LwGmPlaylistItem[]>([]);
  readonly triggers = input<readonly LwGmMusicTriggerItem[]>([]);
  readonly activeTrackId = input<string>('track-the-longest-journey');
  readonly activePlaylistId = input<string>('playlist-campaign-overworld');
  readonly currentTimeSeconds = input<number>(0);
  readonly durationSeconds = input<number>(0);
  readonly loopMode = input<'playlist' | 'track'>('playlist');
  readonly lastTriggerBanner = input<string>('');
  readonly availableSessions = input<readonly { id: string; label: string }[]>([]);
  readonly availableBattlemaps = input<readonly { id: string; label: string }[]>([]);
  readonly activeCampaignName = input<string>('Shadow of the Mountain');

  readonly togglePlaybackRequested = output<void>();
  readonly presetTransitionRequested = output<string>();
  readonly stemGainChanged = output<LwStemGainChangeEvent>();
  readonly masterVolumeChanged = output<number>();

  // Real MP3 Player & Playlist/Trigger outputs
  readonly trackSelected = output<string>();
  readonly playlistSelected = output<string>();
  readonly nextTrackRequested = output<void>();
  readonly previousTrackRequested = output<void>();
  readonly seekRequested = output<number>();
  readonly loopModeToggled = output<void>();
  readonly createPlaylistRequested = output<LwCreatePlaylistEvent>();
  readonly deletePlaylistRequested = output<string>();
  readonly togglePlaylistTrackRequested = output<LwTogglePlaylistTrackEvent>();
  readonly upsertTriggerRequested = output<LwUpsertMusicTriggerEvent>();
  readonly removeTriggerRequested = output<string>();
  readonly testTriggerRequested = output<LwGmMusicTriggerItem>();
  readonly customAudioFilesAdded = output<FileList>();

  // Local UI state for creating playlists and assigning triggers
  readonly newPlaylistName = signal<string>('');
  readonly newPlaylistDesc = signal<string>('');
  readonly triggerScopeDraft = signal<LwMusicTriggerScope>('session');
  readonly triggerTargetKeyDraft = signal<string>('*');
  readonly triggerPlaylistIdDraft = signal<string>('playlist-session-start');
  readonly triggerTrackIdDraft = signal<string>('track-dnd-acoustic-loop');
  readonly triggerCrossfadeDraft = signal<number>(2.0);

  readonly activeTrack = computed<LwMusicTrackItem | null>(() => {
    const list = this.tracks();
    return list.find((t) => t.id === this.activeTrackId()) ?? list[0] ?? null;
  });

  readonly activePlaylist = computed<LwGmPlaylistItem | null>(() => {
    const list = this.playlists();
    return list.find((p) => p.id === this.activePlaylistId()) ?? list[0] ?? null;
  });

  readonly activePlaylistTracks = computed<readonly LwMusicTrackItem[]>(() => {
    const pl = this.activePlaylist();
    const all = this.tracks();
    if (!pl) return all;
    return pl.trackIds
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is LwMusicTrackItem => !!t);
  });

  formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  isTrackInActivePlaylist(trackId: string): boolean {
    const pl = this.activePlaylist();
    return pl ? pl.trackIds.includes(trackId) : false;
  }

  triggersForTrack(trackId: string): readonly LwGmMusicTriggerItem[] {
    return this.triggers().filter((t) => t.trackId === trackId);
  }

  getTrackTitle(trackId: string): string {
    return this.tracks().find((t) => t.id === trackId)?.title || trackId;
  }

  getPlaylistName(playlistId: string): string {
    return this.playlists().find((p) => p.id === playlistId)?.name || playlistId;
  }

  onMasterSliderInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.masterVolumeChanged.emit(Number(target.value));
  }

  onSeekSliderInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.seekRequested.emit(Number(target.value));
  }

  onStemSliderInput(stemId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const gain = Number(target.value);
    this.stemGainChanged.emit({ stemId, gain });
  }

  onCreatePlaylist(): void {
    const name = this.newPlaylistName().trim();
    if (!name) return;
    const desc = this.newPlaylistDesc().trim() || 'Custom GM Soundtrack Playlist';
    const initialTrackId = this.activeTrack()?.id;
    this.createPlaylistRequested.emit({
      name,
      description: desc,
      trackIds: initialTrackId ? [initialTrackId] : [],
    });
    this.newPlaylistName.set('');
    this.newPlaylistDesc.set('');
  }

  onQuickAssignTrigger(scope: LwMusicTriggerScope, track: LwMusicTrackItem): void {
    const playlistId =
      scope === 'campaign'
        ? 'playlist-campaign-overworld'
        : scope === 'session'
          ? 'playlist-session-start'
          : 'playlist-battlemap-combat';
    const targetLabel =
      scope === 'campaign'
        ? `${this.activeCampaignName()} (Campaign Start)`
        : scope === 'session'
          ? 'When Session Starts / Goes Active'
          : 'When Battlemap Goes Live on VTT';

    this.upsertTriggerRequested.emit({
      scope,
      targetKey: '*',
      targetLabel,
      playlistId: this.activePlaylist()?.id || playlistId,
      trackId: track.id,
      autoPlay: true,
      crossfadeSeconds: scope === 'battlemap' ? 1.5 : 2.0,
    });
  }

  onSaveCustomTrigger(): void {
    const scope = this.triggerScopeDraft();
    const targetKey = this.triggerTargetKeyDraft() || '*';
    let targetLabel = 'All / Default';
    if (scope === 'campaign') {
      targetLabel = `${this.activeCampaignName()} (Campaign Soundtrack)`;
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

    this.upsertTriggerRequested.emit({
      scope,
      targetKey,
      targetLabel,
      playlistId: this.triggerPlaylistIdDraft(),
      trackId: this.triggerTrackIdDraft(),
      autoPlay: true,
      crossfadeSeconds: this.triggerCrossfadeDraft(),
    });
  }

  onFileUploadChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    if (inputEl.files && inputEl.files.length > 0) {
      this.customAudioFilesAdded.emit(inputEl.files);
      inputEl.value = '';
    }
  }
}
