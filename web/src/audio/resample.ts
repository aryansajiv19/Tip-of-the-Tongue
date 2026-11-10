// Turns the microphone's own rate (44.1 or 48 kHz for most, 16 kHz or 8 kHz from a Bluetooth
// headset in call mode) into Deepgram's 16 kHz, in chunks of exactly 100 ms. The microphone is
// opened at whatever rate the browser picks, because Firefox refuses a context at another rate.
//
// Each output sample is a windowed-sinc average of the input around it, with the cutoff a little
// under the output's Nyquist so what lies above it is cut, not folded back into the speech.
// Output sample k is the input at time k/16000, with no delay, whatever the chunk sizes.

const ZERO_CROSSINGS = 8;
// Below the output's Nyquist, to leave room for the filter's slope.
const CUTOFF_SHARE = 0.95;

export class Resampler {
  private readonly step: number;
  private readonly cutoff: number;
  // Half the kernel's width, in input samples.
  private readonly half: number;
  private input = new Float32Array(0);
  // Where the next output sample sits, in `input` (fractional).
  private pos = 0;
  private output = new Float32Array(0);

  constructor(
    fromRate: number,
    toRate: number,
    private readonly chunk: number,
  ) {
    this.step = fromRate / toRate;
    this.cutoff = Math.min(1, toRate / fromRate) * CUTOFF_SHARE;
    this.half = ZERO_CROSSINGS / this.cutoff;
  }

  // Takes samples as they come and gives back every full chunk now complete (usually one).
  push(samples: Float32Array): Float32Array[] {
    const x = new Float32Array(this.input.length + samples.length);
    x.set(this.input);
    x.set(samples, this.input.length);

    const made: number[] = [];
    while (Math.floor(this.pos + this.half) < x.length) {
      made.push(this.sampleAt(x, this.pos));
      this.pos += this.step;
    }
    // Keep what the next samples still need.
    const drop = Math.max(0, Math.ceil(this.pos - this.half));
    this.input = x.slice(drop);
    this.pos -= drop;

    const joined = new Float32Array(this.output.length + made.length);
    joined.set(this.output);
    joined.set(made, this.output.length);
    const chunks: Float32Array[] = [];
    let at = 0;
    for (; at + this.chunk <= joined.length; at += this.chunk) {
      chunks.push(joined.slice(at, at + this.chunk));
    }
    this.output = joined.slice(at);
    return chunks;
  }

  private sampleAt(x: Float32Array, center: number): number {
    let sum = 0;
    let weights = 0;
    for (let i = Math.max(0, Math.ceil(center - this.half)); i <= center + this.half; i++) {
      const t = (i - center) * this.cutoff;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const window = 0.5 * (1 + Math.cos((Math.PI * (i - center)) / this.half));
      const w = sinc * window;
      sum += (x[i] ?? 0) * w;
      weights += w;
    }
    // Normalised, so a steady level comes out at the same level.
    return weights === 0 ? 0 : sum / weights;
  }
}
