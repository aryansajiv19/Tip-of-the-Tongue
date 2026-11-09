import { useEffect, useState } from 'react';
import { Settings as GearIcon } from 'lucide-react';
import { HELP_KEYS, HELP_LABELS, helpHint, type HelpLevel } from '../settings/help';
import { micOptions, type MicOption } from '../settings/mic';
import {
  SENSITIVITIES,
  SENSITIVITY_KEYS,
  sensitivityHint,
  type Sensitivity,
} from '../settings/sensitivity';
import { modifierLabel } from './commands';
import { Privacy } from './Privacy';
import './settings.css';

interface Props {
  help: HelpLevel | null;
  onHelp: (value: HelpLevel) => void;
  sensitivity: Sensitivity | null;
  onSensitivity: (value: Sensitivity) => void;
  micId: string | null;
  onMic: (id: string | null) => void;
  // Debug controls exist only on a page opened with ?debug=1.
  showDebug: boolean;
  debugOn: boolean;
  onDebug: (on: boolean) => void;
  onOpenDebugView: () => void;
  onDownloadTrace: () => void;
  // Forgets everything kept on this device (the page also drops the loaded meeting notes).
  onForgetAll: () => void;
}

const ICON = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;
const PANEL_ID = 'settings-panel';

// The gear on the control pill.
export function SettingsGear(p: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="pill-button settings-gear"
      aria-label="Settings"
      aria-expanded={p.open}
      aria-controls={PANEL_ID}
      onClick={p.onToggle}
    >
      <GearIcon {...ICON} />
    </button>
  );
}

// The settings popover, under the pill. It is part of the overlay's flow so the desktop window
// grows to fit it.
export function SettingsPanel(p: Props & { onClose: () => void }) {
  const [mics, setMics] = useState<MicOption[]>([]);
  const { onClose } = p;

  // Microphone names are only known once the user has allowed the microphone, so look again
  // each time the popover opens.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => !cancelled && setMics(micOptions(devices)))
      .catch(() => !cancelled && setMics([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      // The gear toggles the panel itself.
      if (!target.closest('#' + PANEL_ID) && !target.closest('.settings-gear')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  return (
    <div id={PANEL_ID} className="settings-panel glass" role="group" aria-label="Settings">
      <fieldset>
        <legend>How I help</legend>
        <div className="settings-segments">
          {HELP_KEYS.map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="help"
                value={key}
                checked={(p.help ?? 'word') === key}
                onChange={() => p.onHelp(key)}
              />
              <span>{HELP_LABELS[key]}</span>
            </label>
          ))}
        </div>
        <p className="settings-hint">
          {helpHint(p.help ?? 'word', modifierLabel(navigator.platform))}
        </p>
      </fieldset>

      <fieldset>
        <legend>How quickly I offer words</legend>
        <div className="settings-segments">
          {SENSITIVITY_KEYS.map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="sensitivity"
                value={key}
                checked={(p.sensitivity ?? 'balanced') === key}
                onChange={() => p.onSensitivity(key)}
              />
              <span>{SENSITIVITIES[key].label}</span>
            </label>
          ))}
        </div>
        <p className="settings-hint">{sensitivityHint(p.sensitivity ?? 'balanced')}</p>
      </fieldset>

      <label className="settings-field">
        <span>Microphone</span>
        <select value={p.micId ?? ''} onChange={(e) => p.onMic(e.target.value || null)}>
          <option value="">System default</option>
          {mics.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <Privacy onForgetAll={p.onForgetAll} />

      {p.showDebug && (
        <>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={p.debugOn}
              onChange={(e) => p.onDebug(e.target.checked)}
            />
            <span>Debug</span>
          </label>
          {p.debugOn && (
            <div className="settings-debug">
              <button type="button" onClick={p.onOpenDebugView}>
                Open debug view
              </button>
              <button type="button" onClick={p.onDownloadTrace}>
                Download speech trace
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
