import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';
import type { Candidate } from '../../../server/src/events';
import { confidenceDots } from './cardView';
import type { CardState } from './cardState';
import './card.css';

interface Props {
  card: CardState;
  // One short line when something is wrong (see statusLine); null when all is well.
  problem: string | null;
  // The user clicked a word.
  onPick: (id: string, word: string) => void;
  onDismiss: () => void;
}

// What is on screen, with a stable identity so the exit animation can hold on to it.
type Content =
  | { kind: 'problem'; line: string }
  | { kind: 'thinking' }
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
export function SuggestionCard({ card, problem, onPick, onDismiss }: Props) {
  const content = useContent(card, problem);
  const { shown, leaving, done } = useExit(content);

  useEffect(() => {
    if (!content || content.kind === 'accepted') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [content, onDismiss]);

  return (
    <aside aria-live="polite" aria-label="Word suggestions" className="card-area">
      {shown && (
        <section
          className={leaving ? 'suggestion glass is-leaving' : 'suggestion glass'}
          onAnimationEnd={done}
        >
          <Body content={shown} onPick={onPick} />
        </section>
      )}
    </aside>
  );
}

function Body({ content, onPick }: { content: Content; onPick: Props['onPick'] }) {
  switch (content.kind) {
    case 'thinking':
      return <p className="card-thinking">Finding the word</p>;
    case 'problem':
      return (
        <p className="card-problem" role="alert">
          <CircleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
          {content.line}
        </p>
      );
    case 'accepted':
      return (
        <p className="card-accepted">
          <Check size={16} strokeWidth={1.5} aria-hidden="true" />
          {content.word}
        </p>
      );
    case 'offer': {
      const dots = confidenceDots(content.primary.confidence);
      return (
        <>
          <div className="card-main">
            <button
              type="button"
              className="card-primary"
              onClick={() => onPick(content.id, content.primary.word)}
            >
              {content.primary.word}
            </button>
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
              {content.alternatives.map((c) => (
                <li key={c.word}>
                  <button type="button" onClick={() => onPick(content.id, c.word)}>
                    {c.word}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {content.primary.source && <p className="card-source">from {content.primary.source}</p>}
        </>
      );
    }
  }
}
