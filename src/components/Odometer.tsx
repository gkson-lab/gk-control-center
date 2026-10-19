import { useEffect, useRef, useState } from 'react';
import { useAchievements } from '../lib/achievements';

const HOLD_MS = 2000; // how long to hold before the rollover starts
const RACE_MS = 1600; // digits race to 999999.999
const SHOW_ZERO_MS = 1400; // rolled-over zeros stay up this long

/**
 * Seconds of runtime are wall-clock time, so between backend updates the
 * display advances locally against a high-resolution clock and re-syncs on
 * each fresh value: a smooth readout with no extra IPC.
 */
function useLiveSeconds(serverSeconds: number | null, frozen: boolean): number {
  const base = useRef({ value: serverSeconds ?? 0, at: performance.now() });
  const [display, setDisplay] = useState(serverSeconds ?? 0);

  useEffect(() => {
    if (serverSeconds == null) return;
    base.current = { value: serverSeconds, at: performance.now() };
  }, [serverSeconds]);

  useEffect(() => {
    if (frozen) return;
    let raf = 0;
    const loop = () => {
      const { value, at } = base.current;
      setDisplay(value + (performance.now() - at) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frozen]);

  return display;
}

type Phase = 'live' | 'holding' | 'racing' | 'rolled';

interface OdometerProps {
  seconds: number | null;
  frozen?: boolean;
}

export function Odometer({ seconds, frozen = false }: OdometerProps) {
  const live = useLiveSeconds(seconds, frozen);
  const { unlock } = useAchievements();
  const [phase, setPhase] = useState<Phase>('live');
  const [race, setRace] = useState(0);
  const timers = useRef<number[]>([]);
  const raf = useRef(0);

  const clearAll = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    cancelAnimationFrame(raf.current);
  };
  useEffect(() => clearAll, []);

  const startHold = () => {
    if (phase !== 'live') return;
    setPhase('holding');
    timers.current.push(window.setTimeout(startRace, HOLD_MS));
  };

  const cancelHold = () => {
    if (phase === 'holding') {
      clearAll();
      setPhase('live');
    }
  };

  const startRace = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = live;
    const target = 999999.999;
    const begin = performance.now();
    setPhase('racing');
    const finish = () => {
      setPhase('rolled');
      unlock('odometer-rollover');
      timers.current.push(window.setTimeout(() => setPhase('live'), SHOW_ZERO_MS));
    };
    if (reduce) return finish();
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / RACE_MS);
      // Ease-in on a log scale so every digit visibly spins up in turn.
      const v = Math.exp(Math.log(from + 1) + (Math.log(target + 1) - Math.log(from + 1)) * t * t) - 1;
      setRace(v);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else finish();
    };
    raf.current = requestAnimationFrame(tick);
  };

  const value = phase === 'racing' ? race : phase === 'rolled' ? 0 : Math.max(0, live);
  const [intPart, fracPart] = Math.min(value, 999999.999).toFixed(3).split('.');

  // Pausing within a hundredth of a whole second (.000 to .009) earns "Dead on".
  // Every second shows at least one such frame, so it's about 1 try in 100.
  const wasFrozen = useRef(frozen);
  useEffect(() => {
    if (frozen && !wasFrozen.current && phase === 'live' && fracPart.startsWith('00') && value > 0) unlock('dead-on');
    wasFrozen.current = frozen;
  }, [frozen, phase, fracPart, value, unlock]);
  const intDigits = intPart.padStart(6, '0').split('');
  const fracDigits = fracPart.split('');

  return (
    <div
      role="timer"
      tabIndex={0}
      aria-label={`Session runtime, ${Math.floor(value)} seconds`}
      className="inline-flex cursor-default touch-none select-none items-end gap-1.5 rounded-control"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancelHold();
      }}
    >
      {intDigits.map((d, i) => (
        <Drum key={`i${i}`} digit={d} size="lg" pressed={phase === 'holding'} rolled={phase === 'rolled'} />
      ))}
      <span className="type-reading pb-2 text-2xl text-muted">.</span>
      {fracDigits.map((d, i) => (
        <Drum key={`f${i}`} digit={d} size="sm" pressed={phase === 'holding'} rolled={phase === 'rolled'} />
      ))}
      <span className="type-condensed pb-2 pl-1 text-sm text-muted">s</span>
    </div>
  );
}

function Drum({ digit, size, pressed, rolled }: { digit: string; size: 'lg' | 'sm'; pressed: boolean; rolled: boolean }) {
  const lg = size === 'lg';
  return (
    <span
      className={`type-reading relative flex items-center justify-center overflow-hidden rounded-chip border bg-sunken transition-transform duration-200 ${
        lg ? 'h-16 w-11 text-[2rem]' : 'h-12 w-8 text-xl text-muted'
      } ${pressed ? 'scale-[0.96]' : ''}`}
      style={{ borderColor: rolled ? 'var(--signal)' : 'var(--line)', color: rolled ? 'var(--signal)' : undefined }}
    >
      {/* Drum frame ticks: the scale motif on the odometer (DESIGN.md). */}
      <span aria-hidden className="absolute inset-x-1.5 top-1 flex justify-between">
        {[0, 1, 2].map((t) => (
          <span key={t} className="h-1 w-px bg-tick" />
        ))}
      </span>
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line opacity-60" />
      <span className="relative">{digit}</span>
    </span>
  );
}
