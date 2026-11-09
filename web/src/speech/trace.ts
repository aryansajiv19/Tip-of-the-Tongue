// The debug trace keeps the latest entries only, so a long session does not grow without limit.
export const MAX_TRACE_ENTRIES = 500;

export function pushTrace<T>(trace: T[], entry: T): void {
  trace.push(entry);
  if (trace.length > MAX_TRACE_ENTRIES) trace.splice(0, trace.length - MAX_TRACE_ENTRIES);
}
