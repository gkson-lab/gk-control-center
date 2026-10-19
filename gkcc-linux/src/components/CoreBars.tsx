interface Core {
  usage: number;
  freq_mhz: number;
}

interface CoreBarsProps {
  cores: Core[];
  isDark: boolean;
}

/** Live vertical usage bars, one per logical processor. */
export function CoreBars({ cores, isDark }: CoreBarsProps) {
  const track = isDark ? 'bg-[#2c2c29]' : 'bg-[#e8e6dc]';
  const fill = isDark ? '#faf9f5' : '#141413';
  const label = isDark ? 'text-[#8a8881]' : 'text-[#b0aea5]';

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
      {cores.map((c, i) => (
        <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
          <span className={`text-[9px] font-medium tabular-nums ${label}`}>{Math.round(c.usage)}</span>
          <div className={`relative h-28 w-3.5 overflow-hidden rounded-full ${track}`}>
            <div
              className="absolute bottom-0 left-0 w-full rounded-full transition-[height] duration-500 ease-out"
              style={{ height: `${Math.min(100, Math.max(0, c.usage))}%`, backgroundColor: fill }}
            />
          </div>
          <span className={`text-[8px] tabular-nums ${label}`}>{i}</span>
        </div>
      ))}
    </div>
  );
}
