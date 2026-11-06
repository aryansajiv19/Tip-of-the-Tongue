import { describe, expect, it } from 'vitest';
import { floatToInt16 } from './pcm';

describe('floatToInt16', () => {
  it('maps silence, full scale and the negative extreme', () => {
    expect([...floatToInt16(new Float32Array([0, 1, -1]))]).toEqual([0, 32767, -32768]);
  });

  it('scales in-between values and rounds', () => {
    expect([...floatToInt16(new Float32Array([0.5, -0.5]))]).toEqual([16384, -16384]);
  });

  it('clips values outside -1..1 instead of wrapping', () => {
    expect([...floatToInt16(new Float32Array([1.5, -3, 100]))]).toEqual([32767, -32768, 32767]);
  });

  it('treats NaN-free empty input and keeps the length', () => {
    expect(floatToInt16(new Float32Array(0)).length).toBe(0);
    expect(floatToInt16(new Float32Array(1600)).length).toBe(1600);
  });

  it('a sine wave keeps its sign pattern', () => {
    const sine = Float32Array.from({ length: 8 }, (_, n) => Math.sin((2 * Math.PI * n) / 8));
    expect([...floatToInt16(sine)].map(Math.sign)).toEqual(
      [0, 1, 1, 1, 0, -1, -1, -1].map((x) => x || 0),
    );
  });
});
