import { useEffect, useRef } from 'react';
import { initialVad, stepVad } from './vad';

const FRAME_MS = 50; // 20 readings a second

// While `active`, watches the microphone level and calls `onChange` when the user starts or
// stops making sound. It opens its own stream so it also works when the browser does the speech
// recognition (which keeps its microphone to itself). If the microphone can't be opened it
// stays quiet and the server falls back to words only.
export function useVoice(
  active: boolean,
  onChange: (voiced: boolean, atMs: number) => void,
  // Called with the signal strength (RMS, 0 to 1) on every reading, for the waveform.
  onLevel?: (level: number) => void,
) {
  const handler = useRef(onChange);
  const levelHandler = useRef(onLevel);
  useEffect(() => {
    handler.current = onChange;
    levelHandler.current = onLevel;
  });

  useEffect(() => {
    if (!active) return;
    let stop: () => void = () => undefined;
    let cancelled = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
        });
        const ctx = new AudioContext();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
          return;
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        let vad = initialVad;

        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const s of samples) sum += s * s;
          const rms = Math.sqrt(sum / samples.length);
          levelHandler.current?.(rms);
          const step = stepVad(vad, rms, Date.now());
          vad = step.vad;
          if (step.change) handler.current(step.change.voiced, step.change.atMs);
        }, FRAME_MS);

        stop = () => {
          clearInterval(timer);
          levelHandler.current?.(0);
          // Don't leave the server thinking the user is still talking.
          if (vad.voiced) handler.current(false, Date.now());
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
        };
      } catch {
        // No microphone level: words alone still work.
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);
}
