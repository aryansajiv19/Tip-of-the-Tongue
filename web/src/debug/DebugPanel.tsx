import { useEffect, useState, useSyncExternalStore } from 'react';
import { debugBus } from './debugBus';
import { formatDebug } from './format';
import './debug.css';

// Developer view (?debug=1): what the server heard, decided and asked for. Shows spoken text, so
// it is off unless the page is opened with ?debug=1.
export function DebugPanel() {
  const s = useSyncExternalStore(debugBus.subscribe, debugBus.snapshot);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const silence = s.lastWordAt === null ? null : now - s.lastWordAt;

  return (
    <details className="debug-panel" open>
      <summary>Debug</summary>
      <p>
        silence since last word:{' '}
        <strong>{silence === null ? '-' : `${(silence / 1000).toFixed(1)} s`}</strong>
        {' | '}
        {s.stt ? `${s.stt.mode}, ${s.stt.keyterms.length} keyterms` : 'stt: unknown'}
      </p>
      {s.stt && s.stt.keyterms.length > 0 && <p>keyterms: {s.stt.keyterms.join(', ')}</p>}
      <p>
        raw transcript (fillers kept): {s.heard.join(' ')} <em>{s.partial}</em>
      </p>
      <ol aria-label="Last debug events">
        {s.events.map((e, i) => (
          <li key={`${e.atMs}-${i}`}>
            {new Date(e.atMs).toLocaleTimeString([], { hour12: false })} {formatDebug(e.info)}
          </li>
        ))}
      </ol>
    </details>
  );
}
