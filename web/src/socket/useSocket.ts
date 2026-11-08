import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent } from '../../../server/src/events';
import { DEBUG_CHANNEL } from '../debug/channel';
import { backoffMs, parseServerEvent } from './protocol';

const MAX_BUFFERED_BYTES = 256 * 1024;

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting';

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
    const channel = new BroadcastChannel(DEBUG_CHANNEL);

    const connect = () => {
      const socket = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      );
      ws.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setStatus('connected');
        if (debugRef.current) {
          socket.send(JSON.stringify({ type: 'session.debug', on: true } satisfies ClientEvent));
        }
      };
      socket.onmessage = (m: MessageEvent<unknown>) => {
        const event = parseServerEvent(m.data);
        if (event?.type === 'debug') channel.postMessage(event);
        else if (event) handler.current(event);
      };
      socket.onclose = () => {
        if (closed) return;
        setStatus('reconnecting');
        timer = setTimeout(connect, backoffMs(attempt++));
      };
    };
    connect();

    return () => {
      closed = true;
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
