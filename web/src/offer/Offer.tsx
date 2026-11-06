import { useEffect, useState } from 'react';
import type { OfferState } from './offerState';
import './offer.css';

const ACCEPTED_SHOWN_MS = 1500;

interface Props {
  offer: OfferState | null;
  onClear: () => void;
  // The user clicked one of the words.
  onPick: (id: string, word: string) => void;
}

// The live region stays mounted so screen readers announce the offer when it appears.
export function Offer({ offer, onClear, onPick }: Props) {
  return (
    <aside aria-live="polite" aria-label="Word suggestions">
      {offer && <Card key={offer.id} offer={offer} onClear={onClear} onPick={onPick} />}
    </aside>
  );
}

function Card({
  offer,
  onClear,
  onPick,
}: {
  offer: OfferState;
  onClear: () => void;
  onPick: Props['onPick'];
}) {
  const [picked, setPicked] = useState<string>();
  const accepted = offer.acceptedWord ?? picked;

  useEffect(() => {
    if (!accepted) return;
    const t = setTimeout(onClear, ACCEPTED_SHOWN_MS);
    return () => clearTimeout(t);
  }, [accepted, onClear]);

  useEffect(() => {
    if (accepted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accepted, onClear]);

  if (accepted) {
    return (
      <section className="offer offer-accepted">
        <svg className="offer-check" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M7 12.5l3.2 3.2L17 8.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p>Got it: {accepted}</p>
      </section>
    );
  }

  return (
    <section className="offer">
      <p className="offer-label">Is this the word you&apos;re looking for?</p>
      <ul className="offer-words">
        {offer.candidates.map((c) => (
          <li key={c.word}>
            <button
              type="button"
              className="offer-word"
              onClick={() => {
                setPicked(c.word);
                onPick(offer.id, c.word);
              }}
            >
              {c.word}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="offer-close" onClick={onClear} aria-label="Dismiss">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </section>
  );
}
