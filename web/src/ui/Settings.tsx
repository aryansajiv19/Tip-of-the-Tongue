import { useEffect, useState } from 'react';
import { Settings as GearIcon } from 'lucide-react';
import { HELP_KEYS, HELP_LABELS, helpHint, type HelpLevel } from '../settings/help';
import { TEXT_SIZES, TEXT_SIZE_LABELS, type TextSize } from '../settings/textSize';
import { LANGUAGE_OPTIONS, MIXED_HINT, isLanguage } from '../settings/language';
import type { Language } from '../../../server/src/events';
import { micOptions, type MicOption } from '../settings/mic';
import {
  SENSITIVITIES,
  SENSITIVITY_KEYS,
  sensitivityHint,
  type Sensitivity,
} from '../settings/sensitivity';
import { modifierLabel } from './commands';
import { Privacy } from './Privacy';
import { Skills } from './Skills';
import { KeysForm } from './KeysForm';
import type { DesktopBridge } from './desktop';
import type { Presence, Provider } from '../settings/keys';
import { useReturnFocus } from './useReturnFocus';
import './settings.css';

interface Props {
  help: HelpLevel | null;
  onHelp: (value: HelpLevel) => void;
  sensitivity: Sensitivity | null;
  onSensitivity: (value: Sensitivity) => void;
  language: Language | null;
  continuations: boolean;
  onContinuations: (on: boolean) => void;
  // Meeting notes are loaded.
  hasNotes: boolean;
  onLanguage: (value: Language) => void;
  textSize: TextSize;
  onTextSize: (value: TextSize) => void;
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
  // The desktop app's keys; null in a browser (there the server reads its own environment).
  keys: {
    bridge: NonNullable<DesktopBridge['keys']>;
    status: Record<Provider, Presence>;
    refresh: () => void;
  } | null;
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
  const panel = useReturnFocus<HTMLDivElement>();

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
    <div
      id={PANEL_ID}
      ref={panel}
      tabIndex={-1}
      className="settings-panel glass"
      role="group"
      aria-label="Settings"
    >
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

      <fieldset>
        <legend>Text size</legend>
        <div className="settings-segments">
          {TEXT_SIZES.map((key) => (
            <label key={key}>
              <input
                type="radio"
                name="text-size"
                value={key}
                checked={p.textSize === key}
                onChange={() => p.onTextSize(key)}
              />
              <span>{TEXT_SIZE_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="settings-field">
        <label htmlFor="settings-language">Language</label>
        <select
          id="settings-language"
          value={p.language ?? 'en'}
          aria-describedby={p.language === 'multi' ? 'settings-language-hint' : undefined}
          onChange={(e) => isLanguage(e.target.value) && p.onLanguage(e.target.value)}
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.code} value={o.code} lang={o.code === 'multi' ? undefined : o.code}>
              {o.name}
            </option>
          ))}
        </select>
        {p.language === 'multi' && (
          <p id="settings-language-hint" className="settings-hint">
            {MIXED_HINT}
          </p>
        )}
      </div>

      <div className="settings-field">
        <label className="settings-check">
          <input
            type="checkbox"
            checked={p.continuations}
            aria-describedby="settings-continue-hint"
            onChange={(e) => p.onContinuations(e.target.checked)}
          />
          <span>Show how to continue</span>
        </label>
        <p id="settings-continue-hint" className="settings-hint">
          Adds the next few words; slightly less accurate.
          {p.hasNotes && <> Works best with meeting notes.</>}
        </p>
      </div>

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

      {p.keys && (
        <fieldset>
          <legend>Keys</legend>
          <KeysForm keys={p.keys.bridge} presence={p.keys.status} onSaved={p.keys.refresh} />
        </fieldset>
      )}

      <Skills />

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
