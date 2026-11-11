import { useId, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { PACKS } from '../skills/packs';
import { MAX_TEXT_CHARS, parseWords } from '../settings/aboutYou';
import {
  MAX_ACTIVE,
  MAX_CUSTOM_TERMS,
  MAX_DESCRIPTION_CHARS,
  isFull,
  skills,
  type CustomSkill,
} from '../settings/skills';
import { useSkillsState } from '../settings/useSkills';

const ICON = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

// A skill being written: a new one (no id) or an existing one.
type Draft = Omit<CustomSkill, 'id'> & { id?: string };
const blank: Draft = { name: '', description: '', terms: '' };

// Settings › Skills: topic packs to switch on, and the user's own lists of words. Everything is
// kept on this device and sent to the server as the active skills.
export function Skills() {
  const state = useSkillsState();
  const [draft, setDraft] = useState<Draft | null>(null);
  const full = isFull(state);

  return (
    <fieldset className="settings-skills">
      <legend>Skills</legend>
      <p className="settings-hint">
        Topics whose words it should know. Up to {MAX_ACTIVE} at a time.
      </p>

      {PACKS.map((p) => {
        const on = state.packs.includes(p.id);
        return (
          <label key={p.id} className="settings-check settings-pack">
            <input
              type="checkbox"
              checked={on}
              disabled={!on && full}
              onChange={(e) => skills.setPack(p.id, e.target.checked)}
            />
            <span>
              {p.name}
              <small>{p.description}</small>
            </span>
          </label>
        );
      })}

      {state.custom.length > 0 && (
        <ul className="settings-skill-list" aria-label="Your skills">
          {state.custom.map((c) => (
            <li key={c.id}>
              <span dir="auto">
                {c.name}
                <small>{parseWords(c.terms).length} words</small>
              </span>
              <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setDraft(c)}>
                <Pencil {...ICON} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${c.name}`}
                onClick={() => {
                  skills.removeCustom(c.id);
                  if (draft?.id === c.id) setDraft(null);
                }}
              >
                <Trash2 {...ICON} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <SkillForm
          key={draft.id ?? 'new'}
          draft={draft}
          onSave={(d) => {
            skills.saveCustom(d);
            setDraft(null);
          }}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <button
          type="button"
          className="settings-forget"
          disabled={full}
          onClick={() => setDraft(blank)}
        >
          New skill
        </button>
      )}
      {full && !draft && (
        <p className="settings-hint">Turn one off or delete one to add another.</p>
      )}
    </fieldset>
  );
}

function SkillForm({
  draft,
  onSave,
  onCancel,
}: {
  draft: Draft;
  onSave: (d: Draft) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(draft);
  const id = useId();
  const count = parseWords(value.terms).length;
  const over = parseWords(value.terms, MAX_CUSTOM_TERMS + 1).length > MAX_CUSTOM_TERMS;

  return (
    <form
      className="settings-skill-form"
      aria-label={draft.id ? `Edit ${draft.name}` : 'New skill'}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.name.trim()) onSave(value);
      }}
    >
      <label className="settings-field">
        <span>Name</span>
        <input
          type="text"
          value={value.name}
          maxLength={MAX_TEXT_CHARS}
          required
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </label>
      <label className="settings-field">
        <span>What it is for (optional)</span>
        <input
          type="text"
          value={value.description}
          maxLength={MAX_DESCRIPTION_CHARS}
          onChange={(e) => setValue({ ...value, description: e.target.value })}
        />
      </label>
      <label className="settings-field">
        <span>Words, separated by commas or new lines</span>
        <textarea
          rows={4}
          value={value.terms}
          aria-describedby={`${id}-count`}
          onChange={(e) => setValue({ ...value, terms: e.target.value })}
        />
      </label>
      <p id={`${id}-count`} className="settings-hint">
        {count} of {MAX_CUSTOM_TERMS} words{over ? ': the rest are ignored' : ''}
      </p>
      <div className="settings-skill-actions">
        <button type="submit" className="settings-forget">
          Save
        </button>
        <button type="button" className="settings-forget" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
