import type { ThemeChoice } from '../lib/theme';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Three-way theme control; arrow keys move between options (radio group). */
export function ThemeSwitch({ value, onChange }: { value: ThemeChoice; onChange: (v: ThemeChoice) => void }) {
  const index = OPTIONS.findIndex((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="relative grid grid-cols-3 rounded-control border border-line bg-sunken p-[3px]"
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = OPTIONS[(index + dir + OPTIONS.length) % OPTIONS.length];
        onChange(next.value);
        (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {/* Sliding thumb: the one rounded shape in the header (DESIGN.md, Radius). */}
      <span
        aria-hidden
        className="absolute bottom-[3px] top-[3px] rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.12)] transition-[left] duration-200"
        style={{ width: 'calc((100% - 6px) / 3)', left: `calc(3px + ${index} * (100% - 6px) / 3)` }}
      />
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-value={o.value}
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={`type-condensed relative z-10 min-h-11 rounded-full px-3 text-sm transition-colors ${
            o.value === value ? 'text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
