import { useCallback, useEffect, useRef, useState } from 'react';
import { floatToInt16 } from './pcm';
import { MIC_BLOCKED } from '../ui/desktop';

const SAMPLE_RATE = 16000;
// A microphone that ends sooner than this after starting is not worth restarting again: the
// next one would end just as fast, and we would loop.
const MIN_LIFE_MS = 3000;

interface Capture {
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
}

const MIC_LOST = 'The microphone stopped. Check that it is connected, then press Start.';

// Captures the mic as 16 kHz PCM chunks (about 100 ms each) for server-side recognition.
export function useMic(onChunk: (pcm: Int16Array<ArrayBuffer>) => void, deviceId: string | null) {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capture = useRef<Capture | null>(null);
  // Bumped by every start/stop so a start that finishes late can tell it was cancelled.
  const run = useRef(0);
  const startAgain = useRef<() => Promise<void>>(async () => undefined);
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
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // ideal, not exact: a microphone that was unplugged falls back to the default one.
          ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
        },
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
      // The browser or the system pauses audio now and then (sleep, a call elsewhere): carry on.
      ctx.onstatechange = () => {
        if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      };
      // Unplugged, or switched away from (AirPods into their case): the track ends and the
      // worklet would go on sending silence. Open the default microphone instead, once.
      const startedAt = Date.now();
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (capture.current?.stream !== stream) return;
        stop();
        if (Date.now() - startedAt >= MIN_LIFE_MS) void startAgain.current();
        else setError(MIC_LOST);
      });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      setError(
        denied
          ? MIC_BLOCKED
          : 'Could not start the microphone. Check that one is connected, then press Start.',
      );
    }
  }, [deviceId, stop]);

  useEffect(() => {
    startAgain.current = start;
  }, [start]);
  useEffect(() => stop, [stop]);

  return { capturing, error, start, stop };
}
