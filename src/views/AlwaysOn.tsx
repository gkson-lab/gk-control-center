import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Panel } from '../components/Panel';
import { inDesktopApp } from '../lib/useMetrics';
import { Empty } from './Hardware';

interface Alert {
  on: boolean;
  limit: number;
}
interface Settings {
  close_to_tray: boolean;
  cpu_load: Alert;
  cpu_temp: Alert;
  gpu_temp: Alert;
  memory: Alert;
  disk_full: Alert;
}
type AlertKey = Exclude<keyof Settings, 'close_to_tray'>;

const ALERTS: { key: AlertKey; label: string; unit: string; min: number; max: number; note: string }[] = [
  { key: 'cpu_temp', label: 'CPU temperature', unit: '°C', min: 50, max: 105, note: 'Needs a CPU temperature reading (LibreHardwareMonitor on Windows).' },
  { key: 'gpu_temp', label: 'GPU temperature', unit: '°C', min: 50, max: 100, note: 'NVIDIA cards only.' },
  { key: 'cpu_load', label: 'Processor load', unit: '%', min: 50, max: 100, note: 'Only after it stays there for 10 seconds.' },
  { key: 'memory', label: 'Memory in use', unit: '%', min: 50, max: 99, note: '' },
  { key: 'disk_full', label: 'Drive space used', unit: '%', min: 50, max: 99, note: 'Checks your fullest drive.' },
];

/** Expansion pack: always on. Tray, overlay and alert settings. */
export function AlwaysOn() {
  const [s, setS] = useState<Settings | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!inDesktopApp) return;
    invoke<Settings>('get_always_on').then(setS).catch(() => setStatus({ ok: false, text: "Couldn't load settings." }));
    invoke<boolean>('overlay_visible').then(setOverlay).catch(() => {});
    const stop = listen<boolean>('overlay-changed', (e) => setOverlay(e.payload));
    return () => {
      stop.then((f) => f());
    };
  }, []);

  if (!inDesktopApp) {
    return (
      <Panel title="Always on">
        <Empty title="Desktop app only" body="The tray icon, overlay and notifications belong to the desktop app, so the browser preview can't show them." />
      </Panel>
    );
  }
  if (!s) {
    return (
      <Panel title="Always on">
        <p className="type-condensed m-0 text-sm text-muted" role="status">
          {status?.text ?? 'Loading settings…'}
        </p>
      </Panel>
    );
  }

  // Saves half a second after the last change, so typing a limit doesn't write every keystroke.
  const update = (next: Settings) => {
    setS(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      invoke('set_always_on', { settings: next })
        .then(() => setStatus({ ok: true, text: 'Saved.' }))
        .catch((e) => setStatus({ ok: false, text: String(e) }));
    }, 500);
  };

  const toggleOverlay = async () => {
    try {
      await invoke('set_overlay', { show: !overlay });
      setOverlay(!overlay);
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't open the overlay: ${e}` });
    }
  };

  const test = async () => {
    try {
      await invoke('test_alert');
      setStatus({ ok: true, text: 'Test notification sent. If nothing appeared, check that notifications are allowed for this app in system settings.' });
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't send a notification: ${e}` });
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="grid content-start gap-5">
        <Panel title="Tray">
          <Toggle
            label="Keep running in the tray when the window closes"
            note="The tray icon's tooltip shows CPU, GPU and memory. Left-click it to bring the window back; right-click for the menu, including Quit."
            on={s.close_to_tray}
            onChange={(on) => update({ ...s, close_to_tray: on })}
          />
        </Panel>
        <Panel title="Overlay">
          <Toggle
            label="Show the overlay"
            note="A small always-on-top window with CPU, GPU and memory, for games and renders. Drag it by its body. Also in the tray menu."
            on={overlay}
            onChange={toggleOverlay}
          />
        </Panel>
      </div>

      <Panel
        title="Alerts"
        aside={
          <button type="button" onClick={test} className="min-h-11 rounded-control border border-line px-4 text-sm font-medium hover:bg-sunken">
            Send a test notification
          </button>
        }
      >
        <p className="type-condensed m-0 mb-3 text-sm text-muted">
          A desktop notification when a reading stays past its limit for 10 seconds. The same alert waits 5 minutes before repeating.
        </p>
        <ul className="m-0 grid list-none gap-1 p-0">
          {ALERTS.map((a) => {
            const v = s[a.key];
            const id = `limit-${a.key}`;
            return (
              <li key={a.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-line py-3 last:border-b-0">
                <Toggle label={a.label} note={a.note} on={v.on} onChange={(on) => update({ ...s, [a.key]: { ...v, on } })} />
                <label htmlFor={id} className="type-condensed flex items-center gap-2 text-sm text-muted">
                  <span className="sr-only">{a.label} limit</span>
                  at
                  <input
                    id={id}
                    type="number"
                    min={a.min}
                    max={a.max}
                    value={v.limit}
                    disabled={!v.on}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) update({ ...s, [a.key]: { ...v, limit: Math.min(a.max, Math.max(a.min, n)) } });
                    }}
                    className="type-reading min-h-11 w-20 rounded-control border border-line bg-paper px-2 text-right text-[14px] text-ink disabled:opacity-50"
                  />
                  {a.unit}
                </label>
              </li>
            );
          })}
        </ul>
        {status && (
          <p role="status" className={`type-condensed m-0 mt-4 text-sm ${status.ok ? 'text-muted' : 'text-signal'}`}>
            {status.text}
          </p>
        )}
      </Panel>
    </div>
  );
}

function Toggle({ label, note, on, onChange }: { label: string; note?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 w-full items-start gap-3 rounded-control py-1 text-left"
    >
      <span
        aria-hidden
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors ${on ? 'border-ink bg-ink' : 'border-line bg-sunken'}`}
      >
        <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-surface transition-[left] duration-150 ${on ? 'left-[19px]' : 'left-[3px]'}`} />
      </span>
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {note && <span className="type-condensed block text-sm text-muted">{note}</span>}
      </span>
    </button>
  );
}
