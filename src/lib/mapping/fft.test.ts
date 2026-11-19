import { describe, expect, it } from 'vitest';
import { Fft } from './fft';

function dft(samples: number[]): { re: number[]; im: number[] } {
  const n = samples.length;
  const re: number[] = [];
  const im: number[] = [];
  for (let k = 0; k < n; k += 1) {
    let real = 0;
    let imaginary = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (-2 * Math.PI * k * t) / n;
      real += samples[t] * Math.cos(angle);
      imaginary += samples[t] * Math.sin(angle);
    }
    re.push(real);
    im.push(imaginary);
  }
  return { re, im };
}

describe('Fft', () => {
  it('rejects sizes that are not a power of two', () => {
    expect(() => new Fft(6)).toThrow();
    expect(() => new Fft(0)).toThrow();
  });

  it('matches a naive DFT', () => {
    const samples = [1, -2, 0.5, 3, -1, 0.25, 2, -0.5];
    const expected = dft(samples);
    const fft = new Fft(samples.length);
    const re = Float32Array.from(samples);
    const im = new Float32Array(samples.length);
    fft.transform(re, im);

    for (let k = 0; k < samples.length; k += 1) {
      expect(re[k]).toBeCloseTo(expected.re[k], 4);
      expect(im[k]).toBeCloseTo(expected.im[k], 4);
    }
  });

  it('puts a pure bin-centred tone in exactly that bin', () => {
    const n = 64;
    const bin = 7;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 0; i < n; i += 1) re[i] = Math.cos((2 * Math.PI * bin * i) / n);

    new Fft(n).transform(re, im);

    expect(Math.hypot(re[bin], im[bin])).toBeCloseTo(n / 2, 3);
    for (const other of [1, 2, 3, 8, 9]) {
      expect(Math.hypot(re[other], im[other])).toBeLessThan(1e-3);
    }
  });
});
