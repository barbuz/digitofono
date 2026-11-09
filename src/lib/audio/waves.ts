/**
 * Build a `PeriodicWave` from harmonic amplitudes.
 *
 * All partials are given phase 0 (sine phase). Because the oscillators that
 * share this table run at the same frequency and phase, summing two tables
 * produces a spectrum that is the linear interpolation of the two amplitude
 * sets - which is what makes the harmonic-morph crossfade click-free.
 */
export function buildPeriodicWave(
  ctx: BaseAudioContext,
  amplitudes: number[],
): PeriodicWave {
  const real = new Float32Array(amplitudes.length + 1);
  const imag = new Float32Array(amplitudes.length + 1);

  for (let i = 0; i < amplitudes.length; i += 1) {
    imag[i + 1] = amplitudes[i];
  }

  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/**
 * Procedurally generate a stereo reverb impulse response: exponentially
 * decaying noise. Avoids shipping an audio asset.
 */
export function buildImpulseResponse(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return impulse;
}
