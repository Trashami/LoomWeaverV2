import { evaluateDicePulse } from '../frontend/src/app/features/dice/engine/materials/dice-pulse';
import { synthesizeDiceImpact, ImpactSurface } from '../frontend/src/app/features/dice/engine/audio/dice-impact-synthesis';
const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
for (const wave of ['heartbeat', 'sine', 'sawtooth', 'flicker'] as const) {
  for (let i = 0; i < 1000; i++) {
    check(evaluateDicePulse(wave, i / 100, 0, 0.2, 0.8) === 0.8, `${wave}: zero is steady`);
    check(evaluateDicePulse(wave, i / 100, 20) === evaluateDicePulse(wave, i / 100, 2), `${wave}: frequency capped`);
  }
}
let peaks = 0;
for (let i = 1; i < 999; i++) {
  const value = evaluateDicePulse('heartbeat', i / 1000, 2);
  if (value > evaluateDicePulse('heartbeat', (i - 1) / 1000, 2) && value > evaluateDicePulse('heartbeat', (i + 1) / 1000, 2)) peaks++;
}
check(peaks === 2, 'Heartbeat must have two distinct peaks per cycle');
check(evaluateDicePulse('heartbeat', 0.7, 2, 0.8, 1) === 0, 'Heartbeat must pause even with legacy minimum');
const signatures = new Set<string>();
for (const surface of ['wood', 'felt', 'metal', 'plastic', 'stone', 'glass', 'bell'] as ImpactSurface[]) {
  const samples = synthesizeDiceImpact(surface, 24000, 42);
  check(samples.every(v => Number.isFinite(v) && Math.abs(v) <= 1), `${surface}: finite bounded waveform`);
  const power = (start: number, end: number) => samples.slice(start,end).reduce((sum,v) => sum + v*v, 0) / (end-start);
  check(power(0, 1000) > power(samples.length-1000, samples.length) * 10, `${surface}: natural decaying tail`);
  signatures.add(Array.from(samples.slice(50,65)).join(','));
}
check(signatures.size === 7, 'Every requested sound has a distinct waveform');
console.log('PASS: steady/off pulse, 2 Hz cap, lub-dub pause and seven distinct decaying impact sounds.');
