import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

// The overlay floats over whatever is on the desktop, so text must hold up on the brightest
// backdrops: white paper, a yellow note, a light gradient.
const BACKDROPS = { white: [255, 255, 255], yellow: [250, 232, 110], lightBlue: [190, 220, 255] };

const token = (name: string): string => {
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)?.[1];
  if (!value) throw new Error(`token --${name} missing`);
  return value.trim();
};

const hex = (value: string): number[] => {
  const digits = /^#([0-9a-f]{6})/i.exec(value)?.[1];
  if (!digits) throw new Error(`not a hex colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
};

const luminance = (rgb: number[]): number => {
  const [r = 0, g = 0, b = 0] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (fg: number[], bg: number[]): number => {
  const [hi = 0, lo = 0] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

const surface = (backdrop: number[]): number[] => {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(token('surface-bg'));
  if (!m) throw new Error('--surface-bg is not rgba()');
  const alpha = Number(m[4]);
  return backdrop.map((b, i) => Number(m[i + 1]) * alpha + b * (1 - alpha));
};

describe('text contrast on the glass', () => {
  for (const [name, backdrop] of Object.entries(BACKDROPS)) {
    it.each(['text', 'text-muted', 'error', 'accent'])(
      `--%s is at least 4.5:1 over a ${name} backdrop`,
      (t) => expect(ratio(hex(token(t)), surface(backdrop))).toBeGreaterThanOrEqual(4.5),
    );
  }
});
