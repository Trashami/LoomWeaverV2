import { Injectable, signal } from '@angular/core';
import {
  LwAudioScenePresetItem,
  LwAudioStemItem,
} from '../../../shared/ui/audio-stem-mixer/audio-stem-mixer.component';

interface ActiveOscillatorVoice {
  readonly osc: OscillatorNode;
  readonly lfo: OscillatorNode;
  readonly gainNode: GainNode;
}

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
  private audioCtx: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private readonly voices = new Map<string, ActiveOscillatorVoice>();

  readonly isPlaying = signal<boolean>(false);
  readonly activePresetId = signal<string>('preset-cinth-ballroom');
  readonly masterVolume = signal<number>(0.8);
  readonly stems = signal<readonly LwAudioStemItem[]>(DEFAULT_STEMS);
  readonly presets = signal<readonly LwAudioScenePresetItem[]>(DEFAULT_PRESETS);

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
  ): void {
    if (serverPresets?.length) {
      this.presets.set(serverPresets);
    }
    this.activePresetId.set(activePresetId || 'preset-cinth-ballroom');
    this.masterVolume.set(masterVolume ?? 0.8);
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
      this.stopEngine();
    } else {
      this.startEngine();
    }
  }

  setMasterVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.masterVolume.set(clamped);
    if (this.audioCtx && this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(clamped * 0.18, this.audioCtx.currentTime, 0.08);
    }
  }

  setStemGain(stemId: string, gain: number): void {
    const clamped = Math.max(0, Math.min(1, gain));
    this.stems.update((list) =>
      list.map((s) => (s.id === stemId ? { ...s, gain: clamped } : s)),
    );
    const voice = this.voices.get(stemId);
    if (this.audioCtx && voice) {
      voice.gainNode.gain.setTargetAtTime(clamped * 0.25, this.audioCtx.currentTime, 0.12);
    }
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

    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      for (const stem of this.stems()) {
        const voice = this.voices.get(stem.id);
        if (voice) {
          voice.gainNode.gain.cancelScheduledValues(now);
          voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
          voice.gainNode.gain.linearRampToValueAtTime(
            stem.gain * 0.25,
            now + preset.crossfadeSeconds,
          );
        }
      }
    }

    return preset;
  }

  stopEngine(): void {
    for (const v of this.voices.values()) {
      try {
        v.osc.stop();
        v.lfo.stop();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.voices.clear();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
      this.masterGainNode = null;
    }
    this.isPlaying.set(false);
  }

  private startEngine(): void {
    if (typeof window === 'undefined') return;
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    this.audioCtx = new AudioContextCtor();
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;

    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = this.masterVolume() * 0.18;

    filter.connect(this.masterGainNode);
    this.masterGainNode.connect(this.audioCtx.destination);

    this.stems().forEach((stem, idx) => {
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      osc.type = (['sine', 'triangle', 'sawtooth', 'square'].includes(stem.waveform)
        ? stem.waveform
        : 'sine') as OscillatorType;
      osc.frequency.value = stem.baseFrequencyHz;

      const lfo = this.audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.22 + idx * 0.14;

      const lfoGain = this.audioCtx.createGain();
      lfoGain.gain.value = 3.5;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const stemGain = this.audioCtx.createGain();
      stemGain.gain.value = stem.gain * 0.25;

      osc.connect(stemGain);
      stemGain.connect(filter);

      osc.start();
      lfo.start();
      this.voices.set(stem.id, { osc, lfo, gainNode: stemGain });
    });

    this.isPlaying.set(true);
  }
}
