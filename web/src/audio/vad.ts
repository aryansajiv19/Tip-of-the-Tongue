// Decides, from the microphone level alone, when the user starts and stops making sound.
// Pure: feed it one RMS reading at a time.

// A change needs to hold this long, so a click, a cough or a dip between syllables is ignored.
export const MIN_HOLD_MS = 150;
// Never treat anything quieter than this as sound, however quiet the room.
const MIN_ON = 0.02;
const MIN_OFF = 0.012;

export interface Vad {
  // Estimated background level.
  floor: number;
  voiced: boolean;
  // A change that has been seen but has not held long enough yet.
  pending?: { voiced: boolean; sinceMs: number };
}

export const initialVad: Vad = { floor: 0.01, voiced: false };

// Starting needs 3x the floor, carrying on needs only 1.8x (hysteresis), so a level hovering
// near one threshold can't flap.
const onLevel = (floor: number) => Math.max(MIN_ON, floor * 3);
const offLevel = (floor: number) => Math.max(MIN_OFF, floor * 1.8);

// The floor drops quickly and rises slowly. While voiced it rises slower still, and any dip below it
// snaps it back down. So speech (which has dips) is not learned as noise, but a steady
// noise that really starts is, after a few seconds.
function nextFloor(floor: number, rms: number, voiced: boolean, rising: boolean): number {
  if (rising) return floor; // a possible start of speech must not raise the floor
  const rate = rms < floor ? 0.3 : voiced ? 0.006 : 0.05;
  return floor + (rms - floor) * rate;
}

export function stepVad(
  vad: Vad,
  rms: number,
  nowMs: number,
): { vad: Vad; change?: { voiced: boolean; atMs: number } } {
  const level = Number.isFinite(rms) ? rms : 0;
  const wantVoiced = level > (vad.voiced ? offLevel(vad.floor) : onLevel(vad.floor));
  const floor = nextFloor(vad.floor, level, vad.voiced, wantVoiced !== vad.voiced);

  if (wantVoiced === vad.voiced) return { vad: { floor, voiced: vad.voiced } };

  const pending =
    vad.pending?.voiced === wantVoiced ? vad.pending : { voiced: wantVoiced, sinceMs: nowMs };
  if (nowMs - pending.sinceMs >= MIN_HOLD_MS) {
    // Report when the change began, not when it was confirmed.
    return {
      vad: { floor, voiced: wantVoiced },
      change: { voiced: wantVoiced, atMs: pending.sinceMs },
    };
  }
  return { vad: { floor, voiced: vad.voiced, pending } };
}
