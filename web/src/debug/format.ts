import type { DebugInfo } from '../../../server/src/events';

const ms = (n: number) => `${Math.round(n)}ms`;

// One short line per debug event, for the panel.
export function formatDebug(info: DebugInfo): string {
  switch (info.kind) {
    case 'detector':
      return info.stuck
        ? `detector: STUCK ${info.reason ?? ''} silence ${ms(info.silenceMs)} since ${Math.round(info.sinceMs ?? 0)}`
        : `detector: not stuck, silence ${ms(info.silenceMs)}`;
    case 'guess': {
      const words = info.candidates.map((c) => `${c.word} ${c.confidence.toFixed(2)}`).join(', ');
      const how = `${info.speculative ? 'early' : 'confirmed'}${info.stale ? ', stale' : ''}`;
      const result = info.error ? 'ERROR' : info.abstain ? 'abstain' : words;
      return `guess (${how}): ${result} in ${ms(info.latencyMs)}`;
    }
    case 'gate':
      return info.offered
        ? `gate: OFFER ${(info.words ?? []).join(', ')}`
        : `gate: silent (${info.reason ?? 'unknown'})`;
    case 'stt':
      return `stt: ${info.mode}, ${info.keyterms.length} keyterms`;
    case 'transcript':
      return `heard: ${info.text}`;
  }
}
