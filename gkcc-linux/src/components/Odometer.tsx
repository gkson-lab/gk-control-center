import { useEffect, useRef, useState } from 'react';

/**
 * The odometer measures elapsed wall-clock seconds, so between backend updates
 * we can advance it locally against a high-resolution clock and re-sync each
 * time a fresh value arrives. This yields a perfectly smooth, real-time readout
 * (thousandths visibly ticking) without spamming IPC.
 */
function useLiveSeconds(serverSeconds: number | null): number {
  const base = useRef({ value: serverSeconds ?? 0, at: performance.now() });
  const [display, setDisplay] = useState(serverSeconds ?? 0);

  useEffect(() => {
    if (serverSeconds == null) return;
    base.current = { value: serverSeconds, at: performance.now() };
  }, [serverSeconds]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const { value, at } = base.current;
      setDisplay(value + (performance.now() - at) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return display;
}

interface OdometerProps {
  seconds: number | null;
  isDark: boolean;
}

export function Odometer({ seconds, isDark }: OdometerProps) {
  const live = useLiveSeconds(seconds);

  const intTile = isDark
    ? 'bg-[#141413] border-[#2c2c29] text-[#faf9f5]'
    : 'bg-[#faf9f5] border-[#e8e6dc] text-[#141413]';
  const fracTile = isDark
    ? 'bg-[#1d1d1b] border-[#2c2c29] text-[#8a8881]'
    : 'bg-white border-[#e8e6dc] text-[#b0aea5]';
  const dot = isDark ? 'text-[#8a8881]' : 'text-[#b0aea5]';

  const total = Math.max(0, live);
  const [intPart, fracPart] = total.toFixed(3).split('.');
  const intDigits = intPart.padStart(6, '0').split('');
  const fracDigits = fracPart.split('');

  return (
    <div className="flex items-end gap-1 font-mono">
      {intDigits.map((d, i) => (
        <span
          key={`i-${i}`}
          className={`flex h-14 w-10 items-center justify-center rounded-xl border text-3xl font-semibold tabular-nums ${intTile}`}
        >
          {d}
        </span>
      ))}
      <span className={`px-1 pb-2 text-2xl font-bold ${dot}`}>.</span>
      {fracDigits.map((d, i) => (
        <span
          key={`f-${i}`}
          className={`flex h-11 w-8 items-center justify-center rounded-lg border text-xl font-medium tabular-nums ${fracTile}`}
        >
          {d}
        </span>
      ))}
      <span className={`ml-2 pb-2 font-sans text-[11px] uppercase tracking-[0.14em] ${dot}`}>sec</span>
    </div>
  );
}
