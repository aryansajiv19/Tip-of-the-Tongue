import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ServerEvent } from '../../../server/src/events';
import {
  ACCEPTED_MS,
  cardReducer,
  emptyCard,
  LINGER_MS,
  NONE_MS,
  THINKING_MAX_MS,
  type CardAction,
  type CardState,
} from './cardState';
import { createResetGate } from './resetGate';

const T0 = 10_000;
const server = (event: ServerEvent, nowMs = T0): CardAction => ({ type: 'server', event, nowMs });
const run = (actions: CardAction[], start: CardState = emptyCard) =>
  actions.reduce(cardReducer, start);

const offered = (id: string, words: [string, number][]): ServerEvent => ({
  type: 'guess.offered',
  id,
  latencyMs: 5,
  candidates: words.map(([word, confidence]) => ({ word, confidence })),
});
const stuck: ServerEvent = { type: 'stuck.detected', reason: 'pause', contextWindow: 'the' };

describe('cardReducer', () => {
  it('is empty until something happens', () => {
    expect(emptyCard.view).toBeNull();
  });

  it('thinks from a stall until an offer arrives, then shows the best word with up to two others', () => {
    const thinking = run([server(stuck)]);
    expect(thinking.view).toEqual({ kind: 'thinking' });
    const shown = run(
      [
        server(
          offered('a', [
            ['licence', 0.6],
            ['renewal', 0.9],
            ['contract', 0.7],
            ['fee', 0.2],
          ]),
          T0 + 800,
        ),
      ],
      thinking,
    );
    expect(shown.view).toMatchObject({ kind: 'offer', id: 'a', primary: { word: 'renewal' } });
    expect(shown.view?.kind === 'offer' && shown.view.alternatives.map((c) => c.word)).toEqual([
      'contract',
      'licence',
    ]);
  });

  it('an offer with no words changes nothing', () => {
    expect(run([server(offered('a', []))]).view).toBeNull();
    const thinking = run([server(stuck)]);
    expect(run([server(offered('a', []))], thinking)).toBe(thinking);
  });

  it('when the server says the guess went nowhere, a quiet "…" shows, then clears', () => {
    const none = run([server(stuck), server({ type: 'guess.idle' }, T0 + 1000)]);
    expect(none.view).toEqual({ kind: 'none' });
    expect(cardReducer(none, { type: 'tick', nowMs: T0 + 1000 + NONE_MS - 1 })).toBe(none);
    expect(cardReducer(none, { type: 'tick', nowMs: T0 + 1000 + NONE_MS }).view).toBeNull();
  });

  it('a new stall replaces the "…", and Escape clears it', () => {
    const none = run([server(stuck), server({ type: 'guess.idle' })]);
    expect(cardReducer(none, server(stuck, T0 + 500)).view).toEqual({ kind: 'thinking' });
    expect(cardReducer(none, { type: 'dismiss' }).view).toBeNull();
  });

  it('guess.idle does not remove a suggestion that is showing', () => {
    const s = run([server(offered('a', [['x', 0.9]])), server({ type: 'guess.idle' })]);
    expect(s.view?.kind).toBe('offer');
  });

  it('a stall while a suggestion is showing does not replace it', () => {
    const s = run([server(offered('a', [['x', 0.9]])), server(stuck)]);
    expect(s.view?.kind).toBe('offer');
  });

  it('offer then the word is spoken: a check mark with the spoken word, then gone', () => {
    const s = run([
      server(
        offered('a', [
          ['renewal', 0.9],
          ['licence', 0.7],
        ]),
      ),
      server({ type: 'guess.accepted', id: 'a', word: 'licence', afterMs: 700 }, T0 + 700),
    ]);
    expect(s.view).toEqual({ kind: 'accepted', word: 'licence' });
    expect(cardReducer(s, { type: 'tick', nowMs: T0 + 700 + ACCEPTED_MS - 1 }).view?.kind).toBe(
      'accepted',
    );
    expect(cardReducer(s, { type: 'tick', nowMs: T0 + 700 + ACCEPTED_MS }).view).toBeNull();
  });

  it('offer then pick: accepted at once, and the server echo changes nothing', () => {
    const s = run([
      server(offered('a', [['renewal', 0.9]])),
      { type: 'picked', word: 'renewal', nowMs: T0 + 300 },
    ]);
    expect(s.view).toEqual({ kind: 'accepted', word: 'renewal' });
    const echoed = cardReducer(
      s,
      server({ type: 'guess.accepted', id: 'a', word: 'renewal', afterMs: 300 }, T0 + 350),
    );
    expect(echoed).toBe(s); // the check mark's clock was not restarted
  });

  it('picking an alternative shows that word', () => {
    const s = run([
      server(
        offered('a', [
          ['renewal', 0.9],
          ['licence', 0.7],
        ]),
      ),
      { type: 'picked', word: 'licence', nowMs: T0 + 100 },
    ]);
    expect(s.view).toEqual({ kind: 'accepted', word: 'licence' });
  });

  it('picking with nothing showing does nothing', () => {
    expect(run([{ type: 'picked', word: 'x', nowMs: T0 }])).toBe(emptyCard);
  });

  it('a suggestion fades out on its own after the linger time', () => {
    const s = run([server(offered('a', [['x', 0.9]]))]);
    expect(cardReducer(s, { type: 'tick', nowMs: T0 + LINGER_MS - 1 })).toBe(s);
    expect(cardReducer(s, { type: 'tick', nowMs: T0 + LINGER_MS }).view).toBeNull();
  });

  it('a new offer replaces an old one and restarts the linger clock', () => {
    const s = run([
      server(offered('a', [['first', 0.9]])),
      server(offered('b', [['second', 0.8]]), T0 + 5000),
    ]);
    expect(s.view).toMatchObject({ id: 'b', primary: { word: 'second' } });
    expect(cardReducer(s, { type: 'tick', nowMs: T0 + 5000 + LINGER_MS - 1 }).view?.kind).toBe(
      'offer',
    );
  });

  it('events for another offer id are ignored', () => {
    const s = run([server(offered('a', [['x', 0.9]]))]);
    expect(cardReducer(s, server({ type: 'guess.expired', id: 'zzz' }))).toBe(s);
    expect(cardReducer(s, server({ type: 'guess.withdrawn', id: 'zzz', reason: 'timeout' }))).toBe(
      s,
    );
    expect(
      cardReducer(s, server({ type: 'guess.accepted', id: 'zzz', word: 'x', afterMs: 1 })),
    ).toBe(s);
  });

  it.each(['guess.expired', 'guess.withdrawn'] as const)('%s clears the matching offer', (type) => {
    const event: ServerEvent =
      type === 'guess.expired' ? { type, id: 'a' } : { type, id: 'a', reason: 'self-recovered' };
    expect(run([server(offered('a', [['x', 0.9]])), server(event)]).view).toBeNull();
  });

  it('thinking times out even if the server never says more', () => {
    const s = run([server(stuck)]);
    expect(cardReducer(s, { type: 'tick', nowMs: T0 + THINKING_MAX_MS - 1 })).toBe(s);
    const none = cardReducer(s, { type: 'tick', nowMs: T0 + THINKING_MAX_MS });
    expect(none).toEqual({ view: { kind: 'none' }, sinceMs: T0 + THINKING_MAX_MS });
    expect(
      cardReducer(none, { type: 'tick', nowMs: T0 + THINKING_MAX_MS + NONE_MS }).view,
    ).toBeNull();
  });

  it('dismiss closes a suggestion or thinking, but not the check mark', () => {
    expect(run([server(stuck), { type: 'dismiss' }]).view).toBeNull();
    expect(run([server(offered('a', [['x', 0.9]])), { type: 'dismiss' }]).view).toBeNull();
    const accepted = run([
      server(offered('a', [['x', 0.9]])),
      { type: 'picked', word: 'x', nowMs: T0 },
    ]);
    expect(cardReducer(accepted, { type: 'dismiss' })).toBe(accepted);
  });

  it('clear empties everything', () => {
    expect(run([server(offered('a', [['x', 0.9]])), { type: 'clear' }])).toBe(emptyCard);
  });

  it('ticks on an empty card and unrelated events change nothing', () => {
    expect(cardReducer(emptyCard, { type: 'tick', nowMs: T0 + 99_999 })).toBe(emptyCard);
    expect(cardReducer(emptyCard, server({ type: 'guesser.status', ok: false }))).toBe(emptyCard);
    expect(cardReducer(emptyCard, server({ type: 'guess.idle' }))).toBe(emptyCard);
  });
});

describe('a new conversation (reset gate + card)', () => {
  // Feeds server events through the gate into the card, like the app does.
  function app() {
    const gate = createResetGate();
    let card = emptyCard;
    return {
      gate,
      get view() {
        return card.view;
      },
      server(event: ServerEvent, nowMs = T0) {
        if (gate.pass(event)) card = cardReducer(card, { type: 'server', event, nowMs });
      },
      reset() {
        gate.reset();
        card = cardReducer(card, { type: 'clear' });
      },
    };
  }

  it('an offer that was already on its way is never shown', () => {
    const a = app();
    a.server(stuck);
    a.reset();
    a.server(offered('old', [['pharmacy', 0.9]])); // sent before the server saw the reset
    expect(a.view).toBeNull();
    a.server({ type: 'session.cleared' });
    expect(a.view).toBeNull();
  });

  it('a stall and offer after the server confirmed the reset do show', () => {
    const a = app();
    a.reset();
    a.server(stuck);
    a.server({ type: 'session.cleared' });
    expect(a.view).toBeNull();
    a.server(stuck);
    expect(a.view).toEqual({ kind: 'thinking' });
    a.server(offered('new', [['renewal', 0.9]]));
    expect(a.view).toMatchObject({ kind: 'offer', id: 'new' });
  });

  it('a reset with an offer open clears it at once', () => {
    const a = app();
    a.server(offered('a', [['x', 0.9]]));
    a.reset();
    expect(a.view).toBeNull();
  });

  it('a new connection stops waiting for an answer that will never come', () => {
    const a = app();
    a.reset();
    a.gate.connected();
    a.server(stuck);
    expect(a.view).toEqual({ kind: 'thinking' });
  });

  it('transcript words in flight are held back too', () => {
    const gate = createResetGate();
    gate.reset();
    const word = { text: 'old', startMs: 1, endMs: 2 };
    expect(gate.pass({ type: 'transcript.final', words: [word] })).toBe(false);
    gate.pass({ type: 'session.cleared' });
    expect(gate.pass({ type: 'transcript.final', words: [word] })).toBe(true);
  });
});

describe('design tokens', () => {
  it('the linger time matches --card-linger', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
    expect(css).toMatch(new RegExp(`--card-linger:\\s*${LINGER_MS / 1000}s`));
  });
});

describe('holding the card', () => {
  const shown = run([server(stuck), server(offered('a', [['renewal', 0.9]]))]);

  it('gives the waited time back, so the card outlives its linger while read', () => {
    const held = cardReducer(shown, { type: 'hold', byMs: LINGER_MS });
    const later = cardReducer(held, { type: 'tick', nowMs: T0 + LINGER_MS });
    expect(later.view?.kind).toBe('offer');
    expect(cardReducer(held, { type: 'tick', nowMs: T0 + 2 * LINGER_MS }).view).toBeNull();
  });

  it('does nothing without a card', () => {
    expect(cardReducer(emptyCard, { type: 'hold', byMs: 500 })).toBe(emptyCard);
  });
});
