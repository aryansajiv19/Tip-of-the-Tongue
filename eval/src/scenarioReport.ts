import { groupBy, wilson, type Rate } from './metrics.js';
import type { PlacedLine } from './layout.js';
import type { Offer } from './replay.js';
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
  guessCalls: number;
}

function row(name: string, s: TypeSummary): string {
  return `| ${name} | ${s.scenarios} | ${s.stalls} | ${withCi(s.correct)} | ${pct(s.top1)} | ${s.wrong} | ${s.missed} | ${pct(s.fluent)} | ${pct(s.selfRecovered)} | ${pct(s.other)} | ${ms(s.silenceP50)} / ${ms(s.silenceP95)} |`;
}

// What went wrong, line by line, so failures can be sorted into kinds.
function failures(runs: ScenarioRun[]): string[] {
  const out: string[] = [];
  for (const { score, placed, offers } of runs) {
    const show = (i: number) =>
      offers
        .filter((o) => o.line === i)
        .map((o) => o.candidates.map((c) => `${c.word} ${c.confidence.toFixed(2)}`).join(', '))
        .join(' | ') || 'no pop-up';
    for (const st of score.stalls) {
      if (st.outcome === 'correct') continue;
      const line = placed[st.line]?.line;
      out.push(
        `- ${score.id} (${score.type}) ${st.outcome.toUpperCase()}: wanted "${line?.w}", got ${show(st.line)}. "${line?.t}"`,
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
        out.push(`- ${score.id} (${score.type}) ${what}: ${show(i)}. "${p.line.t}"`);
      }
    });
  }
  return out;
}

export function renderScenarioReport(
  meta: { guesser: string; split: string; model?: string },
  runs: ScenarioRun[],
): string {
  const scores = runs.map((r) => r.score);
  const byType = [...groupBy(scores, (s) => s.type)].map(([t, ss]) => row(t, summarize(ss)));
  const calls = runs.reduce((n, r) => n + r.guessCalls, 0);
  const f = failures(runs);
  return [
    `# Scenarios: ${meta.guesser} guesser${meta.model ? ` (${meta.model})` : ''}, split ${meta.split}`,
    '',
    '| Type | Convs | Stalls | Correct | Top-1 | Wrong | Missed | Pop-up in fluent lines | in self-recoveries | on the other speaker | Silence at pop-up p50 / p95 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...byType,
    row('All', summarize(scores)),
    '',
    `Guess calls: ${calls} for ${scores.length} conversations (including early guesses that were thrown away).`,
    '',
    '## Failures',
    '',
    ...(f.length > 0 ? f : ['None.']),
    '',
    'Scripted written conversations on a virtual clock, not real speech. Not tested with people with aphasia.',
    '',
  ].join('\n');
}
