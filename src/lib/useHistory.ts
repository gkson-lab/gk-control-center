import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { inDesktopApp } from './useMetrics';

export interface HistorySample {
  t: number;
  cpu: number;
  mem: number;
  gpu: number;
  gpu_temp: number;
  cpu_temp: number;
  disk: number;
  down: number;
  up: number;
  top: string;
}

export type HistoryState = 'loading' | 'ready' | 'error';

/** Polls the backend's history store for the chosen range. */
export function useHistory(rangeSecs: number) {
  const [samples, setSamples] = useState<HistorySample[]>([]);
  const [state, setState] = useState<HistoryState>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    const load = async () => {
      try {
        const data = inDesktopApp ? await invoke<HistorySample[]>('get_history', { rangeSecs }) : simulate(rangeSecs);
        if (cancelled) return;
        setSamples(data);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    };
    load();
    const id = window.setInterval(load, rangeSecs <= 3600 ? 2000 : 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [rangeSecs]);

  return { samples, state };
}

// Browser preview only: a deterministic made-up history, labelled as simulated.
function simulate(rangeSecs: number): HistorySample[] {
  const now = Math.floor(Date.now() / 1000);
  const n = 240;
  const names = ['chrome.exe', 'Code.exe', 'game.exe', 'explorer.exe'];
  return Array.from({ length: n }, (_, i) => {
    const t = now - rangeSecs + Math.round((i / (n - 1)) * rangeSecs);
    const wave = Math.sin(i / 9) * 18 + Math.sin(i / 3.7) * 6;
    const spike = i % 61 === 40 ? 55 : 0;
    const cpu = Math.max(2, Math.min(100, 24 + wave + spike));
    return {
      t,
      cpu,
      mem: 48 + Math.sin(i / 40) * 6,
      gpu: Math.max(0, 15 + Math.sin(i / 12) * 14 + (spike ? 40 : 0)),
      gpu_temp: 46 + Math.sin(i / 20) * 6 + (spike ? 12 : 0),
      cpu_temp: 44 + cpu * 0.3,
      disk: Math.max(0, 6 + Math.sin(i / 5) * 5),
      down: Math.max(0, 0.6 + Math.sin(i / 7) * 0.5),
      up: 0.1,
      top: names[spike ? 2 : i % 3],
    };
  });
}
