import { useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { readDocument } from './readDocument';
import './prepDrawer.css';

const SHOWN_TERMS = 24;
const ICON = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

interface Props {
  // The loaded document's name, if the brief came from a file.
  docName: string | null;
  // Key terms of the brief, from the server.
  terms: string[];
  onLoad: (text: string, name: string) => void;
  onClear: () => void;
  onClose: () => void;
}

// A compact drawer under the pill: drop a PDF, .md or .txt file and it becomes the brief.
export function PrepDrawer({ docName, terms, onLoad, onClear, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const doc = await readDocument(file);
      onLoad(doc.text, doc.name);
      if (doc.clipped) setMessage({ text: 'Using the first 50,000 characters.', error: false });
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Could not read that file.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="prep-drawer"
      className="prep glass"
      aria-label="Meeting prep"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className={over ? 'prep-drop prep-drop-over' : 'prep-drop'}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
      >
        <p>Drop a PDF, .md or .txt file</p>
        <button type="button" className="prep-choose" onClick={() => input.current?.click()}>
          Choose file
        </button>
        <input
          ref={input}
          type="file"
          hidden
          aria-label="Meeting document"
          accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
          onChange={(e) => {
            void take(e.target.files?.[0]);
            e.target.value = ''; // so the same file can be chosen again
          }}
        />
      </div>

      <p role="status" className="prep-note">
        {busy ? 'Reading the file…' : message && !message.error ? message.text : ''}
      </p>
      {message?.error && (
        <p role="alert" className="prep-note prep-error">
          {message.text}
        </p>
      )}

      {docName && (
        <p className="prep-doc">
          <FileText {...ICON} />
          <span className="prep-doc-name">{docName}</span>
          <button
            type="button"
            className="prep-remove"
            aria-label={`Remove ${docName}`}
            onClick={() => {
              setMessage(null);
              onClear();
            }}
          >
            <X {...ICON} />
          </button>
        </p>
      )}

      {terms.length > 0 && (
        <ul className="prep-terms" aria-label="Key terms">
          {terms.slice(0, SHOWN_TERMS).map((t) => (
            <li key={t} className="prep-chip">
              {t}
            </li>
          ))}
          {terms.length > SHOWN_TERMS && (
            <li className="prep-chip">+{terms.length - SHOWN_TERMS} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
