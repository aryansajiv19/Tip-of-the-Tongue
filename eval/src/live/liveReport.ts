import type { DebugInfo } from '../../../server/src/events.js';
import { wilson, type Rate } from '../metrics.js';
import type { ScenarioScore } from '../score.js';
import { summarize } from '../score.js';
import type { PlacedLine } from '../layout.js';
import type { Offer } from '../replay.js';
import { speakerChanges, type LabelStats } from './track.js';

export interface LiveRun {
  voice: string;
  otherVoice: string;
  score: ScenarioScore;
  placed: PlacedLine[];
  offers: Offer[];
  labels: LabelStats;
  // Words as the recogniser returned them, and the session's debug events, both on the audio
  // track's clock.
  words: { text: string; startMs: number; endMs: number; speaker?: number }[];
  trace: { atMs: number; info: DebugInfo }[];
  // The voice number the session settled on as the user's, if it chose one.
  chosen: number | undefined;
}

export type PickResult = 'right' | 'wrong' | 'none';

export function voicePick(run: Pick<LiveRun, 'chosen' | 'labels'>): PickResult {
  if (run.chosen === undefined || run.labels.userLabel === undefined) return 'none';
  return run.chosen === run.labels.userLabel ? 'right' : 'wrong';
}

const pct = ({ hits, total }: Rate): string =>
  total === 0 ? 'n/a' : `${Math.round((hits / total) * 100)}% (${hits}/${total})`;
const withCi = (r: Rate): string => {
  const ci = wilson(r);
  return ci ? `${pct(r)} [${Math.round(ci.low * 100)}-${Math.round(ci.high * 100)}%]` : pct(r);
};
const ms = (n: number | undefined): string => (n === undefined ? 'n/a' : `${Math.round(n)} ms`);

function row(name: string, runs: LiveRun[]): string {
  const s = summarize(runs.map((r) => r.score));
  const picks = runs.map(voicePick);
  const words = runs.reduce((n, r) => n + r.labels.words, 0);
  const right = runs.reduce((n, r) => n + r.labels.right, 0);
  return `| ${name} | ${runs.length} | ${s.stalls} | ${withCi(s.correct)} | ${s.wrong} | ${s.missed} | ${pct(s.fluent)} | ${pct(s.other)} | ${picks.filter((p) => p === 'right').length}/${runs.length} | ${pct({ hits: right, total: words })} | ${ms(s.silenceP50)} / ${ms(s.silenceP95)} |`;
}

// What went wrong, with what the recogniser heard on that line.
function failures(runs: LiveRun[]): string[] {
  const out: string[] = [];
  for (const run of runs) {
    const tag = `${run.score.id} (${run.score.type}, ${run.voice})`;
    const shown = (i: number) =>
      run.offers
        .filter((o) => o.line === i)
        .map((o) => o.candidates.map((c) => `${c.word} ${c.confidence.toFixed(2)}`).join(', '))
        .join(' | ') || 'no pop-up';
    const heard = (i: number) => `\n  heard: "${run.labels.heard[i] ?? ''}"`;
    for (const st of run.score.stalls) {
      if (st.outcome === 'correct') continue;
      const line = run.placed[st.line]?.line;
      out.push(
        `- ${tag} ${st.outcome.toUpperCase()}: wanted "${line?.w}", got ${shown(st.line)}.${heard(st.line)}`,
      );
    }
    run.placed.forEach((p, i) => {
      const popped = run.offers.some((o) => o.line === i);
      if (!popped || (p.line.s === 'me' && p.line.w && !p.line.recover)) return;
      const what =
        p.line.s === 'other'
          ? 'ON OTHER SPEAKER'
          : p.line.recover
            ? 'DURING SELF-RECOVERY'
            : 'DURING FLUENT SPEECH';
      out.push(`- ${tag} ${what}: ${shown(i)}.${heard(i)}`);
    });
    if (voicePick(run) === 'wrong') {
      out.push(
        `- ${tag} VOICE PICK WRONG: chose ${run.chosen}, the user's words were labelled ${run.labels.userLabel}`,
      );
    }
  }
  return out;
}

// With one voice speaking: how often, and when, the recogniser gave its words a new speaker number.
function drift(runs: LiveRun[]): string[] {
  const rows = runs.map((r) => {
    const { labelled, counts, changes } = speakerChanges(r.words);
    const numbers = Object.entries(counts)
      .map(([n, c]) => `${n}: ${c}`)
      .join(', ');
    const when = changes
      .map((c) => `${c.from}→${c.to} at ${(c.atMs / 1000).toFixed(1)} s (word ${c.word})`)
      .join('; ');
    return {
      changed: changes.length > 0,
      line: `| ${r.score.id} ${r.voice} | ${labelled} | ${numbers || 'none'} | ${changes.length} | ${when || '-'} | ${r.chosen ?? 'none'} |`,
    };
  });
  return [
    '## Speaker numbers with one voice speaking',
    '',
    `${rows.filter((r) => r.changed).length} of ${runs.length} runs changed the speaker number at least once.`,
    '',
    '| Run | Words labelled | Number: words | Changes | Where | Number the session chose |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => r.line),
    '',
  ];
}

export function renderLiveReport(
  meta: { split: string; voices: string[]; solo?: boolean },
  runs: LiveRun[],
): string {
  const voices = [...new Set(runs.map((r) => r.voice))];
  const f = failures(runs);
  return [
    `# Live scenarios: spoken audio through real Deepgram and Claude, split ${meta.split}`,
    '',
    '| User voice | Convs | Stalls | Correct | Wrong | Missed | Pop-up in fluent lines | on the other speaker | Voice pick right | Label accuracy | End of speech to pop-up p50 / p95 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...voices.map((v) =>
      row(
        v,
        runs.filter((r) => r.voice === v),
      ),
    ),
    row('All', runs),
    '',
    'The other person is spoken by a contrasting voice. Label accuracy is the share of words labelled with their speaker\'s usual voice number. "End of speech to pop-up" is measured from the end of the last word before the pop-up.',
    '',
    ...(meta.solo ? drift(runs) : []),
    '## Failures',
    '',
    ...(f.length > 0 ? f : ['None.']),
    '',
    'Synthetic voices reading scripted text, not real speech. Not tested with people with aphasia.',
    '',
  ].join('\n');
}
