/**
 * A minimal in-memory stand-in for the Web Audio API, used by tests because
 * Node has no AudioContext. It reproduces the behaviour that actually matters
 * for correctness - most importantly that an OscillatorNode may be started and
 * stopped exactly once, and throws InvalidStateError otherwise. That rule is
 * what made a pooled voice fail on its second use, so it is modelled rather
 * than stubbed out.
 */

export class FakeParam {
  value = 0;

  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }

  setTargetAtTime(value: number): this {
    this.value = value;
    return this;
  }

  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeNode {
  /** What this node has been connected to, so tests can assert routing. */
  readonly connections: unknown[] = [];
  readonly disconnections: unknown[] = [];

  connect<T>(dest: T): T {
    this.connections.push(dest);
    return dest;
  }

  disconnect(dest?: unknown): void {
    this.disconnections.push(dest);
  }
}

export class FakeOscillator extends FakeNode {
  frequency = new FakeParam();
  detune = new FakeParam();
  private started = false;
  private stopped = false;

  setPeriodicWave(): void {}

  start(): void {
    if (this.started) throw new Error('InvalidStateError: start called twice');
    this.started = true;
  }

  stop(): void {
    if (!this.started) throw new Error('InvalidStateError: stop before start');
    if (this.stopped) throw new Error('InvalidStateError: stop called twice');
    this.stopped = true;
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam();
}

export class FakeFilter extends FakeNode {
  type = 'lowpass';
  Q = new FakeParam();
  frequency = new FakeParam();
}

export class FakePanner extends FakeNode {
  pan = new FakeParam();
}

export class FakeCompressor extends FakeNode {
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
}

export class FakeConvolver extends FakeNode {
  buffer: unknown = null;
}

export class FakeDelay extends FakeNode {
  delayTime = new FakeParam();
}

class FakeBuffer {
  private readonly channels: Float32Array[];

  constructor(channels: number, length: number) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: 'running' | 'suspended' = 'running';
  destination = new FakeGain();
  /** Every oscillator this context has created, so tests can count voices. */
  readonly oscillators: FakeOscillator[] = [];

  createGain(): FakeGain {
    return new FakeGain();
  }

  createOscillator(): FakeOscillator {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }

  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }

  createStereoPanner(): FakePanner {
    return new FakePanner();
  }

  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor();
  }

  createConvolver(): FakeConvolver {
    return new FakeConvolver();
  }

  createDelay(_maxDelayTime?: number): FakeDelay {
    return new FakeDelay();
  }

  createBuffer(channels: number, length: number): FakeBuffer {
    return new FakeBuffer(channels, length);
  }

  createPeriodicWave(real: Float32Array, imag: Float32Array): { real: Float32Array; imag: Float32Array } {
    return { real, imag };
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }
}
