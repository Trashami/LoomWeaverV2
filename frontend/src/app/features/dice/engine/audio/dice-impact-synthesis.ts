export type ImpactSurface = 'wood' | 'felt' | 'metal' | 'plastic' | 'stone' | 'glass' | 'bell';
export type DieSoundMaterial = 'plastic' | 'metal' | 'wood' | 'stone' | 'glass';
const surfaces: Record<ImpactSurface, [number, number, number, number]> = {
  wood: [310, 0.045, 0.43, 0.14], felt: [180, 0.018, 0.14, 0.025],
  metal: [1150, 0.095, 0.82, 0.21], plastic: [780, 0.032, 0.7, 0.08],
  stone: [560, 0.044, 0.72, 0.10], glass: [1850, 0.105, 0.92, 0.18], bell: [310, 0.045, 0.43, 0.14],
};
const bodies: Record<DieSoundMaterial, [number, number, number]> = {
  plastic: [1250, 0.019, 0.045], metal: [2550, 0.075, 0.13],
  wood: [470, 0.03, 0.10], stone: [880, 0.025, 0.07], glass: [3100, 0.07, 0.11],
};
/** Short broadband contact plus separately damped die and tabletop modes.
 * Glass is a hard click with a brief high tail, not a tuned musical chime.
 * Generated buffers are cached; no per-impact oscillator/filter graph is needed. */
export function synthesizeDiceImpact(surface: ImpactSurface, sampleRate: number, seed: number,
  material: DieSoundMaterial = 'plastic', bellOnly = false): Float32Array {
  const [frequency, decay, brightness, resonance] = surfaces[surface];
  const [bodyHz, bodyDecay, bodyLevel] = bodies[material];
  const hasBell = surface === 'bell';
  const result = new Float32Array(Math.ceil(sampleRate * (hasBell ? 0.8 : Math.max(decay, bodyDecay) * 5)));
  let state = seed | 0, low = 0, dull = 0;
  const random = () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296 * 2 - 1; };
  const pitch = 0.92 + (random() + 1) * 0.08;
  const contactTime = surface === 'felt' ? 0.009 : material === 'metal' ? 0.0025 : 0.0045;
  for (let i = 0; i < result.length; i++) {
    const t = i / sampleRate, noise = random();
    low += (noise - low) * brightness; dull += (noise - dull) * 0.12;
    let table = 0, body = 0;
    for (let j = 0; j < 3; j++) {
      table += Math.sin(2 * Math.PI * frequency * pitch * [1, 1.83, 2.67][j] * t)
        * Math.exp(-t * (1.8 + j) / decay) / (j + 1);
      body += Math.sin(2 * Math.PI * bodyHz * pitch * [1, 2.13, 3.47][j] * t)
        * Math.exp(-t * (2 + j) / bodyDecay) / (j + 1);
    }
    const contact = (low * 0.72 + dull * 0.28) * Math.exp(-t / contactTime);
    let sound = bellOnly ? 0 : contact * (surface === 'felt' ? 0.48 : 1.3) + table * resonance + body * bodyLevel;
    if (hasBell) {
      // Low-volume internal ball resonance, beneath the contact instead of replacing it.
      sound += 0.035 * (Math.sin(2 * Math.PI * 1660 * t) + 0.35 * Math.sin(2 * Math.PI * 2470 * t))
        * Math.exp(-t / 0.16);
    }
    result[i] = Math.tanh(sound * Math.min(1, t / 0.0005)) * 0.65;
  }
  return result;
}
