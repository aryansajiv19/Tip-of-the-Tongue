import { useEffect, useState } from 'react';
import type { ServerEvent } from '../../server/src/events';

type Status = 'connecting' | 'connected' | 'disconnected';

export function App() {
  const [status, setStatus] = useState<Status>('connecting');
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    );
    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onmessage = (e: MessageEvent<string>) => setLastEvent(JSON.parse(e.data) as ServerEvent);
    return () => ws.close();
  }, []);

  return (
    <main>
      <h1>Tip of the Tongue</h1>
      <p role="status">Server: {status}</p>
      {lastEvent && <pre>{JSON.stringify(lastEvent, null, 2)}</pre>}
    </main>
  );
}
