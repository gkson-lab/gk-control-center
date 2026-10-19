import { clamp } from '../lib/format';

interface ScaleProps {
  /** 0 to 100. */
  value: number;
  /** Ticks at or above this percentage light red instead of ink. */
  hotFrom?: number;
  ticks?: number;
  orientation?: 'horizontal' | 'vertical';
  /** Height of a horizontal scale / width of a vertical one, in px. */
  thickness?: number;
  className?: string;
  label: string;
}

/**
 * The identity motif (DESIGN.md): a ruled scale with one tick per step, filled
 * in ink up to the value, with ticks in the hot range lighting red.
 */
export function Scale({
  value,
  hotFrom = 101,
  ticks = 20,
  orientation = 'horizontal',
  thickness = 14,
  className = '',
  label,
}: ScaleProps) {
  const v = clamp(value);
  const step = 100 / ticks;
  const vertical = orientation === 'vertical';

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className={`flex gap-[3px] ${vertical ? 'h-full flex-col-reverse' : 'w-full'} ${className}`}
      style={vertical ? { width: thickness } : { height: thickness }}
    >
      {Array.from({ length: ticks }, (_, i) => {
        const at = i * step;
        const lit = v > at + step * 0.25;
        const hot = at + step > hotFrom;
        return (
          <span
            key={i}
            className="flex-1 rounded-[2px] transition-colors duration-[400ms]"
            style={{ backgroundColor: lit ? (hot ? 'var(--signal)' : 'var(--ink)') : 'var(--tick)' }}
          />
        );
      })}
    </div>
  );
}
