export const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

// Hot thresholds from DESIGN.md: these are the only readings that turn red.
export const HOT_LOAD = 90;
export const HOT_TEMP = 85;

export function formatUptime(s: number): string {
  const t = Math.floor(s);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}

export function formatRate(mbps: number): string {
  if (mbps >= 100) return mbps.toFixed(0);
  if (mbps >= 10) return mbps.toFixed(1);
  return mbps.toFixed(2);
}

export function formatGb(gb: number): string {
  return gb >= 1000 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

export const int = (n: number) => Math.round(n).toLocaleString();
