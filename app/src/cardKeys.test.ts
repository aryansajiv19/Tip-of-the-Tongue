import { describe, expect, it } from 'vitest';
import { allCardShortcuts, parseCapture, wantedShortcuts } from './cardKeys';

const names = (c: { picks: number } | null, visible: boolean) =>
  wantedShortcuts(c, visible).map(([a]) => a);

describe('wantedShortcuts', () => {
  it('holds nothing without a card, or while the window is hidden', () => {
    expect(names(null, true)).toEqual([]);
    expect(names({ picks: 3 }, false)).toEqual([]);
  });

  it('holds only Esc while the card has nothing to pick yet', () => {
    expect(names({ picks: 0 }, true)).toEqual(['Escape']);
  });

  it('holds one key per suggestion, so Cmd+3 is free when only two are shown', () => {
    expect(names({ picks: 1 }, true)).toEqual(['Escape', 'CommandOrControl+1']);
    expect(names({ picks: 2 }, true)).toEqual([
      'Escape',
      'CommandOrControl+1',
      'CommandOrControl+2',
    ]);
    expect(names({ picks: 3 }, true)).toEqual(allCardShortcuts());
  });

  it('maps each shortcut to the key the page is told about', () => {
    expect(wantedShortcuts({ picks: 3 }, true).map(([, k]) => k)).toEqual(['escape', 1, 2, 3]);
  });
});

describe('parseCapture', () => {
  it('reads a pick count of 0 to 3, and null as "release"', () => {
    expect(parseCapture({ picks: 2 })).toEqual({ picks: 2 });
    expect(parseCapture({ picks: 0 })).toEqual({ picks: 0 });
    expect(parseCapture(null)).toBeNull();
  });

  it('ignores anything else, which must change nothing', () => {
    for (const bad of [
      undefined,
      true,
      false,
      'x',
      3,
      {},
      { picks: 4 },
      { picks: -1 },
      { picks: 1.5 },
      { picks: '2' },
      { picks: NaN },
      [],
    ]) {
      expect(parseCapture(bad)).toBeUndefined();
    }
  });
});
