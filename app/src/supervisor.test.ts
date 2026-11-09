import { describe, expect, it } from 'vitest';
import { createSupervisor } from './supervisor';

function setup(stableMs = 1000) {
  let t = 0;
  const exits: Array<(code: number | null) => void> = [];
  const killed: number[] = [];
  const failures: string[] = [];
  const sup = createSupervisor({
    launch: (onExit) => {
      const id = exits.push(onExit) - 1;
      return { kill: () => killed.push(id) };
    },
    onFail: (r) => failures.push(r),
    now: () => t,
    stableMs,
  });
  return { sup, exits, killed, failures, advance: (ms: number) => (t += ms) };
}

describe('supervisor', () => {
  it('restarts once after an unexpected exit, then reports failure on the second', () => {
    const s = setup();
    s.sup.start();
    s.exits[0]?.(1);
    expect(s.exits).toHaveLength(2);
    expect(s.failures).toEqual([]);
    s.exits[1]?.(1);
    expect(s.exits).toHaveLength(2);
    expect(s.failures).toHaveLength(1);
    expect(s.failures[0]).toMatch(/stopped twice.*1/);
  });

  it('a server that ran stably before dying gets its restart back', () => {
    const s = setup(1000);
    s.sup.start();
    s.advance(500);
    s.exits[0]?.(1);
    s.advance(2000);
    s.exits[1]?.(1);
    expect(s.exits).toHaveLength(3);
    expect(s.failures).toEqual([]);
  });

  it('a deliberate restart kills the old one, ignores its exit and is not a failure', () => {
    const s = setup();
    s.sup.start();
    s.sup.restart();
    expect(s.killed).toEqual([0]);
    s.exits[0]?.(null);
    expect(s.exits).toHaveLength(2);
    s.exits[1]?.(1);
    expect(s.failures).toEqual([]);
    expect(s.exits).toHaveLength(3);
  });

  it('stop ends everything: a later exit neither restarts nor fails', () => {
    const s = setup();
    s.sup.start();
    s.sup.stop();
    s.exits[0]?.(0);
    expect(s.exits).toHaveLength(1);
    expect(s.failures).toEqual([]);
  });

  it('retry after a failure starts again with the restart available', () => {
    const s = setup();
    s.sup.start();
    s.exits[0]?.(1);
    s.exits[1]?.(1);
    expect(s.failures).toHaveLength(1);
    s.sup.retry();
    expect(s.exits).toHaveLength(3);
    s.exits[2]?.(1);
    expect(s.exits).toHaveLength(4);
    expect(s.failures).toHaveLength(1);
  });
});
