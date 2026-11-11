import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import { buildApp } from '../../../server/src/app.js';
import { config } from '../../../server/src/config.js';
import type { ServerEvent, Word } from '../../../server/src/events.js';
import { loadProfile } from '../../../server/src/guess/profile.js';
import { dataPath } from '../dataset.js';
import type { Offer } from '../replay.js';
import { scoreScenario } from '../score.js';
import { loadScenarios, type Scenario } from '../scenarios.js';
import { bandLimit, durationMs, FRAME_MS, mixAtSnr, scaleDb, toFrames } from './audio.js';
import { renderLiveReport, type LiveRun } from './liveReport.js';
import { BABBLE_VOICES, makeNoise, NOISE_KINDS, type NoiseKind } from './noise.js';
import { installedVoices, otherVoicesFor, renderLine, USER_VOICES } from './say.js';
import {
  buildTrack,
  labelStats,
  lineForTime,
  pausePoint,
  silenceBefore,
  TAIL_MS,
  trackTime,
  type Pause,
} from './track.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// How the audio is made: speaking speed in words per minute, and background noise at a level
// `snrDb` below the speech.
export interface AudioOpts {
  rate?: number;
  // Only the user's lines: one voice, so any change of speaker number is the recogniser's.
  solo?: boolean;
  noise?: { kind: NoiseKind; snrDb: number };
  // Where the other people are: `room` is across the room from the user's microphone (quieter),
  // `call` is their voices coming out of a speaker (quieter and band-limited).
  others?: 'room' | 'call';
}

// How many other people a conversation has (1 to 3).
const peopleBesidesUser = (sc: Scenario): number =>
  Math.max(1, ...sc.lines.map((l) => (l.s === 'other' ? (l.who ?? 1) : 0)));
export const othersOf = (sc: Scenario, user: string): string[] =>
  otherVoicesFor(user, peopleBesidesUser(sc));

// How much quieter the others are than the user, who is at the microphone.
const OTHERS_DB = -10;

async function renderScenario(
  sc: Scenario,
  userVoice: string,
  otherVoices: string[],
  { rate, noise, solo, others }: AudioOpts = {},
) {
  const pauseMs = sc.stallMs ?? 2000;
  const lines = [];
  for (const line of solo ? sc.lines.filter((l) => l.s === 'me') : sc.lines) {
    const voice = line.s === 'me' ? userVoice : (otherVoices[(line.who ?? 1) - 1] ?? userVoice);
    const spoken = await renderLine(voice, line.t, pauseMs, rate);
    const far = line.s === 'other' && others !== undefined;
    const heard = !far
      ? spoken
      : scaleDb(others === 'call' ? bandLimit(spoken) : spoken, OTHERS_DB);
    lines.push({ line, pcm: heard });
  }
  const track = buildTrack(lines, sc.othersFirst);
  if (!noise) return track;
  const bed = await makeNoise(noise.kind, durationMs(track.pcm));
  return { ...track, pcm: mixAtSnr(track.pcm, bed, noise.snrDb) };
}

// Sends the audio the way the page does: a 100 ms frame each 100 ms, sent when its audio has
// ended. With `pauseAtMs`, sending stops there for 4.5 s (longer than the server's 3 s idle limit,
// so Deepgram's stream closes and a new one opens when sending resumes), as when listening is
// paused and started again. Returns when the stream began, on both clocks, and the pause.
const PAUSE_LEN_MS = 4500;

async function stream(
  ws: WebSocket,
  pcm: Buffer,
  pauseAtMs?: number,
): Promise<{ perfMs: number; epochMs: number; pause?: Pause }> {
  const start = { perfMs: performance.now(), epochMs: Date.now() };
  let pause: Pause | undefined;
  for (const [i, frame] of toFrames(pcm).entries()) {
    const wait = start.perfMs + (i + 1) * FRAME_MS + (pause?.lenMs ?? 0) - performance.now();
    if (wait > 0) await sleep(wait);
    ws.send(frame);
    if (pauseAtMs !== undefined && !pause && (i + 1) * FRAME_MS >= pauseAtMs) {
      pause = { atMs: (i + 1) * FRAME_MS, lenMs: PAUSE_LEN_MS };
    }
  }
  return { ...start, ...(pause ? { pause } : {}) };
}

export async function runLive(
  sc: Scenario,
  userVoice: string,
  otherVoices: string[],
  profile: Awaited<ReturnType<typeof loadProfile>>,
  pauseResume: boolean,
  // Replaces parts of the real server, for tests.
  appDeps: Parameters<typeof buildApp>[0] = {},
  audio: AudioOpts = {},
): Promise<LiveRun> {
  const { pcm, placed } = await renderScenario(sc, userVoice, otherVoices, audio);
  const app = await buildApp({ ...(sc.profile ? { profile } : {}), ...appDeps });
  try {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const events: { perfMs: number; event: ServerEvent }[] = [];
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      events.push({ perfMs: performance.now(), event: JSON.parse(data.toString()) as ServerEvent });
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    const ready = async () => {
      for (let i = 0; i < 50; i++) {
        const r = events.find((e) => e.event.type === 'session.ready');
        if (r) return r.event.type === 'session.ready' ? r.event.stt : undefined;
        await sleep(100);
      }
      return undefined;
    };
    if ((await ready()) !== 'deepgram')
      throw new Error('the server is not using Deepgram (set DEEPGRAM_API_KEY)');
    ws.send(JSON.stringify({ type: 'session.debug', on: true }));
    if (sc.brief) ws.send(JSON.stringify({ type: 'session.brief', text: sc.brief }));
    if (sc.settings?.pauseMs)
      ws.send(JSON.stringify({ type: 'session.settings', pauseMs: sc.settings.pauseMs }));

    const start = await stream(ws, pcm, pauseResume ? pausePoint(placed) : undefined);
    await sleep(1500);
    ws.close();

    const words: Word[] = events.flatMap(({ event }) =>
      event.type === 'transcript.final' ? event.words : [],
    );
    const onTrack = (serverMs: number) => trackTime(serverMs - start.epochMs, start.pause);
    const wordEnds = words.map((w) => onTrack(w.endMs));
    const offers: Offer[] = events.flatMap(({ perfMs, event }) => {
      if (event.type !== 'guess.offered') return [];
      const atMs = trackTime(perfMs - start.perfMs, start.pause);
      return [
        {
          atMs,
          candidates: event.candidates,
          line: lineForTime(placed, atMs),
          silenceMs: silenceBefore(wordEnds, atMs),
        },
      ];
    });
    // What the session reported about each moment, on the audio track's clock, for working out
    // why a stall was missed.
    const trace = events.flatMap(({ perfMs, event }) =>
      event.type === 'debug'
        ? [{ atMs: trackTime(perfMs - start.perfMs, start.pause), info: event.info }]
        : [],
    );
    // How late each transcript arrived: wall time of the event minus the end of its last word
    // (Deepgram's times are on the server's clock, the same machine's here).
    const transcriptLag = events.flatMap(({ perfMs, event }) => {
      if (event.type !== 'transcript.final' && event.type !== 'transcript.partial') return [];
      const last = event.words.at(-1);
      if (!last) return [];
      return [
        {
          atMs: trackTime(perfMs - start.perfMs, start.pause),
          lagMs: Math.round(start.epochMs + (perfMs - start.perfMs) - last.endMs),
        },
      ];
    });
    const chosen = events
      .flatMap(({ event }) =>
        event.type === 'debug' && event.info.kind === 'speaker' ? [event.info.me] : [],
      )
      .at(-1);
    return {
      voice: userVoice,
      otherVoice: otherVoices[0] ?? userVoice,
      score: scoreScenario(sc.id, sc.type, placed, offers),
      placed,
      offers,
      labels: labelStats(words, placed, onTrack),
      words: words.map((w, i) => ({
        text: w.text,
        startMs: onTrack(w.startMs),
        endMs: wordEnds[i] ?? 0,
        ...(w.speaker === undefined ? {} : { speaker: w.speaker }),
      })),
      trace,
      transcriptLag,
      chosen,
    };
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  process.env.LOG_LEVEL ??= 'warn';
  const { values } = parseArgs({
    options: {
      voices: { type: 'string', default: USER_VOICES.join(',') },
      split: { type: 'string', default: 'dev' },
      scenario: { type: 'string' },
      parallel: { type: 'string', default: '1' },
      'dry-run': { type: 'boolean', default: false },
      'pause-resume': { type: 'boolean', default: false },
      rate: { type: 'string' },
      noise: { type: 'string' },
      snr: { type: 'string', default: '10' },
      solo: { type: 'boolean', default: false },
      others: { type: 'string' },
    },
  });
  const split = values.split;
  if (split !== 'dev' && split !== 'holdout' && split !== 'all')
    throw new Error('--split must be dev, holdout or all');
  const rate = values.rate === undefined ? undefined : Number(values.rate);
  if (rate !== undefined && !(rate >= 50 && rate <= 500))
    throw new Error('--rate is words per minute, 50 to 500 (say speaks about 175)');
  const noiseKind = NOISE_KINDS.find((k) => k === values.noise);
  if (values.noise !== undefined && !noiseKind)
    throw new Error(`--noise must be one of ${NOISE_KINDS.join(', ')}`);
  const snrDb = Number(values.snr);
  if (!Number.isFinite(snrDb)) throw new Error('--snr is a number of dB, such as 10');
  const othersWhere = (['room', 'call'] as const).find((o) => o === values.others);
  if (values.others !== undefined && !othersWhere) throw new Error('--others must be room or call');
  const audio: AudioOpts = {
    ...(rate === undefined ? {} : { rate }),
    ...(noiseKind ? { noise: { kind: noiseKind, snrDb } } : {}),
    ...(values.solo ? { solo: true } : {}),
    ...(othersWhere ? { others: othersWhere } : {}),
  };
  const voices = values.voices
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const installed = await installedVoices();
  const wanted = values.scenario?.split(',').map((s) => s.trim());
  const scenarios = (await loadScenarios(split)).filter((s) => !wanted || wanted.includes(s.id));
  if (scenarios.length === 0) throw new Error('no scenarios match');

  for (const v of [
    ...voices,
    ...(values.solo ? [] : scenarios.flatMap((sc) => voices.flatMap((u) => othersOf(sc, u)))),
    ...(noiseKind === 'cafe' ? BABBLE_VOICES : []),
  ]) {
    if (!installed.has(v)) throw new Error(`the macOS voice "${v}" is not installed (say -v '?')`);
  }
  const jobs = scenarios.flatMap((sc) => voices.map((v) => ({ sc, voice: v })));
  if (values['dry-run']) {
    let total = 0;
    for (const { sc, voice } of jobs) {
      const { pcm } = await renderScenario(sc, voice, othersOf(sc, voice), audio);
      const s = (durationMs(pcm) - TAIL_MS) / 1000;
      total += s + TAIL_MS / 1000;
      console.log(
        `${sc.id} ${voice}/${othersOf(sc, voice).join('+')}: ${s.toFixed(0)} s of speech`,
      );
    }
    console.log(
      `A real run streams ${jobs.length} conversations in real time: about ${(total / 60).toFixed(1)} minutes.`,
    );
    return;
  }
  if (!config.deepgramApiKey || !config.anthropicApiKey) {
    throw new Error('needs DEEPGRAM_API_KEY and ANTHROPIC_API_KEY in the environment');
  }
  const profile = await loadProfile(dataPath('profiles/example.json'));
  const runs: LiveRun[] = [];
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: Math.max(1, Number(values.parallel)) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const startedAt = Date.now();
        const result = await runLive(
          job.sc,
          job.voice,
          othersOf(job.sc, job.voice),
          profile,
          values['pause-resume'],
          {},
          audio,
        );
        runs.push(result);
        console.error(
          `${job.sc.id} ${job.voice} done in ${Math.round((Date.now() - startedAt) / 1000)} s`,
        );
      }
    }),
  );
  runs.sort((a, b) => a.voice.localeCompare(b.voice) || a.score.id.localeCompare(b.score.id));

  const md = renderLiveReport({ split, voices, solo: values.solo }, runs);
  const outDir = fileURLToPath(new URL('../../../eval-results/', import.meta.url));
  await mkdir(outDir, { recursive: true });
  const tag = [
    `live-scenarios-${split}`,
    values['pause-resume'] ? 'pause' : '',
    rate === undefined ? '' : `rate${rate}`,
    othersWhere ?? '',
    noiseKind ? `${noiseKind}${snrDb}dB` : '',
    values.solo ? 'solo' : '',
  ]
    .filter(Boolean)
    .join('-');
  await writeFile(
    `${outDir}${tag}.json`,
    `${JSON.stringify(
      runs.map((r) => ({
        voice: r.voice,
        score: r.score,
        offers: r.offers,
        labels: r.labels,
        chosen: r.chosen,
        words: r.words,
        trace: r.trace,
        transcriptLag: r.transcriptLag,
        lines: r.placed.map((p) => ({ s: p.line.s, startMs: p.startMs, endMs: p.endMs })),
      })),
      null,
      2,
    )}\n`,
  );
  await writeFile(`${outDir}${tag}.md`, md);
  console.log(md);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
