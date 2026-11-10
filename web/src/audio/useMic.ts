import { useCallback, useEffect, useRef, useState } from 'react';
import { floatToInt16 } from './pcm';
import { MIC_BLOCKED } from '../ui/desktop';
import { micErrorMessage } from './micError';
import { Resampler } from './resample';

// What Deepgram is given, and the size of a chunk of it (100 ms).
const SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = SAMPLE_RATE / 10;
// A microphone that ends sooner than this after starting is not worth restarting again: the
// next one would end just as fast, and we would loop.
const MIN_LIFE_MS = 3000;

interface Capture {
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
}

const MIC_LOST = 'The microphone stopped. Check that it is connected, then press Start.';

// Captures the mic as 16 kHz PCM chunks (100 ms each) for server-side recognition.
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
          // On: with the speakers on, the other person's voice comes back into the microphone, and
          // Deepgram recommends the browser's own echo cancellation for that
          // (developers.deepgram.com/guides/deep-dives/audio-preprocessing-barge-in).
          echoCancellation: true,
          // Off: Deepgram recommends none for transcription ("we recommend skipping noise
          // suppression entirely"), and it is the step that eats quiet, breathy speech.
          noiseSuppression: false,
          // On: it lifts a quiet voice, the case that matters most here. It can raise the noise
          // between words too, which only the recogniser sees; stalls are timed from words.
          autoGainControl: true,
          // ideal, not exact: a microphone that was unplugged falls back to the default one.
          ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
        },
      });
      // At the browser's own rate: Firefox refuses to connect a microphone to a context running
      // at another one. The chunks are brought to 16 kHz below.
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule('/pcm-worklet.js');
      if (mine !== run.current) {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        return;
      }
      const node = new AudioWorkletNode(ctx, 'pcm-chunker');
      const resampler = new Resampler(ctx.sampleRate, SAMPLE_RATE, CHUNK_SAMPLES);
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        for (const chunk of resampler.push(e.data)) handler.current(floatToInt16(chunk));
      };
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
      setError(micErrorMessage(err, MIC_BLOCKED));
    }
  }, [deviceId, stop]);

  useEffect(() => {
    startAgain.current = start;
  }, [start]);
  useEffect(() => stop, [stop]);

  // Another microphone was chosen while listening: carry on with the new one. (The level meter
  // already follows the choice; the recogniser must too, or they would hear different devices.)
  const lastDevice = useRef(deviceId);
  useEffect(() => {
    if (lastDevice.current === deviceId) return;
    lastDevice.current = deviceId;
    if (!capture.current) return;
    stop();
    void startAgain.current();
  }, [deviceId, stop]);

  return { capturing, error, start, stop };
}
