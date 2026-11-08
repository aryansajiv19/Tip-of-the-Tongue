import { useEffect } from 'react';
import type { ServerEvent } from '../../../server/src/events';
import { DebugPanel } from './DebugPanel';
import { DEBUG_CHANNEL } from './channel';
import { debugBus } from './debugBus';

// The developer view (?view=debug): hidden unless opened on purpose, and a window of its own
// in the desktop app. It shows what the main window forwards while Debug is on in Settings.
export function DebugView() {
  useEffect(() => {
    const channel = new BroadcastChannel(DEBUG_CHANNEL);
    channel.onmessage = (m: MessageEvent<ServerEvent>) => {
      if (m.data.type === 'debug') debugBus.push(m.data);
    };
    return () => channel.close();
  }, []);

  return (
    <main className="debug-view">
      <p>Waiting for the main window. Turn on Debug in its Settings.</p>
      <DebugPanel />
    </main>
  );
}
