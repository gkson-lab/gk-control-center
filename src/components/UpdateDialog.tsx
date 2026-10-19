import { useEffect, useState } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { Dialog } from './Dialog';
import { inDesktopApp } from '../lib/useMetrics';

type Phase =
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; update: Update }
  | { kind: 'installing'; done: number; total: number | null }
  | { kind: 'error'; message: string };

/** Distribution pack: check GitHub releases for a newer version and install it. */
export function UpdateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [version, setVersion] = useState('');

  const run = async () => {
    setPhase({ kind: 'checking' });
    try {
      const update = await check();
      setPhase(update ? { kind: 'available', update } : { kind: 'current' });
    } catch (e) {
      setPhase({ kind: 'error', message: `Couldn't reach the update server (${String(e)}). Check your internet connection and try again.` });
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!inDesktopApp) {
      setPhase({ kind: 'error', message: 'Updates are installed by the desktop app; the browser preview has nothing to update.' });
      return;
    }
    getVersion().then(setVersion).catch(() => {});
    run();
  }, [open]);

  const install = async (update: Update) => {
    let done = 0;
    let total: number | null = null;
    setPhase({ kind: 'installing', done, total });
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === 'Started') total = ev.data.contentLength ?? null;
        if (ev.event === 'Progress') done += ev.data.chunkLength;
        setPhase({ kind: 'installing', done, total });
      });
      await relaunch();
    } catch (e) {
      setPhase({ kind: 'error', message: `The update didn't install (${String(e)}). Nothing was changed; try again later.` });
    }
  };

  const btn = 'min-h-11 rounded-control border px-4 text-sm font-medium';
  return (
    <Dialog open={open} onClose={onClose} title="Updates">
      <p className="type-condensed m-0 mb-4 text-sm text-muted">{version ? `You have version ${version}.` : 'gklabs Device Manager'}</p>
      {phase.kind === 'checking' && (
        <p className="m-0" role="status">
          Checking for a newer version…
        </p>
      )}
      {phase.kind === 'current' && (
        <div className="grid gap-4">
          <p className="m-0">You're on the latest version.</p>
          <div className="flex justify-end">
            <button type="button" onClick={run} className={`${btn} border-line hover:bg-sunken`}>
              Check again
            </button>
          </div>
        </div>
      )}
      {phase.kind === 'available' && (
        <div className="grid gap-4">
          <p className="m-0">
            Version <strong>{phase.update.version}</strong> is available.
          </p>
          {phase.update.body && <p className="type-condensed m-0 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-muted">{phase.update.body}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={`${btn} border-line hover:bg-sunken`}>
              Later
            </button>
            <button type="button" onClick={() => install(phase.update)} className={`${btn} border-ink bg-ink font-semibold text-[var(--paper)]`}>
              Install {phase.update.version} and restart
            </button>
          </div>
        </div>
      )}
      {phase.kind === 'installing' && (
        <p className="m-0" role="status">
          Downloading… {phase.total ? `${Math.round((phase.done / phase.total) * 100)}%` : `${(phase.done / 1048576).toFixed(1)} MB`}. The app restarts when it's done.
        </p>
      )}
      {phase.kind === 'error' && (
        <div className="grid gap-4">
          <p role="alert" className="m-0 text-signal">
            {phase.message}
          </p>
          {inDesktopApp && (
            <div className="flex justify-end">
              <button type="button" onClick={run} className={`${btn} border-line hover:bg-sunken`}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
