import { useState, type ReactNode } from 'react';
import { Chip, Panel } from '../components/Panel';
import { Scale } from '../components/Scale';
import { Trail } from '../components/Trail';
import { Odometer } from '../components/Odometer';
import { Dialog } from '../components/Dialog';
import { HOT_LOAD, HOT_TEMP, clamp, formatRate, formatUptime } from '../lib/format';
import { DEFAULT_LAYOUT, moveRow, toggle, useLayout, type Layout, type PartId, type RowId } from '../lib/layout';
import type { LiveMetrics } from '../lib/types';

interface OverviewProps {
  m: LiveMetrics;
  cpuTrail: number[];
  paused: boolean;
  /** Jump to another view and scroll to one of its sections. */
  go: (view: string, section?: string) => void;
}

const ROW_NAMES: Record<RowId, string> = { memory: 'Memory', graphics: 'Graphics', disk: 'Disk', network: 'Network' };
const PART_NAMES: Record<PartId, string> = {
  processor: 'Processor load panel',
  trail: '60-second trail (inside the processor panel)',
  rows: '"Right now" list',
  runtime: 'Session runtime odometer',
};

export function Overview({ m, cpuTrail, paused, go }: OverviewProps) {
  const { layout, setLayout } = useLayout();
  const [customizing, setCustomizing] = useState(false);
  const hidden = (p: PartId) => layout.hiddenParts.includes(p);
  const rows = layout.rows.filter((r) => !layout.hiddenRows.includes(r));
  const showProcessor = !hidden('processor');
  const showRows = !hidden('rows') && rows.length > 0;
  const nothing = !showProcessor && !showRows && hidden('runtime');

  return (
    <div className="grid gap-5">
      <div className="-mt-2 flex justify-end">
        <button type="button" onClick={() => setCustomizing(true)} className="min-h-11 rounded-control border border-line px-4 text-sm font-medium hover:bg-sunken">
          Customize
        </button>
      </div>

      {nothing && (
        <Panel title="Everything is hidden">
          <p className="type-condensed m-0 text-sm text-muted">You've switched off every part of the Overview. Open Customize to bring some back.</p>
        </Panel>
      )}

      {(showProcessor || showRows) && (
        <div className={`grid gap-5 ${showProcessor && showRows ? 'lg:grid-cols-[1.4fr_1fr]' : ''}`}>
          {showProcessor && <ProcessorPanel m={m} cpuTrail={cpuTrail} showTrail={!hidden('trail')} go={go} />}
          {showRows && (
            <Panel title="Right now">
              <ul className={`m-0 grid list-none gap-1 p-0 ${showProcessor ? '' : 'md:grid-cols-2'}`}>
                {rows.map((r) => (
                  <OverviewRow key={r} id={r} m={m} go={go} />
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      {!hidden('runtime') && (
        <Panel title="Session runtime" aside={<Chip>Uptime {formatUptime(m.uptime_seconds)}</Chip>}>
          <div className="overflow-x-auto pb-1">
            <Odometer seconds={m.odometer_total} frozen={paused} />
          </div>
          <p className="type-condensed m-0 mt-4 max-w-[52ch] text-sm text-muted">
            Seconds since gklabs Device Manager opened. It starts over from zero each launch.
          </p>
        </Panel>
      )}

      <CustomizeDialog open={customizing} onClose={() => setCustomizing(false)} layout={layout} setLayout={setLayout} />
    </div>
  );
}

function ProcessorPanel({ m, cpuTrail, showTrail, go }: { m: LiveMetrics; cpuTrail: number[]; showTrail: boolean; go: OverviewProps['go'] }) {
  const cpuHot = m.cpu_usage >= HOT_LOAD;
  const cpuTempHot = m.cpu_temp_available && m.cpu_temp_c >= HOT_TEMP;
  return (
    // Focal point: the processor readout (DESIGN.md).
    <Panel
      title="Processor load"
      aside={
        <div className="flex flex-wrap gap-1.5">
          <Chip>{(m.cpu_frequency_mhz / 1000).toFixed(2)} GHz peak core</Chip>
          <Chip hot={cpuTempHot}>{m.cpu_temp_available ? `${Math.round(m.cpu_temp_c)} °C` : 'Temp N/A'}</Chip>
        </div>
      }
    >
      <p className={`type-reading m-0 flex items-baseline text-[clamp(3.5rem,9vw,6.25rem)] leading-none ${cpuHot ? 'text-signal' : ''}`}>
        {Math.round(m.cpu_usage)}
        <span className="ml-1 text-[0.4em] text-muted">%</span>
      </p>
      <Scale value={m.cpu_usage} hotFrom={HOT_LOAD} thickness={16} className="mt-5" label="Processor load" />
      {showTrail && (
        <div className="mt-6">
          <Trail samples={cpuTrail} />
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="type-condensed m-0 text-sm text-muted">
          {m.cpu_brand || 'Processor'} · {m.logical_cores} threads
        </p>
        <button type="button" onClick={() => go('hardware', 'processor')} className="min-h-11 rounded-control border border-line px-4 text-sm font-medium hover:bg-sunken">
          See all {m.logical_cores} cores
        </button>
      </div>
    </Panel>
  );
}

function OverviewRow({ id, m, go }: { id: RowId; m: LiveMetrics; go: OverviewProps['go'] }) {
  const gpu = m.gpu;
  if (id === 'memory')
    return (
      <Row
        name="Memory"
        value={`${Math.round(m.memory_usage_percent)}%`}
        detail={`${m.used_memory_gb.toFixed(1)} of ${m.total_memory_gb.toFixed(1)} GB in use`}
        pct={m.memory_usage_percent}
        hot={m.memory_usage_percent >= HOT_LOAD}
        onOpen={() => go('hardware', 'memory')}
      />
    );
  if (id === 'graphics') {
    if (!gpu.available)
      return <Row name="Graphics" value="None" detail="No NVIDIA GPU found (nvidia-smi isn't available)" onOpen={() => go('hardware', 'graphics')} />;
    const vramPct = gpu.mem_total_mb > 0 ? (gpu.mem_used_mb / gpu.mem_total_mb) * 100 : 0;
    return (
      <Row
        name="Graphics"
        value={`${Math.round(gpu.usage)}%`}
        detail={`${Math.round(gpu.temp_c)} °C · ${(gpu.mem_used_mb / 1024).toFixed(1)} of ${(gpu.mem_total_mb / 1024).toFixed(0)} GB VRAM (${Math.round(vramPct)}%)`}
        pct={gpu.usage}
        hot={gpu.usage >= HOT_LOAD || gpu.temp_c >= HOT_TEMP}
        onOpen={() => go('hardware', 'graphics')}
      />
    );
  }
  if (id === 'disk')
    return (
      <Row
        name="Disk"
        value={`${Math.round(m.disk_io.busy_percent)}%`}
        detail={`Active · read ${m.disk_io.read_mb_per_sec.toFixed(1)} MB/s, write ${m.disk_io.write_mb_per_sec.toFixed(1)} MB/s`}
        pct={m.disk_io.busy_percent}
        hot={m.disk_io.busy_percent >= HOT_LOAD}
        onOpen={() => go('hardware', 'storage')}
      />
    );
  return <Row name="Network" value={formatRate(m.net_down_mbps)} unit="MB/s down" detail={`${formatRate(m.net_up_mbps)} MB/s up`} onOpen={() => go('network')} />;
}

function Row({
  name,
  value,
  unit,
  detail,
  pct,
  hot = false,
  onOpen,
}: {
  name: string;
  value: string;
  unit?: string;
  detail: ReactNode;
  pct?: number;
  hot?: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1.5 rounded-control px-3 py-3 text-left hover:bg-sunken">
        <span className="font-semibold">{name}</span>
        <span className={`type-reading text-xl ${hot ? 'text-signal' : ''}`}>
          {value}
          {unit && <span className="type-condensed ml-1 font-sans text-xs text-muted">{unit}</span>}
        </span>
        <span className="type-condensed col-span-2 text-sm text-muted">{detail}</span>
        {pct != null && (
          <span className="col-span-2">
            <Scale value={clamp(pct)} hotFrom={HOT_LOAD} thickness={8} ticks={20} label={`${name} ${Math.round(pct)}%`} />
          </span>
        )}
      </button>
    </li>
  );
}

/** Custom layout pack: switch parts on and off, and reorder the "Right now" rows. */
function CustomizeDialog({
  open,
  onClose,
  layout,
  setLayout,
}: {
  open: boolean;
  onClose: () => void;
  layout: Layout;
  setLayout: (l: Layout) => void;
}) {
  const [dragging, setDragging] = useState<RowId | null>(null);
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT);

  return (
    <Dialog open={open} onClose={onClose} title="Customize the Overview">
      <h3 className="type-condensed m-0 mb-2 text-sm font-semibold text-muted">Show</h3>
      <ul className="m-0 mb-5 grid list-none gap-1 p-0">
        {(Object.keys(PART_NAMES) as PartId[]).map((p) => (
          <li key={p}>
            <Check label={PART_NAMES[p]} on={!layout.hiddenParts.includes(p)} onChange={() => setLayout({ ...layout, hiddenParts: toggle(layout.hiddenParts, p) })} />
          </li>
        ))}
      </ul>

      <h3 className="type-condensed m-0 mb-1 text-sm font-semibold text-muted">"Right now" rows</h3>
      <p className="type-condensed m-0 mb-2 text-sm text-muted">Drag to reorder, or use Up and Down.</p>
      <ol className="m-0 grid list-none gap-1 p-0">
        {layout.rows.map((r, i) => (
          <li
            key={r}
            draggable
            onDragStart={(e) => {
              setDragging(r);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragging && dragging !== r) setLayout(moveRow(layout, dragging, i));
            }}
            onDragEnd={() => setDragging(null)}
            className={`flex items-center gap-2 rounded-control border px-2 ${dragging === r ? 'border-ink bg-sunken' : 'border-line'}`}
          >
            <span aria-hidden className="type-reading cursor-grab select-none px-1 text-muted">
              ⋮⋮
            </span>
            <div className="min-w-0 flex-1">
              <Check
                label={ROW_NAMES[r]}
                on={!layout.hiddenRows.includes(r)}
                onChange={() => setLayout({ ...layout, hiddenRows: toggle(layout.hiddenRows, r) })}
              />
            </div>
            <button
              type="button"
              disabled={i === 0}
              onClick={() => setLayout(moveRow(layout, r, i - 1))}
              aria-label={`Move ${ROW_NAMES[r]} up`}
              className="type-condensed min-h-11 rounded-control px-2 text-sm text-muted hover:bg-sunken hover:text-ink disabled:opacity-40"
            >
              Up
            </button>
            <button
              type="button"
              disabled={i === layout.rows.length - 1}
              onClick={() => setLayout(moveRow(layout, r, i + 1))}
              aria-label={`Move ${ROW_NAMES[r]} down`}
              className="type-condensed min-h-11 rounded-control px-2 text-sm text-muted hover:bg-sunken hover:text-ink disabled:opacity-40"
            >
              Down
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex justify-between gap-2">
        <button
          type="button"
          disabled={isDefault}
          onClick={() => setLayout(DEFAULT_LAYOUT)}
          className="min-h-11 rounded-control border border-line px-4 text-sm hover:bg-sunken disabled:opacity-40"
        >
          Reset to default
        </button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-control border border-ink bg-ink px-5 text-sm font-semibold text-[var(--paper)]">
          Done
        </button>
      </div>
    </Dialog>
  );
}

function Check({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onChange} className="flex min-h-11 w-full items-center gap-3 rounded-control px-1 text-left hover:bg-sunken">
      <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-chip border ${on ? 'border-ink bg-ink text-[var(--paper)]' : 'border-line'}`}>
        {on && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
          </svg>
        )}
      </span>
      <span className="text-[15px]">{label}</span>
    </button>
  );
}
