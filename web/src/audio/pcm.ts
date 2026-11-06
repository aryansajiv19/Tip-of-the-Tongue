// Float samples (-1..1) to 16-bit signed PCM, the format Deepgram's linear16 expects.
// Out-of-range samples are clipped, not wrapped.
export function floatToInt16(input: Float32Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
  }
  return out;
}
