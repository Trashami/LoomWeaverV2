import { DicePulseWaveform } from '../dice-physics.types';
/** Frequency is actual pulses per second; heartbeat emits two beats then rests. */
export function evaluateDicePulse(waveform: DicePulseWaveform, seconds: number, frequency: number,
  minimum = 0, maximum = 1): number {
  const hz = Math.max(0, Math.min(2, Number.isFinite(frequency) ? frequency : 0));
  if (hz === 0) return maximum;
  const phase = seconds * hz / (waveform === 'heartbeat' ? 2 : 1);
  const p = phase - Math.floor(phase);
  let amount: number;
  if (waveform === 'heartbeat') {
    const beat = (center: number, width: number) => Math.abs(p - center) < width
      ? Math.pow(Math.cos((p - center) / width * Math.PI / 2), 2) : 0;
    amount = beat(0.14, 0.095) + 0.65 * beat(0.36, 0.075);
    return maximum * amount;
  }
  amount = waveform === 'sawtooth' ? 1 - Math.abs(2 * p - 1)
    : 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
  if (waveform === 'flicker') amount = Math.pow(amount, 3);
  return minimum + (maximum - minimum) * amount;
}
