import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 'center' for dialogs, 'left' for the slide-in drawer. */
  placement?: 'center' | 'left';
  children: ReactNode;
}

/**
 * Modal surface: Escape and the backdrop close it, focus moves in on open,
 * stays inside while open, and returns to the opener on close (R-32).
 */
export function Dialog({ open, onClose, title, placement = 'center', children }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = Array.from(
          panel.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'),
        ).filter((el) => !el.hasAttribute('disabled'));
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      opener.current?.focus?.();
    };
  }, [open, onClose]);

  const left = placement === 'left';

  return (
    // `invisible` (after the 220 ms slide) takes the closed panel out of the tab
    // order. Opening has no visibility delay, so focus can move in at once.
    <div
      className={`fixed inset-0 z-50 ${open ? 'visible' : 'pointer-events-none invisible transition-[visibility] duration-[220ms]'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-[rgb(18_14_13/0.38)] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`shadow-lifted absolute flex flex-col border-line bg-surface transition-[transform,opacity] duration-[220ms] ease-out ${
          left
            ? `left-0 top-0 h-full w-[22rem] max-w-[90vw] border-r ${open ? 'translate-x-0' : '-translate-x-full'}`
            : `left-1/2 top-1/2 max-h-[85vh] w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-panel border ${
                open ? '-translate-y-1/2 opacity-100' : '-translate-y-[45%] opacity-0'
              }`
        }`}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 px-5 pb-2 pt-4">
          <h2 className="type-display text-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="type-condensed min-h-11 rounded-control px-3 text-sm text-muted hover:bg-sunken hover:text-ink"
          >
            Close <kbd className="type-reading ml-1 text-[10px]">Esc</kbd>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{open && children}</div>
      </div>
    </div>
  );
}
