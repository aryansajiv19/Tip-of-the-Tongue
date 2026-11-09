import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ClientEvent, ServerEvent, Word } from '../../server/src/events';
import { HelpQuestion } from './ui/HelpQuestion';
import { SettingsGear, SettingsPanel } from './ui/Settings';
import { SuggestionCard } from './ui/SuggestionCard';
import { cardReducer, emptyCard } from './ui/cardState';
import { statusLine } from './ui/cardView';
import { heardLine, overlayLine } from './ui/overlayLine';
import { createResetGate } from './ui/resetGate';
import { useCardClock } from './ui/useCardClock';
import { saveDebug, savedDebug } from './settings/debug';
import { isFirstRun, markStarted } from './settings/firstRun';
import { saveHelp, savedHelp, type HelpLevel } from './settings/help';
import { saveMicId, savedMicId } from './settings/mic';
import { useManualKey } from './audio/useManualKey';
import { useMic } from './audio/useMic';
import { useVoice } from './audio/useVoice';
import { useSocket } from './socket/useSocket';
import { speechSupported, useSpeech } from './speech/useSpeech';
import {
  SENSITIVITIES,
  saveSensitivity,
  savedSensitivity,
  type Sensitivity,
} from './settings/sensitivity';
import { aboutYou } from './settings/aboutYou';
import { useSendAboutYou } from './settings/useAboutYou';
import { ControlPill } from './ui/ControlPill';
import { DevTools } from './ui/DevTools';
import { PrepDrawer } from './ui/PrepDrawer';
import { desktop, useCommands } from './ui/desktop';
import { levelStore } from './ui/levelStore';
import { healthMessage } from './audio/inputHealth';
import { useInputHealth } from './audio/useInputHealth';
import { contextLabel } from './ui/sessionState';
import { modifierLabel } from './ui/commands';
import { useSessionClock } from './ui/useSessionClock';

const MAX_WORDS = 60;
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

const text = (words: Word[]) => words.map((w) => w.text).join(' ');

export function App() {
  const [card, dispatchCard] = useReducer(cardReducer, emptyCard);
  const gate = useRef(createResetGate()).current;
  const [micId, setMicId] = useState<string | null>(savedMicId);
  const [debugOn, setDebugOn] = useState(() => DEBUG && savedDebug());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [heard, setHeard] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);
  const [partial, setPartial] = useState('');
  // The meeting brief: pasted (developer tools) or read from a dropped file (`source`).
  const [brief, setBrief] = useState<{ text: string; source?: string } | null>(null);
  const [briefTerms, setBriefTerms] = useState<string[]>([]);
  const [prepOpen, setPrepOpen] = useState(false);
  // The saved choice, or null so the server's own defaults apply until the user picks one.
  const [sensitivity, setSensitivity] = useState<Sensitivity | null>(savedSensitivity);
  const [guesserDown, setGuesserDown] = useState(false);
  const [firstRun, setFirstRun] = useState(isFirstRun);
  // How the user wants to be helped; null until they have been asked (the whole word shows).
  const [help, setHelp] = useState<HelpLevel | null>(savedHelp);
  // The suggestion whose words the user has asked to see, under "first sound" help.
  const [revealedId, setRevealedId] = useState<string | null>(null);

  // Who recognises speech: the server (Deepgram, audio streamed from here) or this browser.
  const [stt, setStt] = useState<'deepgram' | 'browser'>('browser');
  const [notice, setNotice] = useState('');
  const sttRef = useRef(stt);
  // Words arriving, for the check that the microphone and the words agree (set below).
  const wordsArrived = useRef<() => void>(() => undefined);

  const onServerEvent = useCallback(
    (e: ServerEvent) => {
      if (e.type === 'guesser.status') return setGuesserDown(!e.ok);
      if (e.type === 'brief.terms') return setBriefTerms(e.terms);
      if (e.type === 'guess.accepted') aboutYou.remember(e.word);
      if (e.type === 'session.ready') {
        // A new connection is a new server session.
        gate.connected();
        dispatchCard({ type: 'clear' });
        if (sttRef.current === 'deepgram' && e.stt === 'browser') {
          setNotice('Switched to this browser\u2019s speech recognition.');
        }
        sttRef.current = e.stt;
        return setStt(e.stt);
      }
      // Anything the server sent before it answered a reset belongs to the old conversation.
      if (!gate.pass(e)) return;
      dispatchCard({ type: 'server', event: e, nowMs: Date.now() });
      if (e.type === 'transcript.partial' || e.type === 'transcript.final') wordsArrived.current();
      if (e.type === 'transcript.partial') setPartial(text(e.words));
      else if (e.type === 'transcript.final') {
        setPartial('');
        setHeard((h) => [...h, ...e.words.map((w) => w.text)].slice(-MAX_WORDS));
      }
    },
    [gate],
  );
  const { status, send, sendBinary } = useSocket(onServerEvent, debugOn);
  const mic = useMic(sendBinary, micId);
  useSendAboutYou(status, send);

  // A dropped connection ends the server session, so its guesser problem is forgotten too.
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status !== 'connected') setGuesserDown(false);
  }

  const sendPartial = useCallback(
    (words: Word[]) => {
      wordsArrived.current();
      setPartial(text(words));
      send({ type: 'transcript.partial', words });
    },
    [send],
  );
  const sendFinal = useCallback(
    (words: Word[]) => {
      wordsArrived.current();
      setPartial('');
      setHeard((h) => [...h, ...words.map((w) => w.text)].slice(-MAX_WORDS));
      send({ type: 'transcript.final', words });
    },
    [send],
  );
  const speech = useSpeech({ onPartial: sendPartial, onFinal: sendFinal, debug: DEBUG || debugOn });
  const { trace } = speech;

  // One Start/Pause for both ways of listening. `wanted` is what the user asked for.
  const wanted = useRef(false);
  const { start: startSpeech, stop: stopSpeech } = speech;
  const { start: startMic, stop: stopMic } = mic;
  const listening = stt === 'deepgram' ? mic.capturing : speech.listening;
  const error = stt === 'deepgram' ? mic.error : speech.error;
  const input = useInputHealth(listening);
  useEffect(() => {
    wordsArrived.current = input.words;
  }, [input.words]);
  useVoice(
    listening,
    (voiced, atMs) => send({ type: 'voice.activity', voiced, atMs }),
    (rms) => {
      levelStore.set(rms);
      input.level(rms);
    },
    micId,
  );
  useManualKey(listening, () => send({ type: 'stuck.manual' }));
  const canListen = stt === 'deepgram' || speechSupported;

  const startListening = () => {
    wanted.current = true;
    setNotice('');
    markStarted();
    setFirstRun(false);
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
    if (status === 'connected' && brief !== null) {
      send({
        type: 'session.brief',
        text: brief.text,
        ...(brief.source ? { source: brief.source } : {}),
      } satisfies ClientEvent);
    }
  }, [status, brief, send]);

  useEffect(() => {
    if (status === 'connected' && sensitivity !== null) {
      const { pauseMs, minConfidence } = SENSITIVITIES[sensitivity];
      send({ type: 'session.settings', pauseMs, minConfidence } satisfies ClientEvent);
    }
  }, [status, sensitivity, send]);

  const dismissCard = useCallback(() => dispatchCard({ type: 'dismiss' }), []);
  useCardClock(card.view !== null, dispatchCard);
  const problem = statusLine({ connection: status, guesserDown });

  const changeHelp = (level: HelpLevel) => {
    setHelp(level);
    saveHelp(level);
  };
  const offerId = card.view?.kind === 'offer' ? card.view.id : null;
  const masked = help === 'sound' && offerId !== null && offerId !== revealedId;
  const revealCard = () => setRevealedId(offerId);
  useEffect(() => {
    if (status === 'connected' && help !== null) send({ type: 'session.help', level: help });
  }, [status, help, send]);

  const changeSensitivity = (value: Sensitivity) => {
    setSensitivity(value);
    saveSensitivity(value);
  };
  const changeMic = (id: string | null) => {
    setMicId(id);
    saveMicId(id);
  };
  const changeDebug = (on: boolean) => {
    setDebugOn(on);
    saveDebug(on);
  };
  const openDebugView = () =>
    window.open('/?view=debug', 'tott-debug', 'popup,width=480,height=720');

  const clock = useSessionClock(listening);
  const { reset: resetClock } = clock;
  const { reset: resetSpeech } = speech;
  // A new conversation: forget what was heard here and on the server. The brief and settings stay.
  // The server answers with session.cleared; until then nothing it sends is shown.
  const newConversation = useCallback(() => {
    resetClock();
    gate.reset();
    dispatchCard({ type: 'clear' });
    setHeard([]);
    setPartial('');
    resetSpeech();
    send({ type: 'session.reset' });
  }, [resetClock, gate, resetSpeech, send]);

  useCommands((command) => {
    if (command === 'toggle-visible') setVisible((v) => !v);
    else if (command === 'toggle-listening') (listening ? pauseListening : startListening)();
    else if (command === 'manual') {
      // Under "first sound" help the key shows the whole word before it asks for another.
      if (masked) revealCard();
      else if (listening) send({ type: 'stuck.manual' });
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

  const partialWords = partial ? partial.split(' ') : [];
  const noteState = [
    !canListen && 'This browser has no speech recognition. Use Chrome or Edge.',
  ].filter((m): m is string => Boolean(m));

  return (
    <>
      <p role="status" className="sr-only">
        Server: {status}
      </p>

      {visible && (
        <div className="overlay" ref={overlay}>
          <ControlPill
            askFirst={help === null}
            listening={listening}
            canListen={canListen}
            elapsedMs={clock.elapsedMs}
            contextLabel={contextLabel(brief?.text ?? null, brief?.source)}
            hasContext={(brief?.text ?? '').trim() !== ''}
            prepOpen={prepOpen}
            onTogglePrep={() => setPrepOpen((o) => !o)}
            modifier={modifierLabel(navigator.platform)}
            onToggleListening={listening ? pauseListening : startListening}
            onNewConversation={newConversation}
            gear={<SettingsGear open={settingsOpen} onToggle={() => setSettingsOpen((o) => !o)} />}
          />

          {settingsOpen && (
            <SettingsPanel
              help={help}
              onHelp={changeHelp}
              sensitivity={sensitivity}
              onSensitivity={changeSensitivity}
              micId={micId}
              onMic={changeMic}
              showDebug={DEBUG}
              debugOn={debugOn}
              onDebug={changeDebug}
              onOpenDebugView={openDebugView}
              onDownloadTrace={downloadTrace}
              onClose={() => setSettingsOpen(false)}
            />
          )}

          {prepOpen && (
            <PrepDrawer
              docName={brief?.source ?? null}
              terms={briefTerms}
              onLoad={(text, name) => setBrief({ text, source: name })}
              onClear={() => setBrief({ text: '' })}
              onClose={() => setPrepOpen(false)}
            />
          )}

          {noteState.map((m) => (
            <p key={m} role="alert" className="overlay-note overlay-note-error glass">
              {m}
            </p>
          ))}
          {error && (
            <p role="alert" className="overlay-note overlay-note-error glass">
              {error}
              <button type="button" className="overlay-retry" onClick={startListening}>
                Retry
              </button>
            </p>
          )}
          <p role="status" className="overlay-note glass">
            {overlayLine({
              listening,
              connection: status,
              notice: healthMessage(input.health) || notice,
              firstRun: firstRun && help !== null,
            })}
          </p>
          <p className="overlay-note overlay-heard glass">
            {heardLine([...heard, ...partialWords])}
          </p>

          {help === null && <HelpQuestion onChoose={changeHelp} />}

          <div className="card-slot">
            <SuggestionCard
              card={card}
              problem={problem}
              onPick={(id, word) => {
                dispatchCard({ type: 'picked', word, nowMs: Date.now() });
                send({ type: 'guess.picked', id, word });
              }}
              onDismiss={dismissCard}
              masked={masked}
              onReveal={revealCard}
            />
          </div>
        </div>
      )}

      {DEBUG && (
        <DevTools
          heard={heard.join(' ')}
          partial={partial}
          onBrief={(text) => setBrief({ text })}
          sendPartial={sendPartial}
          sendFinal={sendFinal}
          onDownloadTrace={downloadTrace}
        />
      )}
    </>
  );
}
