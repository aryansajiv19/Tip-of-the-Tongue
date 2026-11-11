import { describe, expect, it } from 'vitest';
import { scoreScenario } from '../score.js';
import { lagSummary, renderLiveReport, voicePick, type LiveRun } from './liveReport.js';

const labels = (userLabel: number | undefined) => ({
  userLabel,
  otherLabel: undefined,
  words: 0,
  right: 0,
  heard: [],
});

describe('voicePick', () => {
  it("is right when the chosen voice number is the number the user's words were given", () => {
    expect(voicePick({ chosen: 1, labels: labels(1) })).toBe('right');
  });
  it('is wrong when they differ', () => {
    expect(voicePick({ chosen: 0, labels: labels(1) })).toBe('wrong');
  });
  it("is none when nothing was chosen or the user's words were never labelled", () => {
    expect(voicePick({ chosen: undefined, labels: labels(1) })).toBe('none');
    expect(voicePick({ chosen: 0, labels: labels(undefined) })).toBe('none');
  });
});

describe('renderLiveReport with one voice', () => {
  it('lists where the speaker number changed', () => {
    const run = {
      voice: 'Daniel',
      otherVoice: 'Samantha',
      score: scoreScenario('s01', 'sales', [], []),
      placed: [],
      offers: [],
      labels: labels(0),
      words: [
        { text: 'a', startMs: 100, endMs: 200, speaker: 0 },
        { text: 'b', startMs: 41_200, endMs: 41_300, speaker: 1 },
      ],
      trace: [],
      transcriptLag: [],
      chosen: 0,
    } as unknown as LiveRun;
    const md = renderLiveReport({ split: 'dev', voices: ['Daniel'], solo: true }, [run]);
    expect(md).toContain('1 of 1 runs changed the speaker number');
    expect(md).toContain('0→1 at 41.2 s (word 1)');
  });
});

describe('lagSummary', () => {
  const lag = (...lagMs: number[]) => ({
    transcriptLag: lagMs.map((l, i) => ({ atMs: i, lagMs: l })),
  });
  it('gives the spread of the delay and how far the second half of a run sits above the first', () => {
    const s = lagSummary([lag(300, 400, 500, 900, 1000, 1100)]);
    expect(s).toContain('6 transcripts: p50 500 ms, p95 1000 ms, max 1100 ms');
    expect(s).toContain('worst 600 ms');
  });
  it('says so when nothing arrived', () => {
    expect(lagSummary([lag()])).toBe('No transcripts arrived.');
  });
});
