import { groupBy, wilson, type Rate } from './metrics.js';
import type { PlacedLine } from './layout.js';
import type { Offer, Trace } from './replay.js';
import { summarize, type ScenarioScore, type TypeSummary } from './score.js';

const pct = ({ hits, total }: Rate): string =>
  total === 0 ? 'n/a' : `${Math.round((hits / total) * 100)}% (${hits}/${total})`;
const withCi = (r: Rate): string => {
  const ci = wilson(r);
  return ci ? `${pct(r)} [${Math.round(ci.low * 100)}-${Math.round(ci.high * 100)}%]` : pct(r);
};
const ms = (n: number | undefined): string => (n === undefined ? 'n/a' : `${Math.round(n)} ms`);

export interface ScenarioRun {
  score: ScenarioScore;
  placed: PlacedLine[];
  offers: Offer[];
  trace: Trace;
  // The voice the session took to be the user's (0 is right when voices are labelled).
  speaker: number | undefined;
  guessCalls: number;
}

function row(name: string, s: TypeSummary): string {
  return `| ${name} | ${s.scenarios} | ${s.stalls} | ${withCi(s.correct)} | ${pct(s.top1)} | ${s.wrong} | ${s.wrongShown} | ${s.missed} | ${pct(s.fluent)} | ${pct(s.selfRecovered)} | ${pct(s.other)} | ${ms(s.silenceP50)} / ${ms(s.silenceP95)} |`;
}

// Each offer whose top word carries a continuation, with the line it was for, to spot-check
// that none contradicts the context. The first entry is how many offers carry one.
function continuations(runs: ScenarioRun[]): string[] {
  const shown: string[] = [];
  let offers = 0;
  for (const { score, placed, offers: made } of runs)
    for (const o of made) {
      offers++;
      const top = o.candidates[0];
      if (top?.continuation)
        shown.push(
          `- ${score.id}: "${top.word}" + "${top.continuation}" for "${placed[o.line]?.line.t}"`,
        );
    }
  return [`${shown.length} of ${offers} offers carry a continuation.`, '', ...shown];
}

// What went wrong, line by line, so failures can be sorted into kinds.
function failures(runs: ScenarioRun[]): string[] {
  const out: string[] = [];
  for (const { score, placed, offers, trace } of runs) {
    const why = (i: number) => {
      const stuck = trace.stuck.filter((s) => s.line === i).map((s) => s.reason);
      const guesses = trace.guesses
        .filter((g) => g.line === i)
        .map(
          (g) => `${g.error ? 'ERROR' : g.abstain ? 'abstain' : g.words.join(', ')} (…${g.phrase})`,
        );
      return `\n  detector: ${stuck.length > 0 ? stuck.join(', ') : 'did not fire'}; guesses: ${guesses.join(' / ') || 'none'}`;
    };
    const show = (i: number) =>
      offers
        .filter((o) => o.line === i)
        .map((o) =>
          o.candidates
            .map(
              (c) =>
                `${c.word} ${c.confidence.toFixed(2)}${c.continuation ? ` [${c.continuation}]` : ''}`,
            )
            .join(', '),
        )
        .join(' | ') || 'no pop-up';
    for (const st of score.stalls) {
      if (st.outcome === 'correct') continue;
      const line = placed[st.line]?.line;
      out.push(
        `- ${score.id} (${score.type}) ${st.outcome.toUpperCase()}: wanted "${line?.w}", got ${show(st.line)}. "${line?.t}"${why(st.line)}`,
      );
    }
    placed.forEach((p, i) => {
      const popped = offers.some((o) => o.line === i);
      const wrongPopup = popped && !(p.line.s === 'me' && p.line.w && !p.line.recover);
      if (wrongPopup) {
        const what =
          p.line.s === 'other'
            ? 'ON OTHER SPEAKER'
            : p.line.recover
              ? 'DURING SELF-RECOVERY'
              : 'DURING FLUENT SPEECH';
        out.push(`- ${score.id} (${score.type}) ${what}: ${show(i)}. "${p.line.t}"${why(i)}`);
      }
    });
  }
  return out;
}

export function renderScenarioReport(
  meta: { guesser: string; split: string; model?: string; diarize?: boolean },
  runs: ScenarioRun[],
): string {
  const scores = runs.map((r) => r.score);
  const byType = [...groupBy(scores, (s) => s.type)].map(([t, ss]) => row(t, summarize(ss)));
  const calls = runs.reduce((n, r) => n + r.guessCalls, 0);
  const f = failures(runs);
  return [
    `# Scenarios: ${meta.guesser} guesser${meta.model ? ` (${meta.model})` : ''}, split ${meta.split}`,
    '',
    '| Type | Convs | Stalls | Correct | Top-1 | Wrong | Wrong shown | Missed | Pop-up in fluent lines | in self-recoveries | on the other speaker | Silence at pop-up p50 / p95 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...byType,
    row('All', summarize(scores)),
    '',
    `Guess calls: ${calls} for ${scores.length} conversations (including early guesses that were thrown away); ${runs.reduce((n, r) => n + r.trace.guesses.filter((g) => g.error).length, 0)} failed or timed out.`,
    '',
    ...(meta.diarize
      ? [
          `Voices labelled as a speaker separator would (the user is voice 0). The session took voice 0 to be the user in ${runs.filter((r) => r.speaker === 0).length} of ${runs.length} conversations${
            runs.filter((r) => r.speaker !== 0).length > 0
              ? ` (not in: ${runs
                  .filter((r) => r.speaker !== 0)
                  .map((r) => `${r.score.id} took ${r.speaker ?? 'nobody'}`)
                  .join(', ')})`
              : ''
          }.`,
          '',
        ]
      : []),
    '## Continuations',
    '',
    ...continuations(runs),
    '',
    '## Failures',
    '',
    ...(f.length > 0 ? f : ['None.']),
    '',
    'Scripted written conversations on a virtual clock, not real speech. Not tested with people with aphasia.',
    '',
  ].join('\n');
}
