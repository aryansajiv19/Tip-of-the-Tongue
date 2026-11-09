import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { mockGuesser } from '../../../server/src/guess/mock.js';
import { ProfileSchema } from '../../../server/src/guess/profile.js';
import type { Scenario } from '../scenarios.js';
import { runLive } from './run.js';
import { installedVoices } from './say.js';

const canSpeak =
  process.platform === 'darwin' &&
  (await installedVoices().then(
    (v) => v.has('Daniel') && v.has('Samantha'),
    () => false,
  ));

// A stand-in for Deepgram that answers the audio with one scripted utterance by voice 1.
async function fakeDeepgram() {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  wss.on('connection', (socket) => {
    let sent = false;
    socket.on('message', (_data, isBinary) => {
      if (!isBinary || sent) return;
      sent = true;
      const word = (w: string, start: number) => ({
        word: w,
        punctuated_word: w,
        start,
        end: start + 0.25,
        confidence: 0.9,
        speaker: 1,
      });
      const words = ['the', 'place', 'where', 'you', 'get', 'medicine'].map((w, i) =>
        word(w, 0.6 + i * 0.4),
      );
      setTimeout(
        () =>
          socket.send(
            JSON.stringify({
              type: 'Results',
              is_final: true,
              channel: { alternatives: [{ words }] },
            }),
          ),
        3000,
      );
    });
  });
  const port = (wss.address() as AddressInfo).port;
  return { wss, connect: () => new WebSocket(`ws://127.0.0.1:${port}`) };
}

const servers: { close: () => void }[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

describe.skipIf(!canSpeak)('runLive, with a stand-in for Deepgram', () => {
  const sc: Scenario = {
    id: 't',
    type: 'x',
    split: 'dev',
    title: 't',
    lines: [{ s: 'me', t: 'the place where you get medicine', w: 'pharmacy' }],
  };

  it('speaks the line, streams it in real time and scores the pop-up on the right line', async () => {
    const dg = await fakeDeepgram();
    servers.push(dg.wss);
    const run = await runLive(sc, 'Daniel', 'Samantha', ProfileSchema.parse({}), false, {
      guess: mockGuesser,
      deepgram: { apiKey: 'k', language: 'en', connect: dg.connect },
    });
    expect(run.score.stalls.map((s) => s.outcome)).toEqual(['correct']);
    expect(run.offers).toHaveLength(1);
    expect(run.offers[0]?.line).toBe(0);
    // The pop-up comes after the line's speech ended.
    expect(run.offers[0]?.silenceMs).toBeGreaterThan(0);
    expect(run.labels.heard[0]).toContain('medicine');
    expect(run.chosen).toBe(1);
    expect(run.labels.userLabel).toBe(1);
  }, 60_000);
});
