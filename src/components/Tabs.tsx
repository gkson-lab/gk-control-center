export interface TabDef {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * The view list. Arrow keys move along it, and number keys 1 to 9 jump to a
 * view from anywhere in the app (wired in App). Expansion packs add views by
 * adding entries to the same list.
 */
export function Tabs({ tabs, active, onChange }: TabsProps) {
  const index = tabs.findIndex((t) => t.id === active);
  return (
    <div
      role="tablist"
      aria-label="Views"
      className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden px-1"
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = tabs[(index + dir + tabs.length) % tabs.length];
        onChange(next.id);
        document.getElementById(`tab-${next.id}`)?.focus();
      }}
    >
      {tabs.map((t, i) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`view-${t.id}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`group relative flex min-h-11 shrink-0 items-center gap-2 rounded-control px-3 text-[15px] transition-colors ${
              on ? 'text-ink' : 'text-muted hover:bg-sunken hover:text-ink'
            }`}
          >
            <span className={on ? 'font-semibold' : ''}>{t.label}</span>
            {i < 9 && (
              <kbd className="type-reading hidden rounded-chip border border-line px-1 text-[10px] text-muted sm:inline">{i + 1}</kbd>
            )}
            <span
              aria-hidden
              className={`absolute inset-x-3 bottom-0 h-[2px] rounded-full transition-opacity ${on ? 'bg-ink opacity-100' : 'opacity-0'}`}
            />
          </button>
        );
      })}
    </div>
  );
}
