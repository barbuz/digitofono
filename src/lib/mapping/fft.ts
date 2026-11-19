/**
 * Radix-2 in-place forward FFT.
 *
 * The analysis needs one fixed-size transform of real input, so a small
 * iterative Cooley-Tukey is cheaper than a dependency and keeps the analysis
 * layer framework-free and testable against a naive DFT.
 */
export class Fft {
  readonly size: number;
  private readonly reverse: Uint32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of two');
    }
    this.size = size;

    const bits = Math.log2(size);
    this.reverse = new Uint32Array(size);
    for (let i = 0; i < size; i += 1) {
      let reversed = 0;
      for (let b = 0; b < bits; b += 1) {
        reversed |= ((i >> b) & 1) << (bits - 1 - b);
      }
      this.reverse[i] = reversed;
    }

    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i += 1) {
      const angle = (-2 * Math.PI * i) / size;
      this.cos[i] = Math.cos(angle);
      this.sin[i] = Math.sin(angle);
    }
  }

  /** In-place transform of `re`/`im`, both of length `size`. */
  transform(re: Float32Array, im: Float32Array): void {
    const n = this.size;

    for (let i = 0; i < n; i += 1) {
      const j = this.reverse[i];
      if (j > i) {
        const reTmp = re[i];
        re[i] = re[j];
        re[j] = reTmp;
        const imTmp = im[i];
        im[i] = im[j];
        im[j] = imTmp;
      }
    }

    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const twiddleStep = n / len;
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < half; k += 1) {
          const cos = this.cos[k * twiddleStep];
          const sin = this.sin[k * twiddleStep];
          const a = start + k;
          const b = a + half;
          const reB = re[b] * cos - im[b] * sin;
          const imB = re[b] * sin + im[b] * cos;
          re[b] = re[a] - reB;
          im[b] = im[a] - imB;
          re[a] += reB;
          im[a] += imB;
        }
      }
    }
  }
}
