import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent, Word } from '../../server/src/events';
import { Offer } from './offer/Offer';
import { offerReducer } from './offer/offerState';
import { useManualKey } from './audio/useManualKey';
import { useMic } from './audio/useMic';
import { useVoice } from './audio/useVoice';
import { useSocket } from './socket/useSocket';
import { speechSupported, useSpeech } from './speech/useSpeech';
import { SENSITIVITIES, savedSensitivity, type Sensitivity } from './settings/sensitivity';
import { ControlPill } from './ui/ControlPill';
import { DevTools } from './ui/DevTools';
import { desktop, useCommands } from './ui/desktop';
import { levelStore } from './ui/levelStore';
import { sessionMode } from './ui/sessionState';
import { modifierLabel } from './ui/commands';
import { useSessionClock } from './ui/useSessionClock';

const MAX_WORDS = 60;
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const text = (words: Word[]) => words.map((w) => w.text).join(' ');

export function App() {
  const [offer, dispatch] = useReducer(offerReducer, null);
  const [heard, setHeard] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);
  const [partial, setPartial] = useState('');
  const [briefSent, setBriefSent] = useState<string | null>(null);
  // The saved choice, or null so the server's own defaults apply. The settings popover changes it.
  const [sensitivity] = useState<Sensitivity | null>(savedSensitivity);
  const [guesserDown, setGuesserDown] = useState(false);

  // Who recognises speech: the server (Deepgram, audio streamed from here) or this browser.
  const [stt, setStt] = useState<'deepgram' | 'browser'>('browser');
  const [notice, setNotice] = useState('');
  const sttRef = useRef(stt);

  const onServerEvent = useCallback((e: ServerEvent) => {
    dispatch(e);
    if (e.type === 'guesser.status') setGuesserDown(!e.ok);
    else if (e.type === 'session.ready') {
      if (sttRef.current === 'deepgram' && e.stt === 'browser') {
        setNotice('Switched to this browser\u2019s speech recognition.');
      }
      sttRef.current = e.stt;
      setStt(e.stt);
    } else if (e.type === 'transcript.partial') setPartial(text(e.words));
    else if (e.type === 'transcript.final') {
      setPartial('');
      setHeard((h) => [...h, ...e.words.map((w) => w.text)].slice(-MAX_WORDS));
    }
  }, []);
  const { status, send, sendBinary } = useSocket(onServerEvent);
  const mic = useMic(sendBinary);

  // A dropped connection ends the server session, so its guesser problem is forgotten too.
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status !== 'connected') setGuesserDown(false);
  }

  const sendPartial = useCallback(
    (words: Word[]) => {
      setPartial(text(words));
      send({ type: 'transcript.partial', words });
    },
    [send],
  );
  const sendFinal = useCallback(
    (words: Word[]) => {
      setPartial('');
      setHeard((h) => [...h, ...words.map((w) => w.text)].slice(-MAX_WORDS));
      send({ type: 'transcript.final', words });
    },
    [send],
  );
  const speech = useSpeech({ onPartial: sendPartial, onFinal: sendFinal, debug: DEBUG });
  const { trace } = speech;

  // One Start/Pause for both ways of listening. `wanted` is what the user asked for.
  const wanted = useRef(false);
  const { start: startSpeech, stop: stopSpeech } = speech;
  const { start: startMic, stop: stopMic } = mic;
  const listening = stt === 'deepgram' ? mic.capturing : speech.listening;
  const error = stt === 'deepgram' ? mic.error : speech.error;
  useVoice(
    listening,
    (voiced, atMs) => send({ type: 'voice.activity', voiced, atMs }),
    levelStore.set,
  );
  useManualKey(listening, () => send({ type: 'stuck.manual' }));
  const canListen = stt === 'deepgram' || speechSupported;

  const startListening = () => {
    wanted.current = true;
    setNotice('');
    if (stt === 'deepgram') void startMic();
    else startSpeech();
  };
  const pauseListening = () => {
    wanted.current = false;
    stopSpeech();
    stopMic();
  };
  // The server can switch the speech recognition (e.g. Deepgram fails): carry on listening.
  useEffect(() => {
    if (!wanted.current) return;
    if (stt === 'deepgram') {
      stopSpeech();
      void startMic();
    } else {
      stopMic();
      startSpeech();
    }
  }, [stt, startSpeech, stopSpeech, startMic, stopMic]);

  const downloadTrace = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(trace(), null, 1)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'speech-trace.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // The brief is session state on the server: send it again after a reconnect.
  useEffect(() => {
    if (status === 'connected' && briefSent !== null) {
      send({ type: 'session.brief', text: briefSent } satisfies ClientEvent);
    }
  }, [status, briefSent, send]);

  useEffect(() => {
    if (status === 'connected' && sensitivity !== null) {
      const { pauseMs, minConfidence } = SENSITIVITIES[sensitivity];
      send({ type: 'session.settings', pauseMs, minConfidence } satisfies ClientEvent);
    }
  }, [status, sensitivity, send]);

  const clearOffer = useCallback(() => dispatch({ type: 'offer.clear' }), []);

  const clock = useSessionClock(listening);
  const { reset: resetClock } = clock;
  const newConversation = useCallback(() => {
    resetClock();
    setHeard([]);
    setPartial('');
    clearOffer();
  }, [resetClock, clearOffer]);

  useCommands((command) => {
    if (command === 'toggle-visible') setVisible((v) => !v);
    else if (command === 'toggle-listening') (listening ? pauseListening : startListening)();
    else if (command === 'manual') {
      if (listening) send({ type: 'stuck.manual' });
    } else newConversation();
  });

  // Tell the desktop app whether the mic is live (for its tray menu), and how tall the overlay
  // is, so its window fits the pill and the card.
  useEffect(() => desktop?.report({ listening }), [listening]);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = overlay.current;
    const bridge = desktop;
    if (!el || !bridge) return;
    const observer = new ResizeObserver(() => bridge.setHeight(Math.ceil(el.offsetHeight)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const noteState = [
    !canListen && 'This browser has no speech recognition. Use Chrome or Edge.',
    error,
  ].filter((m): m is string => Boolean(m));

  return (
    <>
      <p role="status" className="sr-only">
        Server: {status}
      </p>

      {visible && (
        <div className="overlay" ref={overlay}>
          <ControlPill
            listening={listening}
            canListen={canListen}
            elapsedMs={clock.elapsedMs}
            mode={sessionMode(briefSent)}
            modifier={modifierLabel(navigator.platform)}
            onToggleListening={listening ? pauseListening : startListening}
            onNewConversation={newConversation}
          />

          {noteState.map((m) => (
            <p key={m} role="alert" className="overlay-note overlay-note-error glass">
              {m}
            </p>
          ))}
          <p role="status" className="overlay-note glass">
            {listening && status !== 'connected'
              ? 'Listening paused: not connected to the server, so no word suggestions'
              : notice}
          </p>
          <p role="status" className="overlay-note glass">
            {guesserDown ? 'Word suggestions are unavailable right now; listening continues.' : ''}
          </p>

          <div className="card-slot">
            <Offer
              offer={offer}
              onClear={clearOffer}
              onPick={(id, word) => send({ type: 'guess.picked', id, word })}
            />
          </div>
        </div>
      )}

      {DEBUG && (
        <DevTools
          heard={heard.join(' ')}
          partial={partial}
          onBrief={setBriefSent}
          sendPartial={sendPartial}
          sendFinal={sendFinal}
          onDownloadTrace={downloadTrace}
        />
      )}
    </>
  );
}
