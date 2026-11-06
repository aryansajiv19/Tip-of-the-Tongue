import { useEffect } from 'react';
import type { OfferState } from './offerState';

const ACCEPTED_SHOWN_MS = 1500;

interface Props {
  offer: OfferState | null;
  onClear: () => void;
}

// The live region stays mounted so screen readers announce the offer when it appears.
export function Offer({ offer, onClear }: Props) {
  const accepted = offer?.acceptedWord;
  useEffect(() => {
    if (!accepted) return;
    const t = setTimeout(onClear, ACCEPTED_SHOWN_MS);
    return () => clearTimeout(t);
  }, [accepted, onClear]);

  return (
    <aside aria-live="polite" aria-label="Word suggestions">
      {offer && (
        <section>
          {accepted ? (
            <p>Got it: {accepted}</p>
          ) : (
            <>
              <p>Is this the word you&apos;re looking for?</p>
              <ul>
                {offer.candidates.map((c) => (
                  <li key={c.word}>{c.word}</li>
                ))}
              </ul>
              <button type="button" onClick={onClear}>
                Dismiss
              </button>
            </>
          )}
        </section>
      )}
    </aside>
  );
}
