import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent } from '../../../server/src/events';
import { DEBUG_CHANNEL } from '../debug/channel';
import { backoffMs, parseServerEvent, silentFor } from './protocol';

const MAX_BUFFERED_BYTES = 256 * 1024;
// Held by the one tab that is listening; a second tab would open a second microphone and double
// the Claude calls.
const OTHER_TAB_NOTICE_MS = 500;
const HEARTBEAT_CHECK_MS = 15_000;
const LOCK = 'tip-of-the-tongue-listening';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'other-tab';

// One WebSocket to /ws that reconnects with backoff. Sends while disconnected are dropped.
export function useSocket(onEvent: (e: ServerEvent) => void, debugOn: boolean) {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const ws = useRef<WebSocket | null>(null);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  const debugRef = useRef(debugOn);

  useEffect(() => {
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let lastHeardMs = Date.now();
    let release: (() => void) | undefined;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    const channel = new BroadcastChannel(DEBUG_CHANNEL);

    const connect = () => {
      const socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      );
      ws.current = socket;
      lastHeardMs = Date.now();
      socket.onopen = () => {
        attempt = 0;
        setStatus('connected');
        if (debugRef.current) {
          socket.send(JSON.stringify({ type: 'session.debug', on: true } satisfies ClientEvent));
        }
      };
      socket.onmessage = (m: MessageEvent<unknown>) => {
        lastHeardMs = Date.now();
        const event = parseServerEvent(m.data);
        if (event?.type === 'heartbeat') return;
        if (event?.type === 'debug') channel.postMessage(event);
        else if (event) handler.current(event);
      };
      const lost = () => {
        if (closed) return;
        setStatus('reconnecting');
        timer = setTimeout(connect, backoffMs(attempt++));
      };
      socket.onclose = lost;
      // A dead connection can take minutes to report itself: drop it and reconnect now.
      clearInterval(watchdog);
      watchdog = setInterval(() => {
        if (!silentFor(lastHeardMs, Date.now())) return;
        clearInterval(watchdog);
        socket.onclose = null;
        socket.close();
        lost();
      }, HEARTBEAT_CHECK_MS);
    };

    // Only one tab listens. Another tab waits here and takes over when the first one closes. The
    // notice waits a moment so that the same tab starting again (React strict mode) never shows it.
    const hold = () => {
      clearTimeout(notice);
      if (closed) return;
      connect();
      return new Promise<void>((resolve) => (release = resolve));
    };
    const notice = setTimeout(() => setStatus('other-tab'), OTHER_TAB_NOTICE_MS);
    if (navigator.locks) void navigator.locks.request(LOCK, hold);
    else hold();

    return () => {
      closed = true;
      clearTimeout(notice);
      release?.();
      clearInterval(watchdog);
      clearTimeout(timer);
      channel.close();
      ws.current?.close();
    };
  }, []);

  // Turn the server's debug stream on or off when the user flips the switch.
  useEffect(() => {
    debugRef.current = debugOn;
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'session.debug', on: debugOn } satisfies ClientEvent));
    }
  }, [debugOn]);

  const send = useCallback((event: ClientEvent) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(event));
  }, []);

  // Raw audio. Dropped when disconnected, or when the connection is so far behind that
  // sending more would only add delay.
  const sendBinary = useCallback((data: Int16Array<ArrayBuffer>) => {
    const socket = ws.current;
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < MAX_BUFFERED_BYTES) {
      socket.send(data);
    }
  }, []);

  return { status, send, sendBinary };
}
