/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Runs on the audio thread. Collects the mic's 128-sample blocks into 100 ms chunks at the
// context's own rate (`sampleRate`: 44.1 or 48 kHz for most, less for a Bluetooth headset) and
// hands them to the page, which resamples them to 16 kHz, converts and sends them.
class PcmChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate / 10);
    this.chunk = new Float32Array(this.size);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let read = 0;
    while (read < channel.length) {
      const n = Math.min(channel.length - read, this.chunk.length - this.filled);
      this.chunk.set(channel.subarray(read, read + n), this.filled);
      this.filled += n;
      read += n;
      if (this.filled === this.chunk.length) {
        this.port.postMessage(this.chunk, [this.chunk.buffer]);
        this.chunk = new Float32Array(this.size);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-chunker', PcmChunker);
