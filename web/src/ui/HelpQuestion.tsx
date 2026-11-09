import { HELP_KEYS, HELP_LABELS, type HelpLevel } from '../settings/help';
import './helpQuestion.css';

// Asked once, the first time: how much help the user wants. The answer is kept on this device and
// can be changed in Settings.
export function HelpQuestion({ onChoose }: { onChoose: (level: HelpLevel) => void }) {
  return (
    <section className="help-question glass" role="group" aria-labelledby="help-question-title">
      <p id="help-question-title">How should I help when you&rsquo;re stuck?</p>
      <div className="help-choices">
        {HELP_KEYS.map((key) => (
          <button key={key} type="button" onClick={() => onChoose(key)}>
            {HELP_LABELS[key]}
          </button>
        ))}
      </div>
    </section>
  );
}
