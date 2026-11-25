import { useEffect, useState } from 'react';
import {
  AudioLines,
  BookOpen,
  Check,
  Circle,
  KeyRound,
  LayoutGrid,
  PanelTop,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { desktop } from '../ui/desktop';
import { modifierLabel } from '../ui/commands';
import { KeysForm } from '../ui/KeysForm';
import { Skills } from '../ui/Skills';
import { useKeys } from '../settings/useKeys';
import type { RecentWord } from '../ui/recentWords';
import { greeting, lastWord, timeLabel, wordStats } from './homeView';
import '../ui/settings.css';
import './home.css';

type Page = 'home' | 'words' | 'skills' | 'keys';
const ICON = { size: 20, strokeWidth: 1.5, 'aria-hidden': true } as const;
const NAV: { page: Page; label: string; Icon: typeof LayoutGrid }[] = [
  { page: 'home', label: 'Home', Icon: LayoutGrid },
  { page: 'words', label: 'Words', Icon: BookOpen },
  { page: 'skills', label: 'Skills', Icon: Sparkles },
  { page: 'keys', label: 'Keys', Icon: KeyRound },
];

// The app window (?view=home): a normal window for setting up and looking back. It never opens
// the microphone; the overlay does the listening, and its buttons here act on the overlay.
export function Home() {
  const [page, setPage] = useState<Page>('home');
  const [listening, setListening] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<RecentWord[]>([]);
  const keys = useKeys();
  const stats = wordStats(recent);
  const steps = [
    { done: keys.status?.anthropic === 'set', label: 'Add a word-service key' },
    { done: keys.status?.deepgram === 'set', label: 'Add a speech key' },
    { done: stats.offered > 0, label: 'Pause on a word and see a suggestion' },
  ];

  useEffect(
    () =>
      desktop?.home?.onState((s) => {
        setListening(s.listening);
        setRecent(s.recent);
      }),
    [],
  );

  return (
    <div className="home">
      <nav className="home-sidebar" aria-label="Sections">
        <div className="home-brand">
          <AudioLines {...ICON} />
          <span>Tip of the Tongue</span>
        </div>
        <ul className="home-nav">
          {NAV.map(({ page: p, label, Icon }) => (
            <li key={p}>
              <button
                type="button"
                aria-current={page === p ? 'page' : undefined}
                onClick={() => setPage(p)}
              >
                <Icon {...ICON} />
                {label}
              </button>
            </li>
          ))}
        </ul>

        {!steps.every((s) => s.done) && (
          <section className="home-setup" aria-labelledby="setup-title">
            <h2 id="setup-title">Get set up</h2>
            <div className="home-progress" aria-hidden>
              <span style={{ width: `${(steps.filter((s) => s.done).length / 3) * 100}%` }} />
            </div>
            <ul>
              {steps.map((s) => (
                <li key={s.label} data-done={s.done}>
                  {s.done ? <Check {...ICON} /> : <Circle {...ICON} />}
                  <span>
                    {s.label}
                    <span className="sr-only">{s.done ? ', done' : ', not yet'}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!(steps[0]?.done && steps[1]?.done) && (
              <button type="button" className="home-link" onClick={() => setPage('keys')}>
                Add keys
              </button>
            )}
          </section>
        )}

        <p className="home-status" role="status">
          <span className="home-dot" data-on={listening === true} aria-hidden />
          {listening === null ? 'Starting…' : listening ? 'Listening' : 'Paused'}
        </p>
      </nav>

      <main className="home-main">
        {page === 'home' && <HomePage listening={listening} recent={recent} go={setPage} />}
        {page === 'words' && (
          <section aria-labelledby="words-title">
            <h1 id="words-title">Words</h1>
            <p className="home-lead">
              Words offered in this conversation, newest first. They are kept only until you start a
              new conversation or quit.
            </p>
            <WordList recent={recent} />
          </section>
        )}
        {page === 'skills' && (
          <section aria-labelledby="skills-title">
            <h1 id="skills-title">Skills</h1>
            <div className="settings-panel home-embedded">
              <Skills />
            </div>
          </section>
        )}
        {page === 'keys' && (
          <section aria-labelledby="keys-title">
            <h1 id="keys-title">Keys</h1>
            <p className="home-lead">
              Your own keys for the speech and word services. They stay on this computer, encrypted,
              and are never shown again.
            </p>
            <div className="home-card home-embedded-keys">
              {keys.bridge && keys.status ? (
                <KeysForm keys={keys.bridge} presence={keys.status} onSaved={keys.refresh} />
              ) : (
                <p>Keys can be set in the desktop app only.</p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function HomePage({
  listening,
  recent,
  go,
}: {
  listening: boolean | null;
  recent: RecentWord[];
  go: (page: Page) => void;
}) {
  const mod = modifierLabel(navigator.platform);
  const stats = wordStats(recent);
  const last = lastWord(recent);
  const command = desktop?.home?.command;

  return (
    <div className="home-grid">
      <header className="home-head">
        <h1>{greeting(new Date().getHours())}</h1>
        <p className="home-sub">
          {listening
            ? 'Listening. It stays quiet until you pause on a word.'
            : 'Paused. Press Start when you are ready to talk.'}
        </p>
      </header>

      <div className="home-col">
        <section className="home-moment" aria-labelledby="moment-title">
          <div className="home-moment-text">
            <h2 id="moment-title">
              {last ? 'The word you reached for' : 'When a word slips away'}
            </h2>
            <p>
              {last
                ? `${last.accepted ? 'You took it' : 'Offered'} at ${timeLabel(last.at)}.`
                : 'Keep talking. A moment later, the word you meant appears in the pop-up.'}
            </p>
          </div>

          {/* A still copy of the pop-up card: the product's one moment. */}
          <figure className="home-card-demo glass" aria-label={last ? undefined : 'Example'}>
            {!last && <figcaption>“…the thing you fly in”</figcaption>}
            <p className="home-card-word">{last ? last.word : 'plane'}</p>
            {!last && (
              <ul className="home-card-alts" aria-label="Alternatives">
                <li>flight</li>
                <li>jet</li>
              </ul>
            )}
          </figure>

          <div className="home-moment-actions">
            <button
              type="button"
              className="home-primary"
              onClick={() => command?.('toggle-listening')}
            >
              {listening ? <Pause {...ICON} /> : <Play {...ICON} />}
              {listening ? 'Pause listening' : 'Start listening'}
            </button>
            <button type="button" onClick={() => command?.('show-overlay')}>
              <PanelTop {...ICON} />
              Show the pop-up
              <span className="home-keys" aria-hidden>
                <kbd className="keycap">{mod}</kbd>
                <kbd className="keycap">\</kbd>
              </span>
            </button>
          </div>
        </section>

        <section aria-labelledby="recent-title">
          <div className="home-row">
            <h2 id="recent-title" className="home-label">
              Words you found
            </h2>
            {recent.length > 0 && (
              <button
                type="button"
                className="home-quiet"
                onClick={() => command?.('new-conversation')}
              >
                <RotateCcw {...ICON} />
                New conversation
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="home-empty">Nothing yet. Words you pause on will gather here.</p>
          ) : (
            <ul className="home-chips">
              {recent.map((r) => (
                <li key={r.word} data-used={r.accepted} title={timeLabel(r.at)}>
                  {r.accepted && <Check {...ICON} />}
                  {r.word}
                  <span className="sr-only">
                    , {r.accepted ? 'used' : 'offered'} at {timeLabel(r.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {recent.length > 0 && (
            <button type="button" className="home-quiet" onClick={() => go('words')}>
              See them with times
            </button>
          )}
        </section>
      </div>

      <aside className="home-col home-side" aria-label="Summary">
        <section className="home-card" aria-labelledby="stats-title">
          <h2 id="stats-title" className="home-label">
            This conversation
          </h2>
          <p className="home-ratio">
            {stats.offered === 0 ? (
              'No words yet'
            ) : (
              <>
                <strong>{stats.used}</strong> of {stats.offered} words used
              </>
            )}
          </p>
          <div className="home-progress" aria-hidden>
            <span style={{ width: `${stats.offered ? (stats.used / stats.offered) * 100 : 0}%` }} />
          </div>
        </section>

        <section className="home-card" aria-labelledby="shortcuts-title">
          <h2 id="shortcuts-title">Shortcuts</h2>
          <dl className="home-shortcuts">
            <dt>Show or hide</dt>
            <dd>
              <kbd className="keycap">{mod}</kbd> <kbd className="keycap">\</kbd>
            </dd>
            <dt>Ask now</dt>
            <dd>
              <kbd className="keycap">{mod}</kbd> <kbd className="keycap">↵</kbd>
            </dd>
            <dt>Pick a word</dt>
            <dd>
              <kbd className="keycap">{mod}</kbd> <kbd className="keycap">1</kbd>–
              <kbd className="keycap">3</kbd>
            </dd>
            <dt>Dismiss</dt>
            <dd>
              <kbd className="keycap">Esc</kbd>
            </dd>
            <dt>New conversation</dt>
            <dd>
              <kbd className="keycap">{mod}</kbd> <kbd className="keycap">⇧</kbd>{' '}
              <kbd className="keycap">N</kbd>
            </dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}

function WordList({ recent }: { recent: RecentWord[] }) {
  if (recent.length === 0) {
    return (
      <p className="home-empty">
        No words yet. Start listening and talk as usual; when you pause on a word, it shows up here.
      </p>
    );
  }
  return (
    <ol className="home-words">
      {recent.map((r) => (
        <li key={r.word}>
          <time dateTime={new Date(r.at).toISOString()}>{timeLabel(r.at)}</time>
          <span className="home-word">{r.word}</span>
          {r.accepted && <span className="home-badge">Used</span>}
        </li>
      ))}
    </ol>
  );
}
