export type ImpactSurface = 'wood' | 'felt' | 'metal' | 'plastic' | 'stone' | 'glass' | 'bell';
const surfaces: Record<ImpactSurface, [number, number, number, number]> = {
  wood: [430, 0.11, 0.66, 0.3], felt: [240, 0.055, 0.22, 0.08],
  metal: [840, 0.46, 0.72, 0.62], plastic: [1050, 0.085, 0.9, 0.2],
  stone: [610, 0.14, 0.85, 0.3], glass: [1630, 0.45, 0.6, 0.7], bell: [720, 1.7, 0.1, 0.92],
};
/** Damped contact noise and inharmonic body modes, synthesized once and cached.
 * Fixed mode frequencies avoid the cartoon pitch sweeps of oscillator impacts. */
export function synthesizeDiceImpact(surface: ImpactSurface, sampleRate: number, seed: number): Float32Array {
  const [frequency, decay, brightness, resonance] = surfaces[surface];
  const result = new Float32Array(Math.ceil(sampleRate * decay * 3));
  let state = seed | 0, low = 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296 * 2 - 1; };
  const pitch = frequency * (1 + random() * 0.07);
  const modes = surface === 'bell' ? [1, 1.48, 2.07, 2.65, 3.91] : [1, 1.71, 2.39, 3.14];
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate;
    const noise = random(); low += (noise - low) * brightness;
    let body = 0;
    modes.forEach((ratio, j) => { body += Math.sin(2 * Math.PI * pitch * ratio * t) * Math.exp(-t * (3 + j * 1.8) / decay) / (j + 1); });
    const contact = low * Math.exp(-t / (surface === 'felt' ? 0.012 : 0.006));
    const attack = Math.min(1, t / 0.001);
    result[i] = Math.tanh((contact * (1 - resonance * 0.6) + body * resonance * 0.45) * attack) * 0.65;
  }
  return result;
}
