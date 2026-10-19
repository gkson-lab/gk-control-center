import { invoke } from '@tauri-apps/api/core';
import { useMetrics } from '../lib/useMetrics';
import { useTheme } from '../lib/theme';
import { HOT_LOAD, HOT_TEMP } from '../lib/format';
import { Scale } from '../components/Scale';

/**
 * Always-on pack: the compact always-on-top window. Drag it anywhere by its
 * body; it opens in the top-right corner and remembers nothing on purpose.
 */
export function Overlay() {
  const { metrics: m, link, simulated } = useMetrics();
  useTheme();

  return (
    <div data-tauri-drag-region className="flex h-full cursor-move select-none flex-col gap-2 border border-line bg-surface p-3">
      <div data-tauri-drag-region className="flex items-center justify-between gap-2">
        <span data-tauri-drag-region className="type-display text-[13px]">
          gklabs{simulated && <span className="type-condensed ml-1.5 font-normal text-muted">simulated</span>}
        </span>
        <button
          type="button"
          onClick={() => invoke('set_overlay', { show: false })}
          aria-label="Close overlay"
          className="type-condensed -my-2 -mr-2 min-h-11 min-w-11 rounded-control px-2 text-xs text-muted hover:bg-sunken hover:text-ink"
        >
          Close
        </button>
      </div>
      {!m ? (
        <p className="type-condensed m-0 text-xs text-muted">{link === 'lost' ? 'Lost contact with the collector.' : 'Waiting for readings…'}</p>
      ) : (
        <div data-tauri-drag-region className="grid gap-2">
          <Line label="CPU" value={m.cpu_usage} extra={m.cpu_temp_available ? m.cpu_temp_c : null} />
          {m.gpu.available && <Line label="GPU" value={m.gpu.usage} extra={m.gpu.temp_c} />}
          <Line label="RAM" value={m.memory_usage_percent} extra={null} />
        </div>
      )}
    </div>
  );
}

function Line({ label, value, extra }: { label: string; value: number; extra: number | null }) {
  const hot = value >= HOT_LOAD || (extra != null && extra >= HOT_TEMP);
  return (
    <div data-tauri-drag-region className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2">
      <span data-tauri-drag-region className="type-condensed text-xs text-muted">
        {label}
      </span>
      <Scale value={value} hotFrom={HOT_LOAD} ticks={12} thickness={8} label={`${label} ${Math.round(value)}%`} />
      <span data-tauri-drag-region className={`type-reading w-[5.5rem] text-right text-[12px] ${hot ? 'text-signal' : ''}`}>
        {Math.round(value)}%{extra != null ? ` ${Math.round(extra)}°` : ''}
      </span>
    </div>
  );
}
