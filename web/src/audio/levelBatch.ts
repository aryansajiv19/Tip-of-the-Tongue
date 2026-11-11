// Collects the microphone level readings (one every 50 ms) into groups for the server, which
// takes the loudest voice at the microphone to be the user's. A group says when its first reading
// was taken; the rest follow at 50 ms steps.
export function levelBatcher(
  send: (atMs: number, levels: number[]) => void,
  size = 10,
): (rms: number) => void {
  let atMs = 0;
  let levels: number[] = [];
  return (rms) => {
    if (levels.length === 0) atMs = Date.now();
    levels.push(rms);
    if (levels.length < size) return;
    send(atMs, levels);
    levels = [];
  };
}
