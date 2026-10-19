import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { LiveMetrics } from './types';

/** True inside the desktop app; false in a plain browser tab (preview mode). */
export const inDesktopApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const STALE_AFTER_MS = 4000;
export const TRAIL_LENGTH = 120; // 60 s at the backend's 500 ms cadence

export type LinkState = 'waiting' | 'live' | 'lost';

export interface MetricsState {
  metrics: LiveMetrics | null;
  /** CPU load samples, oldest first, for the 60-second trail. */
  cpuTrail: number[];
  link: LinkState;
  paused: boolean;
  setPaused: (p: boolean) => void;
  /** Simulated readings for the browser preview; never set in the desktop app. */
  simulated: boolean;
}

export function useMetrics(): MetricsState {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [cpuTrail, setCpuTrail] = useState<number[]>([]);
  const [link, setLink] = useState<LinkState>('waiting');
  const [paused, setPaused] = useState(false);
  const lastAt = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const accept = (m: LiveMetrics) => {
      lastAt.current = performance.now();
      setLink('live');
      if (pausedRef.current) return;
      setMetrics(m);
      setCpuTrail((t) => [...t.slice(-(TRAIL_LENGTH - 1)), m.cpu_usage]);
    };

    let cancelled = false;
    let stop: (() => void) | undefined;
    if (inDesktopApp) {
      listen<LiveMetrics>('metrics', (e) => !cancelled && accept(e.payload)).then((fn) => {
        if (cancelled) fn();
        else stop = fn;
      });
    } else {
      const sim = createSimulator();
      const id = window.setInterval(() => accept(sim()), 500);
      stop = () => window.clearInterval(id);
    }

    const watchdog = window.setInterval(() => {
      if (lastAt.current && performance.now() - lastAt.current > STALE_AFTER_MS) setLink('lost');
    }, 1000);

    return () => {
      cancelled = true;
      stop?.();
      window.clearInterval(watchdog);
    };
  }, []);

  return { metrics, cpuTrail, link, paused, setPaused, simulated: !inDesktopApp };
}

// Browser preview only: a random walk so the interface can be seen and tested
// outside the desktop app. Every screen labels these readings as simulated.
function createSimulator(): () => LiveMetrics {
  const walk = (v: number, step: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * step));
  let cpu = 18;
  let mem = 46;
  let gpu = 9;
  let gpuTemp = 44;
  let busy = 3;
  let down = 0.4;
  const cores = Array.from({ length: 16 }, () => Math.random() * 20);
  const started = performance.now();
  return () => {
    cpu = walk(cpu, 14, 2, 100);
    mem = walk(mem, 1.5, 30, 96);
    gpu = walk(gpu, 10, 0, 100);
    gpuTemp = walk(gpuTemp, 1.2, 35, 92);
    busy = walk(busy, 6, 0, 100);
    down = walk(down, 0.6, 0, 40);
    const secs = (performance.now() - started) / 1000;
    return {
      cpu_usage: cpu,
      cpu_brand: 'Simulated processor',
      cpu_frequency_mhz: Math.round(3600 + cpu * 12),
      cpu_temp_c: 40 + cpu * 0.4,
      cpu_temp_available: true,
      logical_cores: cores.length,
      cores: cores.map((c, i) => {
        cores[i] = walk(c, 22, 0, 100);
        return { usage: cores[i], freq_mhz: Math.round(3400 + cores[i] * 15) };
      }),
      memory_usage_percent: mem,
      total_memory_gb: 32,
      used_memory_gb: (32 * mem) / 100,
      total_swap_gb: 8,
      used_swap_gb: 0.6,
      net_down_mbps: down,
      net_up_mbps: down / 6,
      processes: 312,
      threads: 4120,
      context_switches_per_sec: Math.round(40000 + cpu * 900),
      system_calls_per_sec: Math.round(180000 + cpu * 4000),
      system_calls_available: true,
      uptime_seconds: secs,
      odometer_total: secs,
      disks: [
        { name: 'C:\\', total_gb: 931.5, used_gb: 512.2 },
        { name: 'D:\\', total_gb: 1863, used_gb: 1702.4 },
      ],
      disk_io: {
        reads_per_sec: busy * 4,
        writes_per_sec: busy * 2,
        read_mb_per_sec: busy * 0.8,
        write_mb_per_sec: busy * 0.3,
        busy_percent: busy,
      },
      gpu: {
        available: true,
        name: 'Simulated GPU',
        usage: gpu,
        mem_used_mb: 2100 + gpu * 40,
        mem_total_mb: 16384,
        temp_c: gpuTemp,
        power_w: 18 + gpu * 1.9,
        core_clock_mhz: Math.round(1100 + gpu * 15),
        mem_clock_mhz: 7001,
        fan_percent: Math.round(Math.max(0, gpuTemp - 50) * 2),
      },
      host_name: 'preview',
      os_version: 'Browser preview',
    };
  };
}
