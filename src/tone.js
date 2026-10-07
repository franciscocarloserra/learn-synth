// Shelf response model, independent of audio playback. Same S=1 shape as Web Audio.
import { TONE_FREQUENCIES } from './config.js';
export function shelfResponse(key, gain, frequencies, output, sampleRate) {
  const A = 10 ** (gain / 40);
  const w = 2 * Math.PI * TONE_FREQUENCIES[key] / sampleRate;
  const c = Math.cos(w), beta = Math.sin(w) * Math.sqrt(2 * A);
  const plus = A + 1, minus = A - 1;
  const low = key === 'bass';
  const b = low
    ? [A * (plus - minus * c + beta), 2 * A * (minus - plus * c), A * (plus - minus * c - beta)]
    : [A * (plus + minus * c + beta), -2 * A * (minus + plus * c), A * (plus + minus * c - beta)];
  const a = low
    ? [plus + minus * c + beta, -2 * (minus + plus * c), plus + minus * c - beta]
    : [plus - minus * c + beta, 2 * (minus - plus * c), plus - minus * c - beta];
  for (let i = 0; i < frequencies.length; i++) {
    const phase = 2 * Math.PI * Math.min(frequencies[i], sampleRate / 2) / sampleRate;
    const power = coeff => (coeff[0] + coeff[1] * Math.cos(phase) + coeff[2] * Math.cos(2 * phase)) ** 2
      + (coeff[1] * Math.sin(phase) + coeff[2] * Math.sin(2 * phase)) ** 2;
    output[i] = Math.sqrt(power(b) / power(a));
  }
}
