import { chooseDemo, type Presence, type Provider } from '../settings/keys';
import type { DesktopBridge } from './desktop';
import { KeysForm } from './KeysForm';
import './setup.css';

// Shown in the desktop app while a key is missing. The user can paste keys, or try the demo, where
// suggestions are examples.
export function Setup({
  keys,
  presence,
  onSaved,
  onDemo,
  onDone,
}: {
  keys: NonNullable<DesktopBridge['keys']>;
  presence: Record<Provider, Presence>;
  onSaved: () => void;
  onDemo: () => void;
  onDone: () => void;
}) {
  return (
    <section className="setup glass" role="group" aria-labelledby="setup-title">
      <h2 id="setup-title">Set up Tip of the Tongue</h2>
      <p>
        It needs two keys from the services it uses. They stay on this computer, and you can change
        them later in Settings.
      </p>
      <KeysForm keys={keys} presence={presence} onSaved={onSaved}>
        {presence.anthropic === 'set' && presence.deepgram === 'set' && (
          <button type="button" onClick={onDone}>
            Done
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            chooseDemo();
            onDemo();
          }}
        >
          Try demo mode
        </button>
      </KeysForm>
    </section>
  );
}

// Visible whenever the suggestions are examples, not real guesses.
export function DemoBanner() {
  return (
    <p className="demo-banner glass" role="status">
      Demo: suggestions are examples
    </p>
  );
}
