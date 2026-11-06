import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgpButton } from 'ng-primitives/button';
import { LoomWeaverStoreService } from '../../../../core/services/loomweaver-store.service';
import { WebAudioAmbienceService } from '../../../assets/engine/web-audio-ambience.service';
import { VttCombatService } from '../../services/vtt-combat.service';
import { VttServerSyncService } from '../../services/vtt-server-sync.service';

export type VttGmTrackerSection = 'music' | 'npcs' | 'traps' | 'monsters';

@Component({
  selector: 'lw-vtt-gm-trackers',
  standalone: true,
  imports: [FormsModule, NgpButton],
  templateUrl: './vtt-gm-trackers-panel.component.html',
  styleUrl: './vtt-gm-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VttGmTrackersPanelComponent {
  readonly vtt = inject(VttCombatService);
  readonly store = inject(LoomWeaverStoreService);
  readonly audio = inject(WebAudioAmbienceService);
  readonly serverSync = inject(VttServerSyncService);

  readonly section = signal<VttGmTrackerSection>('music');
  readonly encounter = computed(() => this.vtt.activeLiveEncounter());
  readonly isGm = computed(() => this.store.viewerRole() === 'gm');
  readonly userVolumePct = computed(() => Math.round(this.audio.effectiveVolume() * 100));

  onUserVolumeChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (!Number.isNaN(val)) {
      this.audio.setMasterVolume(val / 100);
    }
  }

  dmTogglePlayPause(): void {
    this.audio.togglePlayback();
    this.serverSync.publishAudioControl(this.audio.isPlaying() ? 'play' : 'pause', {
      trackId: this.audio.activeTrackId(),
      playlistId: this.audio.activePlaylistId(),
    });
  }

  dmRestartTrack(): void {
    this.audio.restartTrack();
    this.serverSync.publishAudioControl('restart', {
      trackId: this.audio.activeTrackId(),
      playlistId: this.audio.activePlaylistId(),
    });
  }

  dmPrevTrack(): void {
    this.audio.previousTrack();
    this.serverSync.publishAudioControl('track', {
      trackId: this.audio.activeTrackId(),
      playlistId: this.audio.activePlaylistId(),
    });
  }

  dmNextTrack(): void {
    this.audio.nextTrack();
    this.serverSync.publishAudioControl('track', {
      trackId: this.audio.activeTrackId(),
      playlistId: this.audio.activePlaylistId(),
    });
  }

  dmToggleLoop(): void {
    this.audio.toggleLoopMode();
    this.serverSync.publishAudioControl('loop', {
      loopMode: this.audio.loopMode(),
    });
  }

  dmSelectPlaylist(playlistId: string): void {
    this.audio.selectPlaylist(playlistId, true);
    this.serverSync.publishAudioControl('track', {
      trackId: this.audio.activeTrackId(),
      playlistId: this.audio.activePlaylistId(),
    });
  }

  dmSelectTrack(trackId: string): void {
    this.audio.playTrack(trackId, this.audio.activePlaylistId(), 1.0);
    this.serverSync.publishAudioControl('track', {
      trackId,
      playlistId: this.audio.activePlaylistId(),
    });
  }

  formatTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  toggleTrap(trapId: string): void {
    const enc = this.encounter();
    if (enc) this.vtt.toggleTrapArmed(enc.id, trapId);
  }
}
