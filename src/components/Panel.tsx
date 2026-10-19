import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  /** Short context on the right of the title row (a chip, a control). */
  aside?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** A flat surface on the paper with a 1px line: no shadow (DESIGN.md, Shadow). */
export function Panel({ title, aside, id, className = '', children }: PanelProps) {
  return (
    <section id={id} aria-label={title} className={`min-w-0 scroll-mt-4 rounded-panel border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {(title || aside) && (
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {title && <h2 className="type-display text-base">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/** A small factual label, e.g. "3.6 GHz". Square-ish chip, never a pill. */
export function Chip({ children, hot = false }: { children: ReactNode; hot?: boolean }) {
  return (
    <span
      className={`type-condensed inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-xs ${
        hot ? 'border-signal text-signal' : 'border-line text-muted'
      }`}
    >
      {children}
    </span>
  );
}

/** Label/value line used in detail lists. */
export function Stat({ label, value, hot = false }: { label: string; value: ReactNode; hot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="type-condensed shrink-0 text-sm text-muted">{label}</dt>
      <dd className={`type-reading m-0 min-w-0 break-all text-right text-[13px] ${hot ? 'text-signal' : ''}`}>{value}</dd>
    </div>
  );
}
