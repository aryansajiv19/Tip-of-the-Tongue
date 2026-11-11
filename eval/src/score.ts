import { normalizePhrase } from '../../server/src/gate/normalize.js';
import { groupBy, percentile, type Rate } from './metrics.js';
import { isStall, type PlacedLine } from './layout.js';
import type { Offer } from './replay.js';

export type StallOutcome = 'correct' | 'wrong' | 'miss';

export interface ScenarioScore {
  id: string;
  type: string;
  // One entry per moment where the user was reaching for a word.
  stalls: {
    line: number;
    outcome: StallOutcome;
    top1: boolean;
    // Pop-ups on this line that did not contain the word, even if a later one did.
    wrongShown: number;
    // How long the silence had lasted when the pop-up appeared, for a correct one.
    silenceMs?: number;
    // A missed stall whose right word came up in the first LATE_MS of the next line, when the other
    // person had begun to answer. Not counted as correct.
    late?: boolean;
  }[];
  // Lines where nothing should be offered, and how many of them got a pop-up.
  fluent: { lines: number; popups: number };
  selfRecovered: { lines: number; popups: number };
  other: { lines: number; popups: number };
}

// The right word counts as late, not missed, if it arrives this soon into the next line.
export const LATE_MS = 2000;

const key = (w: string) => normalizePhrase(w).join(' ');

// Marks every pop-up: right, wrong, or on a line where nothing should have appeared.
export function scoreScenario(
  id: string,
  type: string,
  placed: PlacedLine[],
  offers: Offer[],
): ScenarioScore {
  const byLine = groupBy(offers, (o) => String(o.line));
  const score: ScenarioScore = {
    id,
    type,
    stalls: [],
    fluent: { lines: 0, popups: 0 },
    selfRecovered: { lines: 0, popups: 0 },
    other: { lines: 0, popups: 0 },
  };
  placed.forEach(({ line }, i) => {
    const here = byLine.get(String(i)) ?? [];
    const popped = here.length > 0 ? 1 : 0;
    if (line.s === 'other') {
      score.other.lines++;
      score.other.popups += popped;
    } else if (isStall(line)) {
      const right = new Set((line.a ?? [line.w ?? '']).map(key));
      const hit = here.find((o) => o.candidates.some((c) => right.has(key(c.word))));
      const outcome: StallOutcome = hit ? 'correct' : here.length > 0 ? 'wrong' : 'miss';
      const next = placed[i + 1];
      const late =
        outcome === 'miss' &&
        next !== undefined &&
        (byLine.get(String(i + 1)) ?? []).some(
          (o) =>
            o.atMs - next.startMs <= LATE_MS && o.candidates.some((c) => right.has(key(c.word))),
        );
      score.stalls.push({
        line: i,
        outcome,
        top1: Boolean(hit && right.has(key(hit.candidates[0]?.word ?? ''))),
        wrongShown: here.filter((o) => !o.candidates.some((c) => right.has(key(c.word)))).length,
        ...(hit ? { silenceMs: hit.silenceMs } : {}),
        ...(late ? { late } : {}),
      });
    } else if (line.recover) {
      score.selfRecovered.lines++;
      score.selfRecovered.popups += popped;
    } else {
      score.fluent.lines++;
      score.fluent.popups += popped;
    }
  });
  return score;
}

export interface TypeSummary {
  scenarios: number;
  stalls: number;
  correct: Rate;
  top1: Rate;
  wrong: number;
  // Wrong pop-ups shown on stall lines, including ones followed by a right one.
  wrongShown: number;
  missed: number;
  // Of the missed, the right word came up as the next speaker began (see `late`).
  late: number;
  fluent: Rate;
  selfRecovered: Rate;
  other: Rate;
  silenceP50: number | undefined;
  silenceP95: number | undefined;
}

// Lines, not pop-ups: a line counts once however many pop-ups it got.
export function summarize(scores: ScenarioScore[]): TypeSummary {
  const stalls = scores.flatMap((s) => s.stalls);
  const sum = (pick: (s: ScenarioScore) => { lines: number; popups: number }): Rate => ({
    hits: scores.reduce((n, s) => n + pick(s).popups, 0),
    total: scores.reduce((n, s) => n + pick(s).lines, 0),
  });
  const silences = stalls.flatMap((s) => (s.silenceMs === undefined ? [] : [s.silenceMs]));
  return {
    scenarios: scores.length,
    stalls: stalls.length,
    correct: { hits: stalls.filter((s) => s.outcome === 'correct').length, total: stalls.length },
    top1: { hits: stalls.filter((s) => s.top1).length, total: stalls.length },
    wrong: stalls.filter((s) => s.outcome === 'wrong').length,
    wrongShown: stalls.reduce((n, s) => n + s.wrongShown, 0),
    missed: stalls.filter((s) => s.outcome === 'miss').length,
    late: stalls.filter((s) => s.late).length,
    fluent: sum((s) => s.fluent),
    selfRecovered: sum((s) => s.selfRecovered),
    other: sum((s) => s.other),
    silenceP50: percentile(silences, 50),
    silenceP95: percentile(silences, 95),
  };
}
