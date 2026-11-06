import { Injectable, computed, signal } from '@angular/core';
import {
  LwAudioScenePresetItem,
  LwAudioStemItem,
  LwCreatePlaylistEvent,
  LwGmMusicTriggerItem,
  LwGmPlaylistItem,
  LwMusicTrackItem,
  LwMusicTriggerScope,
  LwUpsertMusicTriggerEvent,
} from '../../../shared/ui/audio-stem-mixer/audio-stem-mixer.component';

export type {
  LwAudioScenePresetItem,
  LwAudioStemItem,
  LwCreatePlaylistEvent,
  LwGmMusicTriggerItem,
  LwGmPlaylistItem,
  LwMusicTrackItem,
  LwMusicTriggerScope,
  LwUpsertMusicTriggerEvent,
};

const STORAGE_PLAYLISTS_KEY = 'lw_gm_music_playlists_v2';
const STORAGE_TRIGGERS_KEY = 'lw_gm_music_triggers_v2';
const STORAGE_CUSTOM_TRACKS_KEY = 'lw_gm_music_custom_tracks_v2';
const STORAGE_USER_VOLUME_KEY = 'lw_user_audio_volume_v1';
const STORAGE_USER_MUTED_KEY = 'lw_user_audio_muted_v1';

export const DEFAULT_MUSIC_TRACKS: readonly LwMusicTrackItem[] = [
  {
    id: 'track-dnd-acoustic-loop',
    title: 'D&D Acoustic Tavern & Road Loop',
    artist: 'ebunny',
    category: 'Session & Tavern',
    url: '/assets/music-library/ebunny-dnd-acoustic-loop-622875.mp3',
    durationSeconds: 138,
    mood: 'Warm Acoustic Lute & Campfire Rest',
  },
  {
    id: 'track-the-longest-journey',
    title: 'The Longest Journey',
    artist: 'Alexander Nakarada',
    category: 'Campaign Theme',
    url: '/assets/music-library/nakaradaalexander-the-longest-journey-408735.mp3',
    durationSeconds: 422,
    mood: 'Epic Overland Chronicle & Horizon Travel',
  },
  {
    id: 'track-woods-of-imagination',
    title: 'Woods of Imagination',
    artist: 'Alexander Nakarada',
    category: 'Session & Exploration',
    url: '/assets/music-library/nakaradaalexander-woods-of-imagination-139004.mp3',
    durationSeconds: 171,
    mood: 'Mystic Woodland, Feywild & Ancient Lore',
  },
  {
    id: 'track-here-be-dragons',
    title: 'Here Be Dragons',
    artist: 'Tim Kulig',
    category: 'Battlemap & Boss',
    url: '/assets/music-library/tim_kulig_free_music-here-be-dragons-127810.mp3',
    durationSeconds: 307,
    mood: 'Mythic Dragon Lair & High-Stakes Boss Encounter',
  },
  {
    id: 'track-in-pursuit-of-a-pirate',
    title: 'In Pursuit of a Pirate',
    artist: 'Tim Kulig',
    category: 'Battlemap & Skirmish',
    url: '/assets/music-library/tim_kulig_free_music-in-pursuit-of-a-pirate-127812.mp3',
    durationSeconds: 98,
    mood: 'Swashbuckling Skyship Chase & Ambush',
  },
  {
    id: 'track-challenge-of-the-goliath',
    title: 'The Challenge of the Goliath',
    artist: 'Tim Kulig',
    category: 'Battlemap & Combat',
    url: '/assets/music-library/tim_kulig_free_music-the-challenge-of-the-golliath-154943.mp3',
    durationSeconds: 254,
    mood: 'Heavy Tactical Battlemap & Initiative Clash',
  },
];

export const DEFAULT_GM_PLAYLISTS: readonly LwGmPlaylistItem[] = [
  {
    id: 'playlist-campaign-overworld',
    name: 'Campaign Chronicle & World Map',
    description:
      'Default campaign soundtrack when entering the campaign dashboard, world lore, and overland travel.',
    trackIds: [
      'track-the-longest-journey',
      'track-woods-of-imagination',
      'track-dnd-acoustic-loop',
    ],
    loop: true,
  },
  {
    id: 'playlist-session-start',
    name: 'Session Opening & Tavern Gathering',
    description:
      'Triggered automatically when a session starts or switches to the active table session.',
    trackIds: [
      'track-dnd-acoustic-loop',
      'track-woods-of-imagination',
      'track-the-longest-journey',
    ],
    loop: true,
  },
  {
    id: 'playlist-battlemap-combat',
    name: 'Live Battlemap & Tactical Combat',
    description:
      'Triggered automatically when a battlemap goes live on the VTT or is published to the active encounter.',
    trackIds: [
      'track-challenge-of-the-goliath',
      'track-here-be-dragons',
      'track-in-pursuit-of-a-pirate',
    ],
    loop: true,
  },
];

export const DEFAULT_GM_TRIGGERS: readonly LwGmMusicTriggerItem[] = [
  {
    id: 'trig-campaign-default',
    scope: 'campaign',
    targetKey: '*',
    targetLabel: 'Any Campaign (Campaign Theme)',
    playlistId: 'playlist-campaign-overworld',
    trackId: 'track-the-longest-journey',
    autoPlay: true,
    crossfadeSeconds: 2.4,
  },
  {
    id: 'trig-session-default',
    scope: 'session',
    targetKey: '*',
    targetLabel: 'When Any Session Starts / Goes Active',
    playlistId: 'playlist-session-start',
    trackId: 'track-dnd-acoustic-loop',
    autoPlay: true,
    crossfadeSeconds: 2.0,
  },
  {
    id: 'trig-battlemap-default',
    scope: 'battlemap',
    targetKey: '*',
    targetLabel: 'When Any Battlemap Goes Live on VTT',
    playlistId: 'playlist-battlemap-combat',
    trackId: 'track-challenge-of-the-goliath',
    autoPlay: true,
    crossfadeSeconds: 1.5,
  },
  {
    id: 'trig-battlemap-dragon',
    scope: 'battlemap',
    targetKey: 'scene-shadow-mountain',
    targetLabel: 'Shadow of the Mountain — Dragon Cavern Battlemap',
    playlistId: 'playlist-battlemap-combat',
    trackId: 'track-here-be-dragons',
    autoPlay: true,
    crossfadeSeconds: 1.5,
  },
];

const DEFAULT_STEMS: readonly LwAudioStemItem[] = [
  {
    id: 'stem-drone',
    name: 'Sub-Bass Cathedral Drone',
    role: 'Foundation Pad',
    waveform: 'sine',
    baseFrequencyHz: 65.41,
    gain: 0.55,
  },
  {
    id: 'stem-harmony',
    name: 'Nocturne Strings & Glass Harp',
    role: 'Exploration Melody',
    waveform: 'triangle',
    baseFrequencyHz: 196.0,
    gain: 0.82,
  },
  {
    id: 'stem-tension',
    name: 'Runic Heartbeat & Low Brass',
    role: 'Intrigue / Threat',
    waveform: 'sawtooth',
    baseFrequencyHz: 98.0,
    gain: 0.48,
  },
  {
    id: 'stem-combat',
    name: 'War Drums & Clockwork Anvil',
    role: 'Combat Percussion',
    waveform: 'square',
    baseFrequencyHz: 130.81,
    gain: 0.08,
  },
];

const DEFAULT_PRESETS: readonly LwAudioScenePresetItem[] = [
  {
    id: 'preset-cinth-ballroom',
    name: 'Masquerade Ballroom',
    mood: 'Intrigue & Velvet Tension',
    bpm: 108,
    keySignature: 'C Minor',
    description:
      'Chamber strings and subtle glass harp layered over a dormant vampiric heartbeat.',
    crossfadeSeconds: 2.4,
    stemGains: {
      'stem-drone': 0.55,
      'stem-harmony': 0.82,
      'stem-tension': 0.48,
      'stem-combat': 0.08,
    },
  },
  {
    id: 'preset-shadow-mountain',
    name: 'Subterranean Dread',
    mood: 'Mythic Dread & Ancient Runes',
    bpm: 64,
    keySignature: 'D Phrygian',
    description:
      'Deep tectonic sub-bass and scraping runic resonance echoing from a sealed cavern.',
    crossfadeSeconds: 3.2,
    stemGains: {
      'stem-drone': 0.92,
      'stem-harmony': 0.28,
      'stem-tension': 0.85,
      'stem-combat': 0.22,
    },
  },
  {
    id: 'preset-blood-waltz-combat',
    name: 'Crimson Covenant Ambush',
    mood: 'Active Tactical Combat',
    bpm: 142,
    keySignature: 'F Minor',
    description:
      'Full combat percussion and aggressive low brass driving high-stakes initiative turns.',
    crossfadeSeconds: 1.5,
    stemGains: {
      'stem-drone': 0.78,
      'stem-harmony': 0.45,
      'stem-tension': 0.9,
      'stem-combat': 0.95,
    },
  },
  {
    id: 'preset-skyship-horizon',
    name: 'Skyship Over the Coast',
    mood: 'High Adventure & Wind',
    bpm: 118,
    keySignature: 'G Dorian',
    description:
      'Soaring artificer turbine hum and open-sky harmonic chords over the open water.',
    crossfadeSeconds: 2.8,
    stemGains: {
      'stem-drone': 0.48,
      'stem-harmony': 0.9,
      'stem-tension': 0.2,
      'stem-combat': 0.3,
    },
  },
];

@Injectable({ providedIn: 'root' })
export class WebAudioAmbienceService {
  private activeAudioEl: HTMLAudioElement | null = null;
  private fadingAudioEl: HTMLAudioElement | null = null;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;

  readonly isPlaying = signal<boolean>(false);
  readonly activePresetId = signal<string>('preset-cinth-ballroom');
  readonly masterVolume = signal<number>(this.readStorage<number>(STORAGE_USER_VOLUME_KEY, 0.8));
  readonly isMuted = signal<boolean>(this.readStorage<boolean>(STORAGE_USER_MUTED_KEY, false));
  readonly effectiveVolume = computed(() => (this.isMuted() ? 0 : this.masterVolume()));
  readonly stems = signal<readonly LwAudioStemItem[]>(DEFAULT_STEMS);
  readonly presets = signal<readonly LwAudioScenePresetItem[]>(DEFAULT_PRESETS);

  readonly tracks = signal<readonly LwMusicTrackItem[]>(this.loadInitialTracks());
  readonly playlists = signal<readonly LwGmPlaylistItem[]>(this.loadInitialPlaylists());
  readonly triggers = signal<readonly LwGmMusicTriggerItem[]>(this.loadInitialTriggers());
  readonly activeTrackId = signal<string>('track-the-longest-journey');
  readonly activePlaylistId = signal<string>('playlist-campaign-overworld');
  readonly currentTimeSeconds = signal<number>(0);
  readonly durationSeconds = signal<number>(422);
  readonly loopMode = signal<'playlist' | 'track'>('playlist');
  readonly lastTriggerBanner = signal<string>('Ready · 6 real MP3 tracks loaded from /assets/music-library');

  readonly activeTrack = computed<LwMusicTrackItem>(() => {
    const list = this.tracks();
    return list.find((t) => t.id === this.activeTrackId()) ?? list[0];
  });

  readonly activePlaylist = computed<LwGmPlaylistItem>(() => {
    const list = this.playlists();
    return list.find((p) => p.id === this.activePlaylistId()) ?? list[0];
  });

  hydrateFromServer(
    activePresetId: string,
    masterVolume: number,
    serverStems: readonly {
      id: string;
      name: string;
      role: string;
      waveform: string;
      baseFrequencyHz: number;
      defaultGain: number;
    }[],
    serverPresets: readonly LwAudioScenePresetItem[],
    serverTracks?: readonly LwMusicTrackItem[],
    serverPlaylists?: readonly LwGmPlaylistItem[],
    serverTriggers?: readonly LwGmMusicTriggerItem[],
    activeTrackId?: string,
    activePlaylistId?: string,
  ): void {
    if (serverPresets?.length) {
      this.presets.set(serverPresets);
    }
    this.activePresetId.set(activePresetId || 'preset-cinth-ballroom');
    const savedPersonalVolume = this.readStorage<number | null>(STORAGE_USER_VOLUME_KEY, null);
    if (savedPersonalVolume === null && masterVolume !== undefined) {
      this.masterVolume.set(masterVolume);
    }

    if (serverTracks?.length) {
      const custom = this.readStorage<LwMusicTrackItem[]>(STORAGE_CUSTOM_TRACKS_KEY, []);
      const merged = [...serverTracks];
      for (const c of custom) {
        if (!merged.some((m) => m.id === c.id || m.url === c.url)) {
          merged.push(c);
        }
      }
      this.tracks.set(merged);
    }
    if (serverPlaylists?.length) {
      const localPlaylists = this.readStorage<LwGmPlaylistItem[] | null>(STORAGE_PLAYLISTS_KEY, null);
      this.playlists.set(localPlaylists?.length ? localPlaylists : serverPlaylists);
    }
    if (serverTriggers?.length) {
      const localTriggers = this.readStorage<LwGmMusicTriggerItem[] | null>(STORAGE_TRIGGERS_KEY, null);
      this.triggers.set(localTriggers?.length ? localTriggers : serverTriggers);
    }
    if (activeTrackId && this.tracks().some((t) => t.id === activeTrackId)) {
      this.activeTrackId.set(activeTrackId);
    }
    if (activePlaylistId && this.playlists().some((p) => p.id === activePlaylistId)) {
      this.activePlaylistId.set(activePlaylistId);
    }

    const activePreset =
      this.presets().find((p) => p.id === this.activePresetId()) ?? this.presets()[0];

    if (serverStems?.length) {
      this.stems.set(
        serverStems.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          waveform: s.waveform,
          baseFrequencyHz: s.baseFrequencyHz,
          gain: activePreset?.stemGains[s.id] ?? s.defaultGain,
        })),
      );
    }
  }

  togglePlayback(): void {
    if (this.isPlaying()) {
      this.pauseEngine();
    } else {
      this.startOrResumeTrack(this.activeTrackId(), 0.8);
    }
  }

  play(): void {
    this.startOrResumeTrack(this.activeTrackId(), 0.6);
  }

  pause(): void {
    this.pauseEngine();
  }

  restartTrack(): void {
    this.seekTo(0);
    if (!this.isPlaying()) {
      this.startOrResumeTrack(this.activeTrackId(), 0.3);
    } else if (this.activeAudioEl) {
      try {
        this.activeAudioEl.currentTime = 0;
        void this.activeAudioEl.play();
      } catch {}
    }
  }

  toggleMute(): void {
    const next = !this.isMuted();
    this.isMuted.set(next);
    this.writeStorage(STORAGE_USER_MUTED_KEY, next);
    if (this.activeAudioEl) {
      this.activeAudioEl.volume = this.effectiveVolume();
    }
  }

  playTrack(trackId: string, playlistId?: string, crossfadeSeconds = 1.5): LwMusicTrackItem | undefined {
    const track = this.tracks().find((t) => t.id === trackId);
    if (!track) return undefined;
    if (playlistId && this.playlists().some((p) => p.id === playlistId)) {
      this.activePlaylistId.set(playlistId);
    }
    this.activeTrackId.set(track.id);
    this.durationSeconds.set(track.durationSeconds || 180);
    this.startOrResumeTrack(track.id, crossfadeSeconds);
    return track;
  }

  selectPlaylist(playlistId: string, autoPlay = true): LwGmPlaylistItem | undefined {
    const pl = this.playlists().find((p) => p.id === playlistId);
    if (!pl) return undefined;
    this.activePlaylistId.set(pl.id);
    const firstTrackId = pl.trackIds[0] || this.activeTrackId();
    if (firstTrackId) {
      this.activeTrackId.set(firstTrackId);
      if (autoPlay || this.isPlaying()) {
        this.startOrResumeTrack(firstTrackId, 1.8);
      }
    }
    this.lastTriggerBanner.set(`Activated playlist "${pl.name}" (${pl.trackIds.length} songs)`);
    return pl;
  }

  nextTrack(): void {
    const queue = this.getActiveQueueTrackIds();
    if (queue.length === 0) return;
    const idx = queue.indexOf(this.activeTrackId());
    const nextIdx = idx >= 0 ? (idx + 1) % queue.length : 0;
    this.playTrack(queue[nextIdx], this.activePlaylistId(), 1.2);
  }

  previousTrack(): void {
    if (this.activeAudioEl && this.activeAudioEl.currentTime > 4) {
      this.activeAudioEl.currentTime = 0;
      this.currentTimeSeconds.set(0);
      return;
    }
    const queue = this.getActiveQueueTrackIds();
    if (queue.length === 0) return;
    const idx = queue.indexOf(this.activeTrackId());
    const prevIdx = idx > 0 ? idx - 1 : queue.length - 1;
    this.playTrack(queue[prevIdx], this.activePlaylistId(), 1.2);
  }

  seekTo(seconds: number): void {
    const clamped = Math.max(0, seconds);
    this.currentTimeSeconds.set(clamped);
    if (this.activeAudioEl) {
      try {
        this.activeAudioEl.currentTime = clamped;
      } catch {
        // Ignore seek before metadata ready
      }
    }
  }

  toggleLoopMode(): void {
    const next = this.loopMode() === 'playlist' ? 'track' : 'playlist';
    this.loopMode.set(next);
    if (this.activeAudioEl) {
      this.activeAudioEl.loop = next === 'track';
    }
  }

  setMasterVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.masterVolume.set(clamped);
    this.writeStorage(STORAGE_USER_VOLUME_KEY, clamped);
    if (clamped > 0 && this.isMuted()) {
      this.isMuted.set(false);
      this.writeStorage(STORAGE_USER_MUTED_KEY, false);
    }
    if (this.activeAudioEl) {
      this.activeAudioEl.volume = this.effectiveVolume();
    }
  }

  createPlaylist(event: LwCreatePlaylistEvent): LwGmPlaylistItem {
    const id = `playlist-${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const created: LwGmPlaylistItem = {
      id,
      name: event.name.trim(),
      description: event.description.trim() || 'Custom GM Soundtrack Playlist',
      trackIds: event.trackIds.length > 0 ? event.trackIds : [this.activeTrackId()],
      loop: true,
    };
    this.playlists.update((cur) => {
      const next = [...cur, created];
      this.writeStorage(STORAGE_PLAYLISTS_KEY, next);
      return next;
    });
    this.activePlaylistId.set(created.id);
    this.lastTriggerBanner.set(`Created playlist "${created.name}"`);
    return created;
  }

  deletePlaylist(playlistId: string): void {
    this.playlists.update((cur) => {
      const next = cur.filter((p) => p.id !== playlistId);
      this.writeStorage(STORAGE_PLAYLISTS_KEY, next);
      return next.length > 0 ? next : [...DEFAULT_GM_PLAYLISTS];
    });
    if (this.activePlaylistId() === playlistId) {
      this.activePlaylistId.set(this.playlists()[0]?.id || 'playlist-campaign-overworld');
    }
  }

  toggleTrackInPlaylist(playlistId: string, trackId: string): void {
    this.playlists.update((cur) => {
      const next = cur.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const exists = pl.trackIds.includes(trackId);
        const updatedIds = exists
          ? pl.trackIds.filter((id) => id !== trackId)
          : [...pl.trackIds, trackId];
        return { ...pl, trackIds: updatedIds };
      });
      this.writeStorage(STORAGE_PLAYLISTS_KEY, next);
      return next;
    });
  }

  updatePlaylist(
    playlistId: string,
    updates: Partial<Pick<LwGmPlaylistItem, 'name' | 'description' | 'trackIds' | 'loop'>>,
  ): void {
    this.playlists.update((cur) => {
      const next = cur.map((pl) => (pl.id === playlistId ? { ...pl, ...updates } : pl));
      this.writeStorage(STORAGE_PLAYLISTS_KEY, next);
      return next;
    });
  }

  addTrackToPlaylist(playlistId: string, trackId: string): void {
    this.playlists.update((cur) => {
      const next = cur.map((pl) => {
        if (pl.id !== playlistId) return pl;
        if (pl.trackIds.includes(trackId)) return pl;
        return { ...pl, trackIds: [...pl.trackIds, trackId] };
      });
      this.writeStorage(STORAGE_PLAYLISTS_KEY, next);
      return next;
    });
  }

  removeTrackFromPlaylist(playlistId: string, trackId: string): void {
    this.playlists.update((cur) => {
      const next = cur.map((pl) => {
        if (pl.id !== playlistId) return pl;
        return { ...pl, trackIds: pl.trackIds.filter((id) => id !== trackId) };
      });
      this.writeStorage(STORAGE_PLAYLISTS_KEY, next);
      return next;
    });
  }

  upsertTrigger(event: LwUpsertMusicTriggerEvent): LwGmMusicTriggerItem {
    const existing = this.triggers().find(
      (t) => t.scope === event.scope && t.targetKey === event.targetKey,
    );
    const item: LwGmMusicTriggerItem = {
      id: existing?.id || `trig-${event.scope}-${Date.now().toString().slice(-5)}`,
      scope: event.scope,
      targetKey: event.targetKey || '*',
      targetLabel: event.targetLabel,
      playlistId: event.playlistId,
      trackId: event.trackId,
      autoPlay: event.autoPlay,
      crossfadeSeconds: event.crossfadeSeconds,
    };
    this.triggers.update((cur) => {
      const filtered = cur.filter((t) => t.id !== item.id);
      const next = [item, ...filtered];
      this.writeStorage(STORAGE_TRIGGERS_KEY, next);
      return next;
    });
    const trackTitle = this.tracks().find((t) => t.id === item.trackId)?.title ?? item.trackId;
    this.lastTriggerBanner.set(
      `Assigned ${item.scope.toUpperCase()} trigger (${item.targetLabel}) -> "${trackTitle}"`,
    );
    return item;
  }

  removeTrigger(triggerId: string): void {
    this.triggers.update((cur) => {
      const next = cur.filter((t) => t.id !== triggerId);
      this.writeStorage(STORAGE_TRIGGERS_KEY, next);
      return next;
    });
  }

  addCustomAudioFiles(files: FileList): void {
    if (typeof URL === 'undefined') return;
    const added: LwMusicTrackItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;
      const cleanTitle = file.name
        .replace(/\.(mp3|ogg|wav|flac|m4a)$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      const id = `track-custom-${Date.now()}-${i}`;
      const objectUrl = URL.createObjectURL(file);
      added.push({
        id,
        title: cleanTitle || file.name,
        artist: 'GM Custom Upload',
        category: 'Custom Upload',
        url: objectUrl,
        durationSeconds: 180,
        mood: 'Custom GM Soundtrack',
      });
    }
    if (added.length > 0) {
      this.tracks.update((cur) => [...added, ...cur]);
      this.playlists.update((cur) => {
        const activeId = this.activePlaylistId();
        const next = cur.map((pl) =>
          pl.id === activeId
            ? { ...pl, trackIds: [...added.map((a) => a.id), ...pl.trackIds] }
            : pl,
        );
        this.writeStorage(STORAGE_PLAYLISTS_KEY, next);
        return next;
      });
      this.playTrack(added[0].id, this.activePlaylistId(), 1.0);
      this.lastTriggerBanner.set(`Added ${added.length} MP3 track(s) to library & active playlist`);
    }
  }

  /**
   * Automatically fires when:
   * - `scope === 'campaign'`: Campaign is selected or opened
   * - `scope === 'session'`: Session starts or becomes active
   * - `scope === 'battlemap'`: Battlemap goes live on the VTT or is published to an encounter
   */
  fireTrigger(
    scope: LwMusicTriggerScope,
    targetKey = '*',
    targetContextLabel?: string,
    forcePlay = false,
  ): LwGmMusicTriggerItem | null {
    const list = this.triggers().filter((t) => t.scope === scope);
    if (list.length === 0) return null;

    const exact =
      targetKey && targetKey !== '*'
        ? list.find((t) => t.targetKey.toLowerCase() === targetKey.toLowerCase())
        : undefined;
    const matched = exact ?? list.find((t) => t.targetKey === '*') ?? list[0];
    if (!matched) return null;

    if (matched.playlistId && this.playlists().some((p) => p.id === matched.playlistId)) {
      this.activePlaylistId.set(matched.playlistId);
    }
    const track =
      this.tracks().find((t) => t.id === matched.trackId) ??
      this.tracks().find(
        (t) => t.id === this.playlists().find((p) => p.id === matched.playlistId)?.trackIds[0],
      ) ??
      this.tracks()[0];

    if (!track) return null;

    const previousTrackId = this.activeTrackId();
    this.activeTrackId.set(track.id);
    this.durationSeconds.set(track.durationSeconds || 180);

    const contextText = targetContextLabel || matched.targetLabel;
    this.lastTriggerBanner.set(
      `${scope.toUpperCase()} Trigger (${contextText}) -> "${track.title}"`,
    );

    if (forcePlay || this.isPlaying() || (matched.autoPlay && scope === 'battlemap')) {
      if (previousTrackId !== track.id || !this.isPlaying()) {
        this.startOrResumeTrack(track.id, matched.crossfadeSeconds || 1.8);
      }
    }
    return matched;
  }

  setStemGain(stemId: string, gain: number): void {
    const clamped = Math.max(0, Math.min(1, gain));
    this.stems.update((list) =>
      list.map((s) => (s.id === stemId ? { ...s, gain: clamped } : s)),
    );
  }

  crossfadeToPreset(presetId: string): LwAudioScenePresetItem | undefined {
    const preset = this.presets().find((p) => p.id === presetId);
    if (!preset) return undefined;

    this.activePresetId.set(preset.id);
    this.stems.update((list) =>
      list.map((s) => ({
        ...s,
        gain: preset.stemGains[s.id] ?? s.gain,
      })),
    );

    // Map scene presets to real MP3 tracks
    const presetTrackMap: Record<string, string> = {
      'preset-cinth-ballroom': 'track-dnd-acoustic-loop',
      'preset-ballroom': 'track-dnd-acoustic-loop',
      'preset-shadow-mountain': 'track-here-be-dragons',
      'preset-blood-waltz-combat': 'track-challenge-of-the-goliath',
      'preset-skyship-horizon': 'track-in-pursuit-of-a-pirate',
    };
    const mappedTrackId = presetTrackMap[preset.id];
    if (mappedTrackId) {
      this.activeTrackId.set(mappedTrackId);
      if (this.isPlaying()) {
        this.startOrResumeTrack(mappedTrackId, preset.crossfadeSeconds);
      }
    }

    return preset;
  }

  stopEngine(): void {
    this.pauseEngine();
  }

  private pauseEngine(): void {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.fadingAudioEl) {
      try {
        this.fadingAudioEl.pause();
      } catch {}
      this.fadingAudioEl = null;
    }
    if (this.activeAudioEl) {
      try {
        this.activeAudioEl.pause();
      } catch {}
    }
    this.isPlaying.set(false);
  }

  private startOrResumeTrack(trackId: string, crossfadeSeconds = 1.5): void {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
    const track = this.tracks().find((t) => t.id === trackId) ?? this.tracks()[0];
    if (!track) return;

    this.activeTrackId.set(track.id);

    // If same track is already loaded in activeAudioEl, simply resume it
    if (
      this.activeAudioEl &&
      this.activeAudioEl.dataset['trackId'] === track.id &&
      !this.activeAudioEl.ended
    ) {
      this.activeAudioEl.volume = this.effectiveVolume();
      this.activeAudioEl
        .play()
        .then(() => {
          this.isPlaying.set(true);
        })
        .catch(() => {
          this.isPlaying.set(false);
        });
      return;
    }

    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.fadingAudioEl) {
      try {
        this.fadingAudioEl.pause();
      } catch {}
      this.fadingAudioEl = null;
    }

    const outgoing = this.activeAudioEl;
    const incoming = new Audio(track.url);
    incoming.preload = 'auto';
    incoming.dataset['trackId'] = track.id;
    incoming.loop = this.loopMode() === 'track';

    incoming.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(incoming.duration) && incoming.duration > 0) {
        this.durationSeconds.set(Math.round(incoming.duration));
      }
    });

    incoming.addEventListener('timeupdate', () => {
      if (this.activeAudioEl === incoming) {
        this.currentTimeSeconds.set(Math.floor(incoming.currentTime));
      }
    });

    incoming.addEventListener('ended', () => {
      if (this.activeAudioEl === incoming && this.loopMode() === 'playlist') {
        this.nextTrack();
      }
    });

    this.activeAudioEl = incoming;
    this.currentTimeSeconds.set(0);
    this.durationSeconds.set(track.durationSeconds || 180);

    const targetVol = this.effectiveVolume();
    if (outgoing && !outgoing.paused && crossfadeSeconds > 0.2) {
      this.fadingAudioEl = outgoing;
      incoming.volume = 0.02;
      incoming
        .play()
        .then(() => {
          this.isPlaying.set(true);
          const steps = Math.max(6, Math.round(crossfadeSeconds * 15));
          let step = 0;
          const outStartVol = outgoing.volume;
          this.fadeTimer = setInterval(() => {
            step++;
            const t = Math.min(1, step / steps);
            incoming.volume = Math.min(1, targetVol * t);
            outgoing.volume = Math.max(0, outStartVol * (1 - t));
            if (t >= 1) {
              if (this.fadeTimer) {
                clearInterval(this.fadeTimer);
                this.fadeTimer = null;
              }
              try {
                outgoing.pause();
              } catch {}
              this.fadingAudioEl = null;
            }
          }, Math.round((crossfadeSeconds * 1000) / steps));
        })
        .catch(() => {
          try {
            outgoing.pause();
          } catch {}
          this.fadingAudioEl = null;
          this.isPlaying.set(false);
        });
    } else {
      if (outgoing) {
        try {
          outgoing.pause();
        } catch {}
      }
      incoming.volume = targetVol;
      incoming
        .play()
        .then(() => {
          this.isPlaying.set(true);
        })
        .catch(() => {
          this.isPlaying.set(false);
        });
    }
  }

  private getActiveQueueTrackIds(): readonly string[] {
    const pl = this.activePlaylist();
    if (pl && pl.trackIds.length > 0) {
      return pl.trackIds;
    }
    return this.tracks().map((t) => t.id);
  }

  private loadInitialTracks(): readonly LwMusicTrackItem[] {
    const custom = this.readStorage<LwMusicTrackItem[]>(STORAGE_CUSTOM_TRACKS_KEY, []);
    return [...DEFAULT_MUSIC_TRACKS, ...custom];
  }

  private loadInitialPlaylists(): readonly LwGmPlaylistItem[] {
    const saved = this.readStorage<LwGmPlaylistItem[] | null>(STORAGE_PLAYLISTS_KEY, null);
    return saved && saved.length > 0 ? saved : DEFAULT_GM_PLAYLISTS;
  }

  private loadInitialTriggers(): readonly LwGmMusicTriggerItem[] {
    const saved = this.readStorage<LwGmMusicTriggerItem[] | null>(STORAGE_TRIGGERS_KEY, null);
    return saved && saved.length > 0 ? saved : DEFAULT_GM_TRIGGERS;
  }

  private readStorage<T>(key: string, fallback: T): T {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {}
  }
}
