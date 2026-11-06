import { useCallback, useEffect, useRef, useState } from 'react';
import { floatToInt16 } from './pcm';

const SAMPLE_RATE = 16000;

interface Capture {
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
}

// Captures the mic as 16 kHz PCM chunks (about 100 ms each) for server-side recognition.
export function useMic(onChunk: (pcm: Int16Array<ArrayBuffer>) => void) {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capture = useRef<Capture | null>(null);
  // Bumped by every start/stop so a start that finishes late can tell it was cancelled.
  const run = useRef(0);
  const handler = useRef(onChunk);
  useEffect(() => {
    handler.current = onChunk;
  });

  const stop = useCallback(() => {
    run.current++;
    const c = capture.current;
    capture.current = null;
    setCapturing(false);
    if (!c) return;
    c.node.port.onmessage = null;
    c.node.disconnect();
    c.stream.getTracks().forEach((t) => t.stop());
    void c.ctx.close();
  }, []);

  const start = useCallback(async () => {
    if (capture.current) return;
    const mine = ++run.current;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      await ctx.audioWorklet.addModule('/pcm-worklet.js');
      if (mine !== run.current) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        return;
      }
      const node = new AudioWorkletNode(ctx, 'pcm-chunker');
      node.port.onmessage = (e: MessageEvent<Float32Array>) =>
        handler.current(floatToInt16(e.data));
      ctx.createMediaStreamSource(stream).connect(node);
      capture.current = { stream, ctx, node };
      setCapturing(true);
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      setError(
        denied
          ? 'Microphone access was blocked. Allow it in the browser address bar, then press Start.'
          : 'Could not start the microphone. Check that one is connected, then press Start.',
      );
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { capturing, error, start, stop };
}
