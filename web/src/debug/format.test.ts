import { describe, expect, it } from 'vitest';
import { formatDebug } from './format';

describe('formatDebug', () => {
  it('says what the detector decided', () => {
    expect(formatDebug({ kind: 'detector', stuck: false, silenceMs: 420 })).toBe(
      'detector: not stuck, silence 420ms',
    );
    expect(
      formatDebug({
        kind: 'detector',
        stuck: true,
        reason: 'pause',
        silenceMs: 1600,
        sinceMs: 5000,
      }),
    ).toBe('detector: STUCK pause silence 1600ms since 5000');
  });

  it('shows candidates with confidence, and the way the guess ran', () => {
    const line = formatDebug({
      kind: 'guess',
      speculative: true,
      stale: false,
      candidates: [{ word: 'pharmacy', confidence: 0.85 }],
      abstain: false,
      error: false,
      latencyMs: 812,
    });
    expect(line).toBe('guess (early): pharmacy 0.85 in 812ms');
  });

  it('marks abstains, errors and stale guesses', () => {
    const base = { kind: 'guess' as const, speculative: false, candidates: [], latencyMs: 5 };
    expect(formatDebug({ ...base, stale: true, abstain: true, error: false })).toBe(
      'guess (confirmed, stale): abstain in 5ms',
    );
    expect(formatDebug({ ...base, stale: false, abstain: true, error: true })).toBe(
      'guess (confirmed): ERROR in 5ms',
    );
  });

  it('shows the gate decision and the reason it stayed silent', () => {
    expect(formatDebug({ kind: 'gate', offered: true, words: ['pharmacy', 'chemist'] })).toBe(
      'gate: OFFER pharmacy, chemist',
    );
    expect(formatDebug({ kind: 'gate', offered: false, reason: 'cooldown' })).toBe(
      'gate: silent (cooldown)',
    );
  });

  it('shows the speech-to-text setup', () => {
    expect(formatDebug({ kind: 'stt', mode: 'deepgram', keyterms: ['a', 'b'] })).toBe(
      'stt: deepgram, 2 keyterms',
    );
  });

  it('says which voice is taken to be the user and why', () => {
    expect(formatDebug({ kind: 'speaker', me: 1, why: 'accepted' })).toBe(
      'you are voice 1 (accepted)',
    );
  });
});
