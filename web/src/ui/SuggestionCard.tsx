import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import type { Candidate } from '../../../server/src/events';
import { confidenceDots } from './cardView';
import type { CardState } from './cardState';
import { modifierLabel, pickForKey } from './commands';
import { desktop } from './desktop';
import { cue } from './firstSound';
import './card.css';

interface Props {
  card: CardState;
  // One short line when something is wrong (see statusLine); null when all is well.
  problem: string | null;
  // The user clicked a word.
  onPick: (id: string, word: string) => void;
  // "First sound" help: the words show as cues ("w…") until the user asks for the whole word.
  masked: boolean;
  onReveal: () => void;
  onDismiss: () => void;
  // The pointer or keyboard focus is on the card (true) or has left it (false).
  onHold: (held: boolean) => void;
}

// What is on screen, with a stable identity so the exit animation can hold on to it.
type Content =
  | { kind: 'problem'; line: string }
  | { kind: 'thinking' }
  | { kind: 'none' }
  | { kind: 'accepted'; word: string }
  | { kind: 'offer'; id: string; primary: Candidate; alternatives: Candidate[] };

const EXIT_FALLBACK_MS = 400;

// A problem takes the card's place; otherwise whatever the card state says.
function useContent(card: CardState, problem: string | null): Content | null {
  const { view } = card;
  return useMemo(() => {
    if (view && view.kind !== 'thinking') return view;
    if (problem) return { kind: 'problem', line: problem };
    return view;
  }, [view, problem]);
}

// Keeps the last content for the length of the exit animation after it goes away.
function useExit(content: Content | null) {
  const [shown, setShown] = useState(content);
  if (content && content !== shown) setShown(content);
  const leaving = content === null && shown !== null;
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setShown(null), EXIT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [leaving]);
  return { shown, leaving, done: () => leaving && setShown(null) };
}

// The live region stays mounted so screen readers announce a suggestion when it appears.
export function SuggestionCard({
  card,
  problem,
  onPick,
  onDismiss,
  masked,
  onReveal,
  onHold,
}: Props) {
  const content = useContent(card, problem);
  const { shown, leaving, done } = useExit(content);

  // The page's handler changes every render; the key listeners must not be re-registered each time.
  // Layout effects, not effects: the keys must work from the moment the card is on screen. A card
  // arrives from the network, not from a click, so React would otherwise attach the listener after
  // paint, and a key pressed in that gap (a fast user, or a test) would be lost.
  const latest = useRef({ onPick, onDismiss, masked, onReveal });
  useLayoutEffect(() => {
    latest.current = { onPick, onDismiss, masked, onReveal };
  });

  useLayoutEffect(() => {
    if (!content || content.kind === 'accepted') return;
    const words =
      content.kind === 'offer' ? [content.primary, ...content.alternatives].map((c) => c.word) : [];
    const pick = (index: number) => {
      const word = words[index];
      if (content.kind !== 'offer' || word === undefined) return;
      // A cue is not a word to pick blind: the first press shows the words.
      if (latest.current.masked) latest.current.onReveal();
      else latest.current.onPick(content.id, word);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return latest.current.onDismiss();
      const index = pickForKey(e);
      if (index === null || words[index] === undefined) return;
      e.preventDefault();
      pick(index);
    };
    window.addEventListener('keydown', onKey);
    // The desktop overlay never takes focus, so Esc and Cmd/Ctrl+1..3 come from global shortcuts.
    const release = desktop?.captureCardKeys(words.length, (key) =>
      key === 'escape' ? latest.current.onDismiss() : pick(key - 1),
    );
    return () => {
      window.removeEventListener('keydown', onKey);
      release?.();
    };
  }, [content]);

  return (
    <aside aria-live="polite" aria-label="Word suggestions" className="card-area">
      {shown && (
        <section
          className={leaving ? 'suggestion glass is-leaving' : 'suggestion glass'}
          onAnimationEnd={done}
          onMouseEnter={() => onHold(true)}
          onMouseLeave={() => onHold(false)}
          onFocus={() => onHold(true)}
          onBlur={() => onHold(false)}
        >
          <Body content={shown} onPick={onPick} masked={masked} onReveal={onReveal} />
        </section>
      )}
    </aside>
  );
}

const MODIFIER = modifierLabel(navigator.platform);
const SHORTCUT = MODIFIER === '\u2318' ? 'Meta' : 'Control';

// The key that picks a suggestion, shown beside it.
const Hint = ({ n }: { n: 1 | 2 | 3 }) => (
  <kbd className="keycap" aria-hidden="true">
    {MODIFIER}
    {n}
  </kbd>
);

function Body({
  content,
  onPick,
  masked,
  onReveal,
}: {
  content: Content;
  onPick: Props['onPick'];
  masked: boolean;
  onReveal: () => void;
}) {
  switch (content.kind) {
    case 'thinking':
      return <p className="card-thinking">Finding the word</p>;
    case 'none':
      return (
        <p className="card-none">
          <span aria-hidden="true">…</span>
          <span className="sr-only">No word found</span>
        </p>
      );
    case 'problem':
      return (
        <p className="card-problem">
          <CircleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
          {content.line}
        </p>
      );
    case 'accepted':
      return (
        <p className="card-accepted" dir="auto">
          <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          {content.word}
        </p>
      );
    case 'offer': {
      const dots = confidenceDots(content.primary.confidence);
      return (
        <>
          <div className="card-main">
            <span className="card-word">
              <span className="card-lead">
                <button
                  type="button"
                  className="card-primary"
                  dir="auto"
                  aria-keyshortcuts={`${SHORTCUT}+1`}
                  {...(masked
                    ? { 'aria-label': `Show the word that starts ${cue(content.primary.word)}` }
                    : {})}
                  onClick={() => (masked ? onReveal() : onPick(content.id, content.primary.word))}
                >
                  {masked ? cue(content.primary.word) : content.primary.word}
                </button>
                <Hint n={1} />
              </span>
              {!masked && content.primary.continuation && (
                <span className="card-cont" dir="auto">
                  {content.primary.continuation}
                </span>
              )}
            </span>
            <span
              className="card-dots"
              role="img"
              aria-label={`${dots} of 3 confidence`}
              data-filled={dots}
            >
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= dots ? 'on' : ''} />
              ))}
            </span>
          </div>
          {content.alternatives.length > 0 && (
            <ul className="card-alts">
              {content.alternatives.map((c, i) => (
                <li key={c.word}>
                  <button
                    dir="auto"
                    type="button"
                    aria-keyshortcuts={`${SHORTCUT}+${i + 2}`}
                    {...(masked
                      ? { 'aria-label': `Show the word that starts ${cue(c.word)}` }
                      : {})}
                    onClick={() => (masked ? onReveal() : onPick(content.id, c.word))}
                  >
                    {masked ? cue(c.word) : c.word}
                  </button>
                  <Hint n={(i + 2) as 2 | 3} />
                </li>
              ))}
            </ul>
          )}
          {!masked && content.primary.source && (
            <p className="card-source">from {content.primary.source}</p>
          )}
        </>
      );
    }
  }
}
