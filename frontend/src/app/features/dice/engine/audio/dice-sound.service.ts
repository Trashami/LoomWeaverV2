import { synthesizeDiceImpact, ImpactSurface, DieSoundMaterial } from './dice-impact-synthesis';
import { Injectable, signal } from '@angular/core';

export interface DiceSoundProfile {
  id: string;
  name: string;
  description: string;
  materialCategory: 'stone' | 'metal' | 'glass' | 'resin' | 'wood' | 'arcane' | 'felt' | 'plastic' | 'bell';
  baseFrequencyHz: number;
  resonanceQ: number;
  decaySeconds: number;
  harmonicRatio: number;
  customAudioUrl?: string;
  dieMaterial?: DieSoundMaterial;
}

export const DICE_SOUND_PROFILES: DiceSoundProfile[] = [
  {
    id: 'sfx-stone-rattle',
    name: 'Stone dice on stone',
    dieMaterial: 'stone',
    description: 'Deep lithic impacts with slate-table scraping resonance',
    materialCategory: 'stone',
    baseFrequencyHz: 260,
    resonanceQ: 5.5,
    decaySeconds: 0.085,
    harmonicRatio: 1.42
  },
  {
    id: 'sfx-metal-clink',
    name: 'Metal dice on metal',
    dieMaterial: 'metal',
    description: 'Crisp metallic strikes with high-frequency harmonic overtones',
    materialCategory: 'metal',
    baseFrequencyHz: 920,
    resonanceQ: 14.0,
    decaySeconds: 0.14,
    harmonicRatio: 2.15
  },
  {
    id: 'sfx-crystal-chime',
    name: 'Plastic dice on glass',
    description: 'Crystalline bell-like impacts with shimmering harmonic tail',
    materialCategory: 'glass',
    baseFrequencyHz: 1340,
    resonanceQ: 18.0,
    decaySeconds: 0.19,
    harmonicRatio: 2.62
  },
  {
    id: 'sfx-resin-clatter',
    name: 'Plastic dice on plastic',
    description: 'Snappy tabletop polyhedral clatter across felt and oak',
    materialCategory: 'resin',
    baseFrequencyHz: 520,
    resonanceQ: 7.2,
    decaySeconds: 0.065,
    harmonicRatio: 1.68
  },
  {
    id: 'sfx-wood-tumble',
    name: 'Plastic dice on wood',
    description: 'Warm, hollow hardwood knocks with organic grain resonance',
    materialCategory: 'wood',
    baseFrequencyHz: 340,
    resonanceQ: 6.4,
    decaySeconds: 0.072,
    harmonicRatio: 1.5
  },
  {
    id: 'sfx-arcane-hum',
    name: 'Metal dice on wood · soft bell core',
    dieMaterial: 'metal',
    description: 'Phase-shifted crystalline pulses with sub-octave hum',
    materialCategory: 'bell',
    baseFrequencyHz: 680,
    resonanceQ: 12.5,
    decaySeconds: 0.16,
    harmonicRatio: 1.88
  },
  { id: 'sfx-felt-soft', name: 'Plastic dice on felt', description: 'Soft padded tray impacts', materialCategory: 'felt', baseFrequencyHz: 240, resonanceQ: 1, decaySeconds: 0.055, harmonicRatio: 1.71 },
  ...(['glass', 'wood', 'felt', 'plastic'] as const).map(surface => ({ id: `sfx-metal-on-${surface}`,
    name: `Metal dice on ${surface}`, description: `A weighted metal die landing on ${surface}`,
    materialCategory: surface, dieMaterial: 'metal' as const, baseFrequencyHz: 850, resonanceQ: 2,
    decaySeconds: 0.08, harmonicRatio: 1.83 })),
  { id: 'sfx-wood-on-wood', name: 'Wood dice on wood', description: 'Dry wooden knocks',
    materialCategory: 'wood', dieMaterial: 'wood', baseFrequencyHz: 310, resonanceQ: 1, decaySeconds: 0.04, harmonicRatio: 1.83 },
  { id: 'sfx-plastic-on-metal', name: 'Plastic dice on metal', description: 'A short hard tray click',
    materialCategory: 'metal', dieMaterial: 'plastic', baseFrequencyHz: 1150, resonanceQ: 2, decaySeconds: 0.09, harmonicRatio: 1.83 }
];

export function resolveDiceSoundProfile(profileId: string | null | undefined): DiceSoundProfile {
  if (!profileId) {
    return DICE_SOUND_PROFILES[0];
  }
  return DICE_SOUND_PROFILES.find(p => p.id === profileId) ?? DICE_SOUND_PROFILES[0];
}

export function registerDiceSoundProfile(profile: DiceSoundProfile): void {
  const idx = DICE_SOUND_PROFILES.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    DICE_SOUND_PROFILES[idx] = profile;
  } else {
    DICE_SOUND_PROFILES.push(profile);
  }
}

@Injectable({ providedIn: 'root' })
export class DiceSoundService {
  readonly volume = signal<number>(0.78);
  readonly muted = signal<boolean>(false);

  private audioCtx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private lastBell = 0;

  setVolume(val: number): void {
    this.volume.set(Math.max(0, Math.min(1, val)));
  }

  setMuted(isMuted: boolean): void {
    this.muted.set(isMuted);
  }

  playRollStartClatter(profileId: string, diceCount = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    // A short hand rattle; table impacts follow the simulated collision frames.
    this.playBounceImpact(profileId, Math.min(0.3, diceCount * 0.06));
  }

  playBounceImpact(profileId: string, intensity = 0.75, bellOnly = false): void {
    const ctx = this.ensureContext();
    if (!ctx || this.voices.size >= 12 || intensity <= 0.01) return;
    const profile = resolveDiceSoundProfile(profileId), category = profile.materialCategory;
    const surface: ImpactSurface = category === 'resin' ? 'plastic' : category === 'arcane' ? 'bell' : category;
    const variant = Math.floor(Math.random() * 4);
    const key = `${surface}:${profile.dieMaterial ?? 'plastic'}:${variant}:${bellOnly}`;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const samples = synthesizeDiceImpact(surface, ctx.sampleRate, variant + 41, profile.dieMaterial, bellOnly);
      buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples); this.buffers.set(key, buffer);
    }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.playbackRate.value = 0.97 + Math.random() * 0.06;
    gain.gain.value = this.volume() * Math.max(0, Math.min(1, intensity));
    source.connect(gain); gain.connect(ctx.destination); this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  }

  playTumbleResonance(profileId: string, angularSpeed: number): void {
    const category = resolveDiceSoundProfile(profileId).materialCategory;
    if ((category !== 'bell' && category !== 'arcane') || angularSpeed < 2) return;
    const now = performance.now();
    if (now - this.lastBell < 1100) return;
    this.lastBell = now; this.playBounceImpact(profileId, Math.min(0.14, angularSpeed * 0.008), true);
  }

  playSettleChime(_profileId: string): void {
    // Ordinary dice stop sounding when their final contact decays.
  }

  playCriticalSuccessFanfare(profileId?: string): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const now = ctx.currentTime;

    notes.forEach((hz, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.055;
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(hz, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.22 * this.volume(), start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.62);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.66);
    });

    if (profileId) {
      this.playSettleChime(profileId);
    }
  }

  playCriticalFailureFracture(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [155.56, 146.83, 110.0, 73.42];

    freqs.forEach((hz, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.06;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(hz, start);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.68, start + 0.36);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.18 * this.volume(), start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  private ensureContext(): AudioContext | null {
    if (this.muted() || this.volume() <= 0.01 || typeof window === 'undefined') {
      return null;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return null;
    }
    if (!this.audioCtx) {
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }
}
