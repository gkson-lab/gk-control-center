interface GaugeProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  available?: boolean;
  isDark: boolean;
}

/**
 * Monochrome radial gauge — Apple Activity-ring inspired, drawn with SVG.
 * The progress arc animates smoothly between backend updates.
 */
export function Gauge({ label, value, max, unit, available = true, isDark }: GaugeProps) {
  const size = 128;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const offset = circumference * (1 - pct / 100);

  const track = isDark ? '#2c2c29' : '#e8e6dc';
  const fg = isDark ? '#faf9f5' : '#141413';
  const valueText = isDark ? 'text-[#faf9f5]' : 'text-[#141413]';
  const labelText = isDark ? 'text-[#8a8881]' : 'text-[#b0aea5]';

  return (
    <div className="flex flex-col items-center gap-3.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
          {available && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={fg}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {available ? (
            <span className={`font-display text-3xl font-semibold tabular-nums tracking-tight ${valueText}`}>
              {Math.round(value)}
              <span className="text-base font-normal">{unit}</span>
            </span>
          ) : (
            <span className={`text-xs font-medium uppercase tracking-wider ${labelText}`}>N/A</span>
          )}
        </div>
      </div>
      <span className={`text-[11px] font-medium uppercase tracking-[0.14em] ${labelText}`}>{label}</span>
    </div>
  );
}
