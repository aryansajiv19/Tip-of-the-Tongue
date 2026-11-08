import { SENSITIVITIES, SENSITIVITY_KEYS, type Sensitivity as Choice } from './sensitivity';

interface Props {
  // null until the user has chosen: Balanced is shown, and the server's own defaults apply.
  value: Choice | null;
  onChange: (value: Choice) => void;
}

// Calm / Balanced / Eager. Mounted by the settings popover.
export function Sensitivity({ value, onChange }: Props) {
  return (
    <fieldset>
      <legend>Sensitivity</legend>
      {SENSITIVITY_KEYS.map((key) => (
        <label key={key}>
          <input
            type="radio"
            name="sensitivity"
            value={key}
            checked={(value ?? 'balanced') === key}
            onChange={() => onChange(key)}
          />
          {SENSITIVITIES[key].label}
        </label>
      ))}
    </fieldset>
  );
}
