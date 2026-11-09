import { describe, expect, it } from 'vitest';
import {
  MIN_HEIGHT,
  activeDisplay,
  clampHeight,
  fitOnScreen,
  parseSavedPosition,
  maxHeight,
  placeOverlay,
  topRight,
  type DisplayInfo,
} from './placement';

const SIZE = { width: 340, height: 60 };
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

// A laptop screen with a 25 px menu bar, and a monitor to its right and one to its left.
const laptop: DisplayInfo = {
  id: 1,
  bounds: rect(0, 0, 1440, 900),
  workArea: rect(0, 25, 1440, 875),
};
const right: DisplayInfo = {
  id: 2,
  bounds: rect(1440, 0, 1920, 1080),
  workArea: rect(1440, 0, 1920, 1055),
};
const left: DisplayInfo = {
  id: 3,
  bounds: rect(-1280, -100, 1280, 1024),
  workArea: rect(-1280, -100, 1280, 1024),
};

describe('topRight', () => {
  it('puts the window 16 px in from the top and right of the work area', () => {
    expect(topRight(laptop.workArea, SIZE)).toEqual({ x: 1440 - 340 - 16, y: 25 + 16 });
  });

  it('follows a work area that does not start at the origin', () => {
    expect(topRight(right.workArea, SIZE)).toEqual({ x: 1440 + 1920 - 340 - 16, y: 16 });
    expect(topRight(left.workArea, SIZE)).toEqual({ x: -340 - 16, y: -100 + 16 });
  });

  it('takes a different margin', () => {
    expect(topRight(laptop.workArea, SIZE, 0)).toEqual({ x: 1100, y: 25 });
  });

  it('pins a window wider than the screen to its left edge', () => {
    expect(topRight(rect(10, 0, 300, 600), SIZE)).toEqual({ x: 10, y: 16 });
  });
});

describe('activeDisplay', () => {
  const all = [laptop, right, left];

  it('is the display holding the cursor', () => {
    expect(activeDisplay(all, { x: 700, y: 400 })?.id).toBe(1);
    expect(activeDisplay(all, { x: 2000, y: 500 })?.id).toBe(2);
    expect(activeDisplay(all, { x: -600, y: 0 })?.id).toBe(3);
  });

  it('counts the left and top edges as inside and the right and bottom edges as outside', () => {
    expect(activeDisplay(all, { x: 1440, y: 0 })?.id).toBe(2);
    expect(activeDisplay(all, { x: 1439, y: 899 })?.id).toBe(1);
    expect(activeDisplay(all, { x: 0, y: 900 })?.id).toBe(1); // below the laptop, nearest to it
  });

  it('falls back to the nearest display when the cursor is on none', () => {
    // The right monitor was unplugged: the cursor is where it used to be.
    expect(activeDisplay([laptop, left], { x: 2500, y: 300 })?.id).toBe(1);
    expect(activeDisplay([laptop, left], { x: -3000, y: 300 })?.id).toBe(3);
  });

  it('is undefined when there are no displays', () => {
    expect(activeDisplay([], { x: 0, y: 0 })).toBeUndefined();
  });
});

describe('placeOverlay', () => {
  it('uses the display with the cursor', () => {
    expect(placeOverlay([laptop, right], { x: 100, y: 100 }, SIZE)).toEqual({ x: 1084, y: 41 });
    expect(placeOverlay([laptop, right], { x: 3000, y: 100 }, SIZE)).toEqual({ x: 3004, y: 16 });
  });

  it('moves to the remaining display when one is removed', () => {
    const before = placeOverlay([laptop, right], { x: 3000, y: 100 }, SIZE);
    const after = placeOverlay([laptop], { x: 3000, y: 100 }, SIZE);
    expect(before).toEqual({ x: 3004, y: 16 });
    expect(after).toEqual({ x: 1084, y: 41 });
  });

  it('has nowhere to go without a display', () => {
    expect(placeOverlay([], { x: 0, y: 0 }, SIZE)).toBeUndefined();
  });
});

describe('clampHeight', () => {
  it('keeps a sane height as a whole number', () => {
    expect(clampHeight(120.4, 800)).toBe(120);
  });

  it('limits too small and too large heights', () => {
    expect(clampHeight(0, 800)).toBe(MIN_HEIGHT);
    expect(clampHeight(-5, 800)).toBe(MIN_HEIGHT);
    expect(clampHeight(100_000, 800)).toBe(800);
  });

  it('lets a drawer grow to the screen, not to a fixed 480', () => {
    expect(clampHeight(760, maxHeight(rect(0, 25, 1440, 875)))).toBe(760);
  });

  it('refuses anything that is not a finite number', () => {
    for (const bad of [NaN, Infinity, '120', null, undefined, {}]) {
      expect(clampHeight(bad, 800)).toBeUndefined();
    }
  });
});

describe('maxHeight', () => {
  it('is the work area minus the margin above and below', () => {
    expect(maxHeight(rect(0, 25, 1440, 875))).toBe(875 - 32);
  });

  it('is the work area of that screen, so a small screen gets a shorter window', () => {
    expect(maxHeight(rect(0, 25, 1280, 600))).toBe(568);
  });

  it('never goes below the pill, even on an absurdly small screen', () => {
    expect(maxHeight(rect(0, 0, 400, 20))).toBe(MIN_HEIGHT);
  });
});

describe('remembered position', () => {
  const left: DisplayInfo = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    workArea: { x: 0, y: 25, width: 1440, height: 875 },
  };
  const right: DisplayInfo = {
    id: 2,
    bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
  };
  const size = { width: 420, height: 100 };

  it('reads only two finite numbers', () => {
    expect(parseSavedPosition({ x: 10.4, y: 20 })).toEqual({ x: 10, y: 20 });
    for (const bad of [
      null,
      undefined,
      5,
      'x',
      {},
      { x: 1 },
      { x: '1', y: 2 },
      { x: NaN, y: 1 },
      { x: 1, y: Infinity },
    ]) {
      expect(parseSavedPosition(bad)).toBeUndefined();
    }
  });

  it('keeps a position that is on a screen', () => {
    expect(fitOnScreen({ x: 600, y: 300 }, size, [left, right])).toEqual({ x: 600, y: 300 });
    expect(fitOnScreen({ x: 1600, y: 200 }, size, [left, right])).toEqual({ x: 1600, y: 200 });
  });

  it('pulls a window that sticks out back inside its screen', () => {
    expect(fitOnScreen({ x: 1100, y: 10 }, size, [left, right])).toEqual({ x: 1020, y: 25 });
    expect(fitOnScreen({ x: 600, y: 700 }, { width: 420, height: 300 }, [left, right])).toEqual({
      x: 600,
      y: 600,
    });
  });

  it('gives up when the screen it was on is gone', () => {
    expect(fitOnScreen({ x: 2000, y: 300 }, size, [left])).toBeUndefined();
    expect(fitOnScreen({ x: 0, y: 0 }, size, [])).toBeUndefined();
    // Dragged so far off that its centre is outside every screen.
    expect(fitOnScreen({ x: 600, y: 880 }, size, [left])).toBeUndefined();
  });
});
