// Synthetic audio for deterministic DSP tests.
export function sine(freq: number, sampleRate: number, n: number, amp = 0.3, phase = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * (i / sampleRate) + phase);
  return out;
}

/** Voice-like: harmonic series with a deliberately weak fundamental. */
export function harmonic(f0: number, sampleRate: number, n: number, amps = [0.1, 0.3, 0.25, 0.15, 0.08]): Float32Array {
  const out = new Float32Array(n);
  amps.forEach((a, k) => {
    for (let i = 0; i < n; i++) out[i] += a * Math.sin(2 * Math.PI * f0 * (k + 1) * (i / sampleRate));
  });
  return out;
}

/** Seeded white noise (mulberry32) so tests never flake. */
export function noise(n: number, amp = 0.3, seed = 42): Float32Array {
  let a = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out[i] = amp * ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1);
  }
  return out;
}

export function rms(buf: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

export const cents = (measured: number, expected: number) => 1200 * Math.log2(measured / expected);
