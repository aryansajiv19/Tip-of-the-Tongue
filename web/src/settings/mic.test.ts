import { afterEach, describe, expect, it, vi } from 'vitest';
import { micOptions, saveMicId, savedMicId } from './mic';

const dev = (kind: MediaDeviceKind, deviceId: string, label = '') => ({ kind, deviceId, label });

describe('micOptions', () => {
  it('lists only microphones, without the default and communications aliases', () => {
    const options = micOptions([
      dev('audioinput', 'default', 'Default - MacBook Mic'),
      dev('audioinput', 'communications', 'Communications'),
      dev('audioinput', 'a1', 'MacBook Pro Microphone'),
      dev('audiooutput', 'o1', 'Speakers'),
      dev('videoinput', 'v1', 'Camera'),
      dev('audioinput', 'b2', 'USB Headset'),
    ]);
    expect(options).toEqual([
      { id: 'a1', label: 'MacBook Pro Microphone' },
      { id: 'b2', label: 'USB Headset' },
    ]);
  });

  it('names devices whose label is hidden until permission is given', () => {
    expect(
      micOptions([dev('audioinput', 'a'), dev('audioinput', 'b')]).map((o) => o.label),
    ).toEqual(['Microphone 1', 'Microphone 2']);
  });

  it('is empty when there is no microphone', () => {
    expect(micOptions([])).toEqual([]);
    expect(micOptions([dev('audiooutput', 'o')])).toEqual([]);
  });
});

describe('saved microphone', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage() {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
  }

  it('is null until a choice is saved, then remembered, then cleared by null', () => {
    stubStorage();
    expect(savedMicId()).toBeNull();
    saveMicId('abc');
    expect(savedMicId()).toBe('abc');
    saveMicId(null);
    expect(savedMicId()).toBeNull();
  });

  it('survives storage that throws (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(savedMicId()).toBeNull();
    expect(() => saveMicId('x')).not.toThrow();
    expect(() => saveMicId(null)).not.toThrow();
  });
});
