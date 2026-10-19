import type { ReactNode } from 'react';
import { Chip, Panel } from '../components/Panel';
import { Scale } from '../components/Scale';
import { Trail } from '../components/Trail';
import { Odometer } from '../components/Odometer';
import { HOT_LOAD, HOT_TEMP, clamp, formatRate, formatUptime } from '../lib/format';
import type { LiveMetrics } from '../lib/types';

interface OverviewProps {
  m: LiveMetrics;
  cpuTrail: number[];
  paused: boolean;
  /** Jump to another view and scroll to one of its sections. */
  go: (view: string, section?: string) => void;
}

export function Overview({ m, cpuTrail, paused, go }: OverviewProps) {
  const cpuHot = m.cpu_usage >= HOT_LOAD;
  const cpuTempHot = m.cpu_temp_available && m.cpu_temp_c >= HOT_TEMP;
  const gpu = m.gpu;
  const vramPct = gpu.mem_total_mb > 0 ? (gpu.mem_used_mb / gpu.mem_total_mb) * 100 : 0;

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Focal point: the processor readout (DESIGN.md). */}
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
          <div className="mt-6">
            <Trail samples={cpuTrail} />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="type-condensed m-0 text-sm text-muted">
              {m.cpu_brand || 'Processor'} · {m.logical_cores} threads
            </p>
            <button
              type="button"
              onClick={() => go('hardware', 'processor')}
              className="min-h-11 rounded-control border border-line px-4 text-sm font-medium hover:bg-sunken"
            >
              See all {m.logical_cores} cores
            </button>
          </div>
        </Panel>

        <Panel title="Right now">
          <ul className="m-0 grid list-none gap-1 p-0">
            <Row
              name="Memory"
              value={`${Math.round(m.memory_usage_percent)}%`}
              detail={`${m.used_memory_gb.toFixed(1)} of ${m.total_memory_gb.toFixed(1)} GB in use`}
              pct={m.memory_usage_percent}
              hot={m.memory_usage_percent >= HOT_LOAD}
              onOpen={() => go('hardware', 'memory')}
            />
            {gpu.available ? (
              <Row
                name="Graphics"
                value={`${Math.round(gpu.usage)}%`}
                detail={`${Math.round(gpu.temp_c)} °C · ${(gpu.mem_used_mb / 1024).toFixed(1)} of ${(gpu.mem_total_mb / 1024).toFixed(0)} GB VRAM (${Math.round(vramPct)}%)`}
                pct={gpu.usage}
                hot={gpu.usage >= HOT_LOAD || gpu.temp_c >= HOT_TEMP}
                onOpen={() => go('hardware', 'graphics')}
              />
            ) : (
              <Row name="Graphics" value="None" detail="No NVIDIA GPU found (nvidia-smi isn't available)" onOpen={() => go('hardware', 'graphics')} />
            )}
            <Row
              name="Disk"
              value={`${Math.round(m.disk_io.busy_percent)}%`}
              detail={`Active · read ${m.disk_io.read_mb_per_sec.toFixed(1)} MB/s, write ${m.disk_io.write_mb_per_sec.toFixed(1)} MB/s`}
              pct={m.disk_io.busy_percent}
              hot={m.disk_io.busy_percent >= HOT_LOAD}
              onOpen={() => go('hardware', 'storage')}
            />
            <Row
              name="Network"
              value={formatRate(m.net_down_mbps)}
              unit="MB/s down"
              detail={`${formatRate(m.net_up_mbps)} MB/s up`}
              onOpen={() => go('network')}
            />
          </ul>
        </Panel>
      </div>

      <Panel title="Session runtime" aside={<Chip>Uptime {formatUptime(m.uptime_seconds)}</Chip>}>
        <div className="overflow-x-auto pb-1">
          <Odometer seconds={m.odometer_total} frozen={paused} />
        </div>
        <p className="type-condensed m-0 mt-4 max-w-[52ch] text-sm text-muted">
          Seconds since GK Control Center opened. It starts over from zero each launch.
        </p>
      </Panel>
    </div>
  );
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
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1.5 rounded-control px-3 py-3 text-left hover:bg-sunken"
      >
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
