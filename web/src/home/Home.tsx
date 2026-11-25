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
import { greeting, timeLabel, wordStats } from './homeView';
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
        <ul>
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
        <p className="home-status" role="status">
          <span className="home-dot" data-on={listening === true} aria-hidden />
          {listening === null ? 'Starting…' : listening ? 'Listening' : 'Paused'}
        </p>
      </nav>

      <main className="home-main">
        {page === 'home' && (
          <HomePage listening={listening} recent={recent} presence={keys.status} go={setPage} />
        )}
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
            <div className="home-panel">
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
  presence,
  go,
}: {
  listening: boolean | null;
  recent: RecentWord[];
  presence: ReturnType<typeof useKeys>['status'];
  go: (page: Page) => void;
}) {
  const mod = modifierLabel(navigator.platform);
  const stats = wordStats(recent);
  const command = desktop?.home?.command;
  const steps = [
    { done: presence?.anthropic === 'set', label: 'Add a word-service key (Anthropic)' },
    { done: presence?.deepgram === 'set', label: 'Add a speech key (Deepgram)' },
    { done: stats.offered > 0, label: 'Pause on a word and see a suggestion' },
  ];

  return (
    <div className="home-grid">
      <div className="home-col">
        <h1>{greeting(new Date().getHours())}</h1>

        <section className="home-hero" aria-labelledby="hero-title">
          <h2 id="hero-title">
            Lost for a word? <em>Keep talking.</em>
          </h2>
          <p>
            When you pause on a word, up to three appear in the pop-up. Nothing appears unless it is
            fairly sure.
          </p>
          <div className="home-hero-actions">
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
            </button>
            <span className="home-hint">
              or press <kbd className="keycap">{mod}</kbd> <kbd className="keycap">\</kbd>
            </span>
          </div>
        </section>

        <section aria-labelledby="recent-title">
          <div className="home-row">
            <h2 id="recent-title" className="home-label">
              This conversation
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
          <WordList recent={recent.slice(0, 8)} />
          {recent.length > 8 && (
            <button type="button" className="home-quiet" onClick={() => go('words')}>
              See all {recent.length} words
            </button>
          )}
        </section>
      </div>

      <aside className="home-col home-side" aria-label="Summary">
        <section className="home-panel home-stats" aria-label="Today">
          <p>
            <strong>{stats.offered}</strong> words offered
          </p>
          <p>
            <strong>{stats.used}</strong> words used
          </p>
        </section>

        <section className="home-panel" aria-labelledby="setup-title">
          <h2 id="setup-title">Get set up</h2>
          <ul className="home-steps">
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
            <button type="button" onClick={() => go('keys')}>
              Add keys
            </button>
          )}
        </section>

        <section className="home-panel" aria-labelledby="shortcuts-title">
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
