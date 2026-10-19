import { useState } from 'react';
import { Chip, Panel, Stat } from '../components/Panel';
import { Scale } from '../components/Scale';
import { HOT_LOAD, HOT_TEMP, clamp, formatGb, int } from '../lib/format';
import type { CoreInfo, LiveMetrics } from '../lib/types';

export function Hardware({ m }: { m: LiveMetrics }) {
  const gpu = m.gpu;
  const memHot = m.memory_usage_percent >= HOT_LOAD;

  return (
    <div className="grid gap-5">
      <Panel
        id="processor"
        title="Processor"
        aside={
          <div className="flex flex-wrap gap-1.5">
            <Chip hot={m.cpu_temp_available && m.cpu_temp_c >= HOT_TEMP}>
              {m.cpu_temp_available ? `${Math.round(m.cpu_temp_c)} °C package` : 'CPU temp N/A'}
            </Chip>
            <Chip>{m.logical_cores} threads</Chip>
          </div>
        }
      >
        <p className="type-condensed m-0 mb-5 text-sm text-muted">{m.cpu_brand || 'Processor'}</p>
        <CoreGrid cores={m.cores} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel id="graphics" title="Graphics" aside={gpu.available ? <Chip>NVIDIA</Chip> : undefined}>
          {gpu.available ? (
            <>
              <p className="type-condensed m-0 mb-4 text-sm text-muted">{gpu.name || 'NVIDIA GPU'}</p>
              <div className="mb-4 grid grid-cols-2 gap-4">
                <Big label="Load" value={`${Math.round(gpu.usage)}%`} hot={gpu.usage >= HOT_LOAD} />
                <Big label="Temperature" value={`${Math.round(gpu.temp_c)} °C`} hot={gpu.temp_c >= HOT_TEMP} />
              </div>
              <Scale value={gpu.usage} hotFrom={HOT_LOAD} thickness={10} label="GPU load" />
              <dl className="m-0 mt-4">
                <Stat label="VRAM" value={`${(gpu.mem_used_mb / 1024).toFixed(1)} / ${(gpu.mem_total_mb / 1024).toFixed(1)} GB`} />
                <Stat label="Power draw" value={`${gpu.power_w.toFixed(0)} W`} />
                <Stat label="Core clock" value={`${int(gpu.core_clock_mhz)} MHz`} />
                <Stat label="Memory clock" value={`${int(gpu.mem_clock_mhz)} MHz`} />
                <Stat label="Fan" value={`${gpu.fan_percent}%`} />
              </dl>
            </>
          ) : (
            <Empty
              title="No NVIDIA GPU found"
              body="GPU readings come from nvidia-smi, which ships with the NVIDIA driver. Integrated and AMD graphics aren't read yet."
            />
          )}
        </Panel>

        <Panel id="memory" title="Memory">
          <div className="mb-4 grid grid-cols-2 gap-4">
            <Big label="In use" value={`${Math.round(m.memory_usage_percent)}%`} hot={memHot} />
            <Big label="Of total" value={`${m.used_memory_gb.toFixed(1)} / ${m.total_memory_gb.toFixed(1)} GB`} small />
          </div>
          <Scale value={m.memory_usage_percent} hotFrom={HOT_LOAD} thickness={10} label="Memory in use" />
          <dl className="m-0 mt-4">
            <Stat label="Swap used" value={`${m.used_swap_gb.toFixed(2)} GB`} />
            <Stat label="Swap size" value={`${m.total_swap_gb.toFixed(2)} GB`} />
          </dl>
        </Panel>

        <Panel id="storage" title="Storage" aside={<Chip>{m.disks.length} {m.disks.length === 1 ? 'drive' : 'drives'}</Chip>}>
          {m.disks.length ? (
            <ul className="m-0 grid list-none gap-4 p-0">
              {m.disks.map((d) => {
                const pct = d.total_gb > 0 ? (d.used_gb / d.total_gb) * 100 : 0;
                return (
                  <li key={d.name}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="type-reading truncate text-sm">{d.name || 'Drive'}</span>
                      <span className={`type-condensed shrink-0 text-sm ${pct >= HOT_LOAD ? 'text-signal' : 'text-muted'}`}>
                        {formatGb(d.used_gb)} of {formatGb(d.total_gb)} · {Math.round(pct)}%
                      </span>
                    </div>
                    <Scale value={pct} hotFrom={HOT_LOAD} thickness={8} label={`${d.name} ${Math.round(pct)}% full`} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="No drives listed" body="The system didn't report any mounted drives." />
          )}
          <dl className="m-0 mt-5">
            <Stat label="Read" value={`${m.disk_io.read_mb_per_sec.toFixed(1)} MB/s · ${int(m.disk_io.reads_per_sec)} ops/s`} />
            <Stat label="Write" value={`${m.disk_io.write_mb_per_sec.toFixed(1)} MB/s · ${int(m.disk_io.writes_per_sec)} ops/s`} />
            <Stat label="Active time" value={`${Math.round(m.disk_io.busy_percent)}%`} hot={m.disk_io.busy_percent >= HOT_LOAD} />
          </dl>
        </Panel>

        <Panel id="scheduler" title="Scheduler">
          <dl className="m-0">
            <Stat label="Processes" value={int(m.processes)} />
            <Stat label="Threads" value={int(m.threads)} />
            <Stat label="Context switches / s" value={int(m.context_switches_per_sec)} />
            <Stat label="System calls / s" value={m.system_calls_available ? int(m.system_calls_per_sec) : 'N/A on this system'} />
          </dl>
          {m.os_version && <p className="type-condensed m-0 mt-4 text-sm text-muted">{m.os_version}</p>}
        </Panel>
      </div>
    </div>
  );
}

/**
 * One vertical scale per logical processor. Hover a column, or focus the grid
 * and use the arrow keys, to read that core's exact load and clock.
 */
function CoreGrid({ cores }: { cores: CoreInfo[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const shown = sel != null && sel < cores.length ? sel : null;
  const busiest = cores.reduce((b, c, i) => (c.usage > (cores[b]?.usage ?? -1) ? i : b), 0);
  const detail = shown ?? busiest;
  const c = cores[detail];

  if (!cores.length) return <Empty title="No per-core data" body="The system didn't report individual processors." />;

  return (
    <div>
      <div
        role="group"
        tabIndex={0}
        aria-label="Per-core load. Use the left and right arrow keys to read each core."
        className="flex items-end gap-[6px] overflow-x-auto rounded-control pb-2"
        onKeyDown={(e) => {
          const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          setSel(((shown ?? (dir > 0 ? -1 : 0)) + dir + cores.length) % cores.length);
        }}
        onBlur={() => setSel(null)}
        onMouseLeave={() => setSel(null)}
      >
        {cores.map((core, i) => (
          <div
            key={i}
            onMouseEnter={() => setSel(i)}
            className={`flex shrink-0 flex-col items-center gap-1.5 rounded-chip px-0.5 pt-1 ${shown === i ? 'bg-sunken' : ''}`}
          >
            <span className={`type-reading text-[10px] ${core.usage >= HOT_LOAD ? 'text-signal' : 'text-muted'}`}>
              {Math.round(core.usage)}
            </span>
            <div className="h-28">
              <Scale value={clamp(core.usage)} hotFrom={HOT_LOAD} ticks={14} orientation="vertical" thickness={12} label={`Core ${i}`} />
            </div>
            <span className="type-reading text-[10px] text-muted">{i}</span>
          </div>
        ))}
      </div>
      {c && (
        <p className="type-condensed m-0 mt-3 text-sm text-muted">
          {shown == null ? 'Busiest: ' : ''}
          <span className="text-ink">Core {detail}</span> · <span className="type-reading text-[13px] text-ink">{Math.round(c.usage)}%</span> at{' '}
          <span className="type-reading text-[13px] text-ink">{int(c.freq_mhz)} MHz</span>
        </p>
      )}
    </div>
  );
}

function Big({ label, value, hot = false, small = false }: { label: string; value: string; hot?: boolean; small?: boolean }) {
  return (
    <div>
      <p className={`type-reading m-0 leading-tight ${small ? 'text-lg' : 'text-[1.75rem]'} ${hot ? 'text-signal' : ''}`}>{value}</p>
      <p className="type-condensed m-0 mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-control border border-dashed border-line px-4 py-5">
      <p className="m-0 font-semibold">{title}</p>
      <p className="type-condensed m-0 mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
