import { describe, expect, it } from 'vitest';
import { FIRST_RUN_LINE, LISTENING_LINE, heardLine, overlayLine } from './overlayLine';

const base = { listening: false, connection: 'connected', notice: '', firstRun: false } as const;

describe('overlayLine', () => {
  it('tells a new user what to do, until they have started once', () => {
    expect(overlayLine({ ...base, firstRun: true })).toBe(FIRST_RUN_LINE);
    expect(overlayLine(base)).toBe('');
  });

  it('says what listening means, once listening', () => {
    expect(overlayLine({ ...base, firstRun: true, listening: true })).toBe(LISTENING_LINE);
  });

  it('warns instead when listening without a server', () => {
    expect(overlayLine({ ...base, listening: true, connection: 'reconnecting' })).toMatch(
      /not connected/,
    );
  });

  it('shows a notice before the listening line', () => {
    expect(overlayLine({ ...base, listening: true, notice: 'Switched.' })).toBe('Switched.');
  });

  it('shows a notice before the first-run hint', () => {
    expect(overlayLine({ ...base, firstRun: true, notice: 'Switched.' })).toBe('Switched.');
  });
});

describe('heardLine', () => {
  it('is empty before anything is heard', () => {
    expect(heardLine([])).toBe('');
  });

  it('keeps only the last six words', () => {
    expect(heardLine('one two three four five six seven eight'.split(' '))).toBe(
      'Heard: three four five six seven eight',
    );
  });
});
