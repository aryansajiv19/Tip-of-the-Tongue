import { useState } from 'react';
import { X } from 'lucide-react';
import { aboutYou } from '../settings/aboutYou';
import { useAboutYouState } from '../settings/useAboutYou';

// What this device keeps, in plain sight, with a way to remove each part. Nothing here leaves the
// device except as the words the guesser is told about (the page says so).
export function Privacy({ onForgetAll }: { onForgetAll: () => void }) {
  const { remembered } = useAboutYouState();
  const [confirming, setConfirming] = useState(false);

  return (
    <fieldset className="settings-privacy">
      <legend>Privacy</legend>
      <p className="settings-hint">
        No audio is stored. Words you accept are kept on this device so the next meeting knows them.
      </p>

      <h3 className="settings-subhead">Remembered words</h3>
      {remembered.length === 0 ? (
        <p className="settings-hint">None yet.</p>
      ) : (
        <ul className="settings-words" aria-label="Remembered words">
          {[...remembered].reverse().map((w) => (
            <li key={w} dir="auto">
              <span>{w}</span>
              <button
                type="button"
                aria-label={`Forget ${w}`}
                onClick={() => aboutYou.removeRemembered(w)}
              >
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirming ? (
        <div className="settings-confirm" role="group" aria-label="Forget everything?">
          <p>Forget your name, role, words, remembered words and meeting notes?</p>
          <div>
            <button
              type="button"
              className="settings-danger"
              onClick={() => {
                onForgetAll();
                setConfirming(false);
              }}
            >
              Yes, forget everything
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="settings-forget" onClick={() => setConfirming(true)}>
          Forget everything
        </button>
      )}
    </fieldset>
  );
}
