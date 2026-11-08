// The five waveform bars: each is a share of the full height, from the mic level.
const SHAPE = [0.55, 0.85, 1, 0.85, 0.55];
const MIN = 0.14; // a quiet bar is a small dot, never invisible
const FULL_LEVEL = 0.08; // RMS at which the middle bar is full height

export const BAR_COUNT = SHAPE.length;

// `level` is the RMS of the microphone signal, 0 to 1. Paused shows resting bars.
export function barHeights(level: number, listening: boolean): number[] {
  const scaled = listening ? Math.min(1, Math.max(0, level) / FULL_LEVEL) : 0;
  return SHAPE.map((s) => MIN + (1 - MIN) * s * scaled);
}
