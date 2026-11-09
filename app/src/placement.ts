// Where the overlay window goes. Pure, so it can be tested without a screen.
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  bounds: Rect;
  // The usable part of the screen: without the menu bar, dock or taskbar.
  workArea: Rect;
}

export interface Size {
  width: number;
  height: number;
}

export const MARGIN = 16;

const contains = (r: Rect, p: { x: number; y: number }) =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

// Squared distance from a point to the nearest point of a rectangle (0 when inside).
function distance2(r: Rect, p: { x: number; y: number }): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width - 1));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height - 1));
  return dx * dx + dy * dy;
}

// The screen the user is working on: the one holding the cursor, or the closest one if the
// cursor is not on any (for example right after a display was unplugged).
export function activeDisplay(
  displays: readonly DisplayInfo[],
  cursor: { x: number; y: number },
): DisplayInfo | undefined {
  return (
    displays.find((d) => contains(d.bounds, cursor)) ??
    [...displays].sort((a, b) => distance2(a.bounds, cursor) - distance2(b.bounds, cursor))[0]
  );
}

// Top-right corner of the work area, `margin` in from the edges. A window wider than the
// work area is pinned to its left edge instead of sticking out.
export function topRight(workArea: Rect, size: Size, margin = MARGIN): { x: number; y: number } {
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - size.width - margin),
    y: workArea.y + margin,
  };
}

export function placeOverlay(
  displays: readonly DisplayInfo[],
  cursor: { x: number; y: number },
  size: Size,
  margin = MARGIN,
): { x: number; y: number } | undefined {
  const display = activeDisplay(displays, cursor);
  return display && topRight(display.workArea, size, margin);
}

// The window is as tall as the pill plus whatever is under it (card, drawer, settings), but
// never taller than the work area of its screen minus the margin above and below.
export const MIN_HEIGHT = 44;

export const maxHeight = (workArea: Rect, margin = MARGIN): number =>
  Math.max(MIN_HEIGHT, workArea.height - 2 * margin);

export function clampHeight(requested: unknown, max: number): number | undefined {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return undefined;
  return Math.min(max, Math.max(MIN_HEIGHT, Math.round(requested)));
}
