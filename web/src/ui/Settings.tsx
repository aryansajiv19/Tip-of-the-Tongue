import { useEffect, useId, useRef, useState } from 'react';
import { Settings as GearIcon } from 'lucide-react';
import { micOptions, type MicOption } from '../settings/mic';
import { SENSITIVITIES, SENSITIVITY_KEYS, type Sensitivity } from '../settings/sensitivity';
import './settings.css';

interface Props {
  sensitivity: Sensitivity | null;
  onSensitivity: (value: Sensitivity) => void;
  micId: string | null;
  onMic: (id: string | null) => void;
  debugOn: boolean;
  onDebug: (on: boolean) => void;
  onOpenDebugView: () => void;
  onDownloadTrace: () => void;
}

// The gear and its small popover. The gear sits on the control pill.
export function Settings(p: Props) {
  const [open, setOpen] = useState(false);
  const [mics, setMics] = useState<MicOption[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Microphone names are only known once the user has allowed the microphone, so look again
  // each time the popover opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => !cancelled && setMics(micOptions(devices)))
      .catch(() => !cancelled && setMics([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="settings" ref={root}>
      <button
        type="button"
        className="settings-gear"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <GearIcon size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="settings-panel glass" role="group" aria-label="Settings">
          <fieldset>
            <legend>Sensitivity</legend>
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
        </div>
      )}
    </div>
  );
}
