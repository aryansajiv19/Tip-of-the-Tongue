import { useSyncExternalStore, type ReactNode } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { formatClock, type Mode } from './sessionState';
import { BAR_COUNT, barHeights } from './levelBars';
import { levelStore } from './levelStore';
import './controlPill.css';

interface Props {
  listening: boolean;
  // False when this browser can't listen at all: the button is shown but disabled.
  canListen: boolean;
  elapsedMs: number;
  mode: Mode;
  // What to print on the keycaps: "⌘" or "Ctrl".
  modifier: string;
  onToggleListening: () => void;
  onNewConversation: () => void;
  // The settings gear, placed just before New conversation.
  gear?: ReactNode;
}

const ICON = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

export function ControlPill(p: Props) {
  const toggleLabel = !p.canListen
    ? 'Listening unavailable'
    : p.listening
      ? 'Pause listening'
      : 'Start listening';

  return (
    <div className="control-pill glass" role="group" aria-label="Listening controls">
      <button
        type="button"
        className="pill-button"
        aria-label={toggleLabel}
        disabled={!p.canListen}
        onClick={p.onToggleListening}
      >
        {p.listening ? <Pause {...ICON} /> : <Play {...ICON} />}
      </button>

      <Waveform listening={p.listening} />

      <span className="pill-timer" role="timer" aria-label="Time listening">
        {formatClock(p.elapsedMs)}
      </span>
      <span className="pill-mode">{p.mode}</span>

      <span className="pill-keys" aria-hidden="true">
        <kbd className="keycap">{p.modifier}\</kbd>
        <kbd className="keycap">{p.modifier}↵</kbd>
      </span>

      {p.gear}

      <button
        type="button"
        className="pill-button"
        aria-label="New conversation"
        title="New conversation"
        onClick={p.onNewConversation}
      >
        <RotateCcw {...ICON} />
      </button>
    </div>
  );
}

// Five bars that follow the microphone while listening, and rest faintly while paused.
function Waveform({ listening }: { listening: boolean }) {
  const level = useSyncExternalStore(levelStore.subscribe, levelStore.snapshot);
  const heights = barHeights(level, listening);
  return (
    <span
      className={listening ? 'pill-wave pill-wave-live' : 'pill-wave'}
      role="img"
      aria-label={listening ? 'Microphone is on' : 'Microphone is off'}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <span key={i} className="pill-bar" style={{ transform: `scaleY(${heights[i]})` }} />
      ))}
    </span>
  );
}
