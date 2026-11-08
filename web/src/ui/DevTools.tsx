import { useRef, useState } from 'react';
import type { Word } from '../../../server/src/events';
import { DebugPanel } from '../debug/DebugPanel';
import { stampWords } from '../speech/stampWords';
import { TYPED_FINAL_DELAY_MS, typedSteps } from '../speech/typedWords';
import './devTools.css';

interface Props {
  heard: string;
  partial: string;
  onBrief: (text: string) => void;
  sendPartial: (words: Word[]) => void;
  sendFinal: (words: Word[]) => void;
  onDownloadTrace: () => void;
}

// Developer tools, shown only with ?debug=1: what was heard, the meeting brief, and a
// way to type "speech" without a microphone. The overlay itself is only the pill and the card.
export function DevTools(p: Props) {
  const [brief, setBrief] = useState('');
  const [typed, setTyped] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Words arrive 300 ms apart, then ~1 s of silence, then a final (as Chrome does).
  const playTyped = () => {
    timers.current.forEach(clearTimeout);
    let prev: Word[] = [];
    const steps = typedSteps(typed);
    const lastMs = steps.at(-1)?.delayMs ?? 0;
    timers.current = steps.map(({ transcript, delayMs }) =>
      setTimeout(() => {
        prev = stampWords(prev, transcript, Date.now());
        p.sendPartial(prev);
      }, delayMs),
    );
    timers.current.push(setTimeout(() => p.sendFinal(prev), lastMs + TYPED_FINAL_DELAY_MS));
    setTyped('');
  };

  return (
    <div className="devtools">
      <h1>Developer tools</h1>

      <section aria-labelledby="tx-h">
        <h2 id="tx-h">Transcript</h2>
        <p>
          {p.heard}
          {p.partial && <em> {p.partial}</em>}
        </p>
        <button type="button" onClick={p.onDownloadTrace}>
          Download speech trace
        </button>
      </section>

      <section>
        <label htmlFor="brief">Meeting brief: agenda, names, product or client terms</label>
        <textarea
          id="brief"
          rows={4}
          maxLength={50_000}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <button type="button" onClick={() => p.onBrief(brief)}>
          Use this brief
        </button>
      </section>

      <section>
        <label htmlFor="typed">Type a phrase; it is sent as speech, one word every 300 ms</label>
        <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="button" onClick={playTyped} disabled={!typed.trim()}>
          Send as speech
        </button>
      </section>

      <DebugPanel />
    </div>
  );
}
