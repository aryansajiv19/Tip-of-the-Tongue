import { useState } from 'react';
import { Check as Tick, CircleAlert } from 'lucide-react';
import {
  PROVIDERS,
  checkMessage,
  keysToSave,
  type Check,
  type Presence,
  type Provider,
} from '../settings/keys';
import type { DesktopBridge } from './desktop';
import './keysForm.css';

type Keys = NonNullable<DesktopBridge['keys']>;
const ORDER: Provider[] = ['anthropic', 'deepgram'];

// One field per provider, a link to get a key, and a live check after saving that shows a tick or
// the reason in plain words. A saved key is never shown: an empty field keeps it.
export function KeysForm({
  keys,
  presence,
  onSaved,
  children,
}: {
  keys: Keys;
  presence: Record<Provider, Presence>;
  // Called once the keys are saved and checked, so the page can look at the status again.
  onSaved: () => void;
  // Extra buttons beside "Save and check" (the setup screen's "Try demo mode").
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState<Record<Provider, string>>({ anthropic: '', deepgram: '' });
  const [results, setResults] = useState<Partial<Record<Provider, Check>>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function saveAndCheck() {
    setBusy(true);
    setFailed(false);
    try {
      const toSave = keysToSave(typed);
      if (Object.keys(toSave).length > 0) await keys.save(toSave);
      setResults(await keys.test());
      setTyped({ anthropic: '', deepgram: '' });
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(provider: Provider) {
    setBusy(true);
    try {
      await keys.save({ [provider]: '' });
      setResults((r) => ({ ...r, [provider]: undefined }));
      onSaved();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const anythingToCheck =
    Object.keys(keysToSave(typed)).length > 0 || ORDER.some((p) => presence[p] === 'set');

  return (
    <form
      className="keys-form"
      onSubmit={(e) => {
        e.preventDefault();
        void saveAndCheck();
      }}
    >
      {ORDER.map((p) => {
        const info = PROVIDERS[p];
        const result = results[p];
        return (
          <div key={p} className="keys-field">
            <label>
              <span className="keys-label">
                {info.label} <span className="keys-job">{info.job}</span>
              </span>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={typed[p]}
                placeholder={
                  presence[p] === 'set' ? 'Saved. Paste a new key to replace it' : 'Paste your key'
                }
                onChange={(e) => setTyped((t) => ({ ...t, [p]: e.target.value }))}
              />
            </label>
            <p className="keys-links">
              <a href={info.getKey} target="_blank" rel="noreferrer">
                Get a key
              </a>
              {presence[p] === 'set' && (
                <button type="button" disabled={busy} onClick={() => void remove(p)}>
                  Remove key
                </button>
              )}
            </p>
            {result && (
              <p
                className={result === 'ok' ? 'keys-result keys-ok' : 'keys-result keys-bad'}
                role="status"
              >
                {result === 'ok' ? (
                  <Tick size={16} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <CircleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
                )}
                {checkMessage(p, result)}
              </p>
            )}
          </div>
        );
      })}
      {failed && (
        <p className="keys-result keys-bad" role="status">
          <CircleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
          Could not save the keys. Try again.
        </p>
      )}
      <div className="keys-actions">
        <button type="submit" disabled={busy || !anythingToCheck}>
          {busy ? 'Checking…' : 'Save and check'}
        </button>
        {children}
      </div>
    </form>
  );
}
