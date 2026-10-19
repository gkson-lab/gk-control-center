import { HOT_LOAD } from '../lib/format';
import { TRAIL_LENGTH } from '../lib/useMetrics';

interface TrailProps {
  samples: number[];
  height?: number;
}

/**
 * The last 60 seconds of a 0-100 reading, so a spike is still visible after it
 * passes (DESIGN.md, Motion). The band above the hot line is shaded so a red
 * moment is easy to spot.
 */
export function Trail({ samples, height = 72 }: TrailProps) {
  const w = 600;
  const h = height;
  const x = (i: number) => (i / (TRAIL_LENGTH - 1)) * w;
  const y = (v: number) => h - (Math.min(100, Math.max(0, v)) / 100) * (h - 2) - 1;
  const offset = TRAIL_LENGTH - samples.length;
  const pts = samples.map((v, i) => `${x(i + offset).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const peak = samples.length ? Math.max(...samples) : 0;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height: h }}
        role="img"
        aria-label={`Processor load over the last minute, peak ${Math.round(peak)}%`}
      >
        <rect x={0} y={0} width={w} height={y(HOT_LOAD)} fill="var(--signal)" opacity={0.07} />
        <line x1={0} x2={w} y1={y(HOT_LOAD)} y2={y(HOT_LOAD)} stroke="var(--signal)" strokeOpacity={0.35} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
        {samples.length > 1 && (
          <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <figcaption className="type-condensed mt-1.5 flex justify-between text-xs text-muted">
        <span>60 s ago</span>
        <span>
          Peak <span className="type-reading text-ink">{Math.round(peak)}%</span>
        </span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}
