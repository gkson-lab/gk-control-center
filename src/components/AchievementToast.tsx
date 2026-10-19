import { useAchievements } from '../lib/achievements';

/** Drops in from the top when an achievement unlocks; click to dismiss. */
export function AchievementToast() {
  const { toast, dismissToast } = useAchievements();
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite" className="toast-enter fixed left-1/2 top-5 z-[60] -translate-x-1/2">
      <button
        type="button"
        onClick={dismissToast}
        className="shadow-lifted flex max-w-[calc(100vw-2rem)] items-center gap-4 rounded-panel border border-signal bg-surface py-3 pl-3 pr-5 text-left"
      >
        <TrophyMark />
        <span>
          <span className="type-condensed block text-xs text-signal">Achievement unlocked</span>
          <span className="type-display block text-[15px]">{toast.title}</span>
          <span className="block text-[13px] text-muted">{toast.description}</span>
        </span>
      </button>
    </div>
  );
}

/** Trophy cup drawn for the app: the achievement mark used in the toast and drawer. */
export function TrophyMark({ muted = false }: { muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control border ${
        muted ? 'border-line text-muted' : 'border-signal text-signal'
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
        <path d="M7 6H4.5v1.5A3 3 0 0 0 7 10.5M17 6h2.5v1.5a3 3 0 0 1-2.5 3" />
        <path d="M12 14v3.5M8.5 20h7l-1-2.5h-5z" />
      </svg>
    </span>
  );
}
