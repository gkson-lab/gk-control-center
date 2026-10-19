import { useMemo, useRef, useState } from 'react';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { HOT_LOAD, HOT_TEMP, formatRate } from '../lib/format';
import { useHistory, type HistorySample } from '../lib/useHistory';
import { Empty } from './Hardware';

type Range = '300' | '3600' | '86400' | '604800';
type MetricId = 'cpu' | 'mem' | 'gpu' | 'gpu_temp' | 'cpu_temp' | 'disk' | 'down';

interface MetricDef {
  id: MetricId;
  label: string;
  unit: string;
  /** Fixed top of the scale; network scales to its own peak. */
  max?: number;
  hot?: number;
  format: (v: number) => string;
}

const RANGES: { value: Range; label: string }[] = [
  { value: '300', label: '5 min' },
  { value: '3600', label: '1 hour' },
  { value: '86400', label: '24 hours' },
  { value: '604800', label: '7 days' },
];

const pct = (v: number) => `${Math.round(v)}%`;
const deg = (v: number) => `${Math.round(v)} °C`;
const METRICS: MetricDef[] = [
  { id: 'cpu', label: 'Processor', unit: '%', max: 100, hot: HOT_LOAD, format: pct },
  { id: 'mem', label: 'Memory', unit: '%', max: 100, hot: HOT_LOAD, format: pct },
  { id: 'gpu', label: 'Graphics', unit: '%', max: 100, hot: HOT_LOAD, format: pct },
  { id: 'gpu_temp', label: 'GPU temp', unit: '°C', max: 100, hot: HOT_TEMP, format: deg },
  { id: 'cpu_temp', label: 'CPU temp', unit: '°C', max: 100, hot: HOT_TEMP, format: deg },
  { id: 'disk', label: 'Disk', unit: '%', max: 100, hot: HOT_LOAD, format: pct },
  { id: 'down', label: 'Download', unit: 'MB/s', format: (v) => `${formatRate(v)} MB/s` },
];

/** Expansion pack: history. Any reading over 5 minutes to 7 days, and what was busiest when. */
export function HistoryView() {
  const [range, setRange] = useState<Range>('3600');
  const [metricId, setMetricId] = useState<MetricId>('cpu');
  const { samples, state } = useHistory(Number(range));
  const metric = METRICS.find((m) => m.id === metricId)!;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Range> label="Time range" options={RANGES} value={range} onChange={setRange} />
        <Segmented<MetricId>
          label="Reading"
          options={METRICS.map((m) => ({ value: m.id, label: m.label }))}
          value={metricId}
          onChange={setMetricId}
        />
      </div>

      {state === 'error' ? (
        <Panel title="History">
          <Empty title="Couldn't load history" body="The collector didn't answer. Restart the app if this keeps happening." />
        </Panel>
      ) : state === 'loading' && !samples.length ? (
        <Panel title="History">
          <p className="type-condensed m-0 text-sm text-muted" role="status">
            Loading history…
          </p>
        </Panel>
      ) : samples.length < 2 ? (
        <Panel title="History">
          <Empty
            title="Not enough history yet"
            body="A reading is saved every 2 seconds, and one-minute averages are kept for 7 days. Leave the app open and this fills in."
          />
        </Panel>
      ) : (
        <ChartAndPeaks samples={samples} metric={metric} range={Number(range)} />
      )}
    </div>
  );
}

function ChartAndPeaks({ samples, metric, range }: { samples: HistorySample[]; metric: MetricDef; range: number }) {
  const values = samples.map((s) => s[metric.id] as number);
  const peaks = useMemo(() => findPeaks(samples, metric.id, 5), [samples, metric.id]);
  const [cursor, setCursor] = useState<number | null>(null);
  const at = cursor != null && cursor < samples.length ? cursor : samples.length - 1;
  const s = samples[at];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const top = Math.max(...values);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {/* Focal point: the chart and the reading under the cursor. */}
      <Panel title={metric.label}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={`type-reading m-0 text-[2.5rem] leading-none ${metric.hot && (s[metric.id] as number) >= metric.hot ? 'text-signal' : ''}`}>
              {metric.format(s[metric.id] as number)}
            </p>
            <p className="type-condensed m-0 mt-2 text-sm text-muted">
              {cursor == null ? 'Latest · ' : ''}
              {formatWhen(s.t, range)}
              {s.top ? (
                <>
                  {' '}
                  · busiest: <span className="text-ink">{s.top}</span>
                </>
              ) : null}
            </p>
          </div>
          <dl className="m-0 flex gap-6">
            <div>
              <dt className="type-condensed text-xs text-muted">Average</dt>
              <dd className="type-reading m-0 text-sm">{metric.format(avg)}</dd>
            </div>
            <div>
              <dt className="type-condensed text-xs text-muted">Peak</dt>
              <dd className="type-reading m-0 text-sm">{metric.format(top)}</dd>
            </div>
          </dl>
        </div>
        <Chart samples={samples} metric={metric} cursor={at} onCursor={setCursor} range={range} />
      </Panel>

      <Panel title="Busiest moments">
        {peaks.length ? (
          <ol className="m-0 grid list-none gap-1 p-0">
            {peaks.map((p) => (
              <li key={p.index}>
                <button
                  type="button"
                  onClick={() => setCursor(p.index)}
                  className={`grid w-full grid-cols-[auto_1fr] items-baseline gap-x-3 rounded-control px-3 py-2.5 text-left hover:bg-sunken ${
                    p.index === at ? 'bg-sunken' : ''
                  }`}
                >
                  <span className={`type-reading text-[15px] ${metric.hot && p.value >= metric.hot ? 'text-signal' : ''}`}>{metric.format(p.value)}</span>
                  <span className="type-condensed truncate text-right text-sm text-muted">{formatWhen(samples[p.index].t, range)}</span>
                  <span className="type-condensed col-span-2 truncate text-sm">{samples[p.index].top || 'Busiest process unknown'}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="type-condensed m-0 text-sm text-muted">No clear peaks in this range.</p>
        )}
      </Panel>
    </div>
  );
}

function Chart({
  samples,
  metric,
  cursor,
  onCursor,
  range,
}: {
  samples: HistorySample[];
  metric: MetricDef;
  cursor: number;
  onCursor: (i: number | null) => void;
  range: number;
}) {
  const box = useRef<SVGSVGElement>(null);
  const w = 800;
  const h = 260;
  const values = samples.map((s) => s[metric.id] as number);
  const max = metric.max ?? Math.max(0.5, ...values) * 1.15;
  const t0 = samples[0].t;
  const t1 = samples[samples.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => ((t - t0) / span) * w;
  const y = (v: number) => h - (Math.min(max, Math.max(0, v)) / max) * (h - 4) - 2;
  const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(values[i]).toFixed(1)}`).join('');
  const area = `${line}L${x(t1).toFixed(1)},${h}L0,${h}Z`;
  const cx = x(samples[cursor].t);

  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const t = t0 + ((clientX - r.left) / r.width) * span;
    let best = 0;
    for (let i = 1; i < samples.length; i++) if (Math.abs(samples[i].t - t) < Math.abs(samples[best].t - t)) best = i;
    onCursor(best);
  };

  return (
    <div>
      <svg
        ref={box}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block h-[260px] w-full cursor-crosshair touch-none rounded-control"
        tabIndex={0}
        role="img"
        aria-label={`${metric.label} chart. Left and right arrow keys move the cursor; Home and End jump to the ends.`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowLeft') onCursor(Math.max(0, cursor - step));
          else if (e.key === 'ArrowRight') onCursor(Math.min(samples.length - 1, cursor + step));
          else if (e.key === 'Home') onCursor(0);
          else if (e.key === 'End') onCursor(null);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {/* Scale ticks: the motif as gridlines at each quarter. */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={w} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" vectorEffect="non-scaling-stroke" />
        ))}
        {metric.hot && metric.max && (
          <>
            <rect x={0} y={0} width={w} height={y(metric.hot)} fill="var(--signal)" opacity={0.06} />
            <line x1={0} x2={w} y1={y(metric.hot)} y2={y(metric.hot)} stroke="var(--signal)" strokeOpacity={0.4} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          </>
        )}
        <path d={area} fill="var(--ink)" opacity={0.06} />
        <path d={line} fill="none" stroke="var(--ink)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <line x1={cx} x2={cx} y1={0} y2={h} stroke="var(--ink)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
        <circle cx={cx} cy={y(values[cursor])} r={4} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="type-condensed mt-2 flex justify-between text-xs text-muted">
        <span>{formatWhen(t0, range)}</span>
        <span>
          0 to {metric.max ? metric.format(metric.max) : metric.format(max)}
        </span>
        <span>{formatWhen(t1, range)}</span>
      </div>
    </div>
  );
}

/** The highest points that are each the top of their own stretch of the chart. */
function findPeaks(samples: HistorySample[], id: MetricId, n: number) {
  const vals = samples.map((s) => s[id] as number);
  const radius = Math.max(2, Math.floor(samples.length / 24));
  const out: { index: number; value: number }[] = [];
  for (let i = 0; i < vals.length; i++) {
    let isPeak = true;
    for (let j = Math.max(0, i - radius); j <= Math.min(vals.length - 1, i + radius); j++) {
      if (vals[j] > vals[i] || (vals[j] === vals[i] && j < i)) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) out.push({ index: i, value: vals[i] });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, n);
}

function formatWhen(t: number, range: number): string {
  const d = new Date(t * 1000);
  if (range >= 86400) return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleTimeString([], range <= 3600 ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
}
