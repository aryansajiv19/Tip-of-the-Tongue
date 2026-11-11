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
  // How long after a word ended its transcript reached the session's client, over the track.
  transcriptLag: { atMs: number; lagMs: number }[];
  // The voice number the session settled on as the user's, if it chose one.
  chosen: number | undefined;
  // The voice number on the last word of each interim result, and who was really talking.
  partials: { role: 'me' | 'other'; speaker?: number }[];
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

const quantile = (xs: number[], p: number): number =>
  [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) * p)] ?? 0;

// Wall time of each transcript minus the end of its last word: the delay of audio, Deepgram and
// the server together. A figure that climbs along the track means audio is piling up somewhere.
export function lagSummary(runs: Pick<LiveRun, 'transcriptLag'>[]): string {
  const all = runs.flatMap((r) => r.transcriptLag.map((l) => l.lagMs));
  if (all.length === 0) return 'No transcripts arrived.';
  const slope = runs.map((r) => {
    const lags = r.transcriptLag.map((l) => l.lagMs);
    const half = Math.floor(lags.length / 2);
    return quantile(lags.slice(half), 0.5) - quantile(lags.slice(0, half), 0.5);
  });
  return `Transcript delay (arrival minus end of the last word), ${all.length} transcripts: p50 ${quantile(all, 0.5)} ms, p95 ${quantile(all, 0.95)} ms, max ${Math.max(...all)} ms. Second half of each conversation minus its first half (median): worst ${Math.max(...slope)} ms.`;
}

// What the session sees while someone is mid-sentence: how often an interim result's last word
// carries the user's voice number when the user was talking, and when somebody else was.
export function partialSummary(runs: Pick<LiveRun, 'partials' | 'labels'>[]): string {
  const share = (role: 'me' | 'other') => {
    let asUser = 0;
    let none = 0;
    let total = 0;
    for (const r of runs) {
      for (const p of r.partials.filter((q) => q.role === role)) {
        total++;
        if (p.speaker === undefined) none++;
        else if (p.speaker === r.labels.userLabel) asUser++;
      }
    }
    return { asUser, none, total };
  };
  const me = share('me');
  const other = share('other');
  const pct = (n: number, t: number) => (t === 0 ? 'n/a' : `${Math.round((n / t) * 100)}%`);
  return `Interim results (voice number on the last word): while the user talks, ${pct(me.asUser, me.total)} carry the user's number and ${pct(me.none, me.total)} none (${me.total}); while others talk, ${pct(other.asUser, other.total)} carry the user's number and ${pct(other.none, other.total)} none (${other.total}).`;
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
    lagSummary(runs),
    '',
    partialSummary(runs),
    '',
    '## Failures',
    '',
    ...(f.length > 0 ? f : ['None.']),
    '',
    'Synthetic voices reading scripted text, not real speech. Not tested with people with aphasia.',
    '',
  ].join('\n');
}
