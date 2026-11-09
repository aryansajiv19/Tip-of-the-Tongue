export interface Launched {
  kill(): void;
}

export interface SupervisorOptions {
  // Starts the server; calls `onExit` if it stops by itself.
  launch(onExit: (code: number | null) => void): Launched;
  // Called when the server stopped and will not be restarted.
  onFail(reason: string): void;
  now?: () => number;
  // A server that ran this long before stopping does not count against the one restart.
  stableMs?: number;
}

// Keeps the server running: if it stops unexpectedly, starts it once more; if it stops again
// soon after, reports failure. Deliberate restarts and stops are not failures.
export function createSupervisor(options: SupervisorOptions) {
  const { launch, onFail, now = Date.now, stableMs = 5 * 60_000 } = options;
  let child: Launched | undefined;
  let startedAt = 0;
  let restarted = false;
  // Exits of a process that was replaced or stopped on purpose are ignored.
  let generation = 0;

  const start = () => {
    const mine = ++generation;
    startedAt = now();
    child = launch((code) => {
      if (mine !== generation) return;
      child = undefined;
      if (now() - startedAt >= stableMs) restarted = false;
      if (restarted) {
        onFail(`The server stopped twice in a row (exit code ${code ?? 'unknown'}).`);
        return;
      }
      restarted = true;
      start();
    });
  };

  return {
    start,
    // "Retry" after a failure: a fresh start with the one restart available again.
    retry() {
      restarted = false;
      this.restart();
    },
    // New environment (for example new keys): not a failure.
    restart() {
      generation++;
      child?.kill();
      start();
    },
    stop() {
      generation++;
      child?.kill();
      child = undefined;
    },
  };
}
