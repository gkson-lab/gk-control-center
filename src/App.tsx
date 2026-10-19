import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMetrics, type LinkState } from './lib/useMetrics';
import { useTheme, type ThemeChoice } from './lib/theme';
import { AchievementsProvider } from './lib/achievements';
import type { LiveMetrics } from './lib/types';
import { Tabs, type TabDef } from './components/Tabs';
import { ThemeSwitch } from './components/ThemeSwitch';
import { Dialog } from './components/Dialog';
import { FactsDrawer } from './components/FactsDrawer';
import { AchievementToast } from './components/AchievementToast';
import { Overview } from './views/Overview';
import { Hardware } from './views/Hardware';
import { Network } from './views/Network';

interface ViewContext {
  m: LiveMetrics;
  cpuTrail: number[];
  paused: boolean;
  go: (view: string, section?: string) => void;
}

interface ViewDef extends TabDef {
  render: (ctx: ViewContext) => ReactNode;
}

// The view list. Expansion packs add their views here (DESIGN.md, Navigation).
const VIEWS: ViewDef[] = [
  { id: 'overview', label: 'Overview', render: (c) => <Overview m={c.m} cpuTrail={c.cpuTrail} paused={c.paused} go={c.go} /> },
  { id: 'hardware', label: 'Hardware', render: (c) => <Hardware m={c.m} /> },
  { id: 'network', label: 'Network', render: (c) => <Network m={c.m} /> },
];

const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export default function App() {
  return (
    <AchievementsProvider>
      <Shell />
      <AchievementToast />
    </AchievementsProvider>
  );
}

function Shell() {
  const { metrics, cpuTrail, link, paused, setPaused, simulated } = useMetrics();
  const { choice, setChoice } = useTheme();
  const [view, setView] = useState('overview');
  const [section, setSection] = useState<string | null>(null);
  const [factsOpen, setFactsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const diskOps = useDiskOpsTotal(metrics);

  const go = useCallback((v: string, s?: string) => {
    setView(v);
    setSection(s ?? null);
    if (!s) window.scrollTo({ top: 0 });
  }, []);

  // Scroll to the requested section once its view has rendered.
  useEffect(() => {
    if (!section) return;
    const id = requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSection(null);
    });
    return () => cancelAnimationFrame(id);
  }, [section, view]);

  // App-wide shortcuts. Ignored while a dialog is open or a modifier is held.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || factsOpen || keysOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) go(VIEWS[n - 1].id);
      else if (e.key === 'p' || e.key === 'P') setPaused(!paused);
      else if (e.key === 't' || e.key === 'T') setChoice(THEME_ORDER[(THEME_ORDER.indexOf(choice) + 1) % THEME_ORDER.length]);
      else if ((e.key === 'f' || e.key === 'F') && metrics) setFactsOpen(true);
      else if (e.key === '?') setKeysOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [factsOpen, keysOpen, paused, setPaused, choice, setChoice, go, metrics]);

  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];

  return (
    <div className="min-h-full">
      {simulated && (
        <div className="type-condensed border-b border-line bg-sunken px-4 py-2 text-center text-sm">
          <strong>Preview with simulated readings.</strong> These numbers are not from this PC; open the GK Control Center desktop app
          for real data.
        </div>
      )}
      {link === 'lost' && (
        <div role="alert" className="type-condensed border-b border-signal bg-surface px-4 py-2 text-center text-sm">
          <strong className="text-signal">Lost contact with the collector.</strong> No readings for 4 seconds. If this doesn't clear,
          restart GK Control Center.
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-8 sm:pt-8">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="type-display m-0 text-[1.6rem]">GK Control Center</h1>
            <p className="type-condensed m-0 mt-0.5 truncate text-sm text-muted">
              {metrics?.host_name ? `${metrics.host_name} · ` : ''}
              {metrics?.os_version || 'System monitor'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusButton link={link} paused={paused} onToggle={() => setPaused(!paused)} beat={metrics} />
            <ThemeSwitch value={choice} onChange={setChoice} />
            <button
              type="button"
              onClick={() => setKeysOpen(true)}
              aria-label="Keyboard shortcuts"
              className="type-reading min-h-11 min-w-11 rounded-control border border-line text-sm text-muted hover:bg-sunken hover:text-ink"
            >
              ?
            </button>
          </div>
        </header>

        <nav className="mt-6 border-b border-line" aria-label="Views">
          <Tabs tabs={VIEWS} active={current.id} onChange={go} />
        </nav>

        <main id={`view-${current.id}`} role="tabpanel" aria-labelledby={`tab-${current.id}`} className="mt-6">
          {metrics ? (
            <div key={current.id} className="view-enter">
              {current.render({ m: metrics, cpuTrail, paused, go })}
            </div>
          ) : (
            <Waiting link={link} />
          )}
        </main>

      <footer className="type-condensed mt-10 flex items-center gap-1.5 border-t border-line pt-3 text-sm text-muted">
        made with
        <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--signal)" aria-label="love" role="img">
          <path d="M12 21s-7-4.6-9.3-9C1 8.8 2.6 5.5 6 5.5c2 0 3.2 1.1 4 2.3.8-1.2 2-2.3 4-2.3 3.4 0 5 3.3 3.3 6.5C19 16.4 12 21 12 21z" />
        </svg>
        by
        <button
          type="button"
          onClick={() => setFactsOpen(true)}
          disabled={!metrics}
          className="min-h-11 rounded-control px-1 font-semibold text-ink underline-offset-4 hover:underline disabled:text-muted"
        >
          gkson
        </button>
      </footer>
      </div>

      {metrics && <FactsDrawer open={factsOpen} onClose={() => setFactsOpen(false)} m={metrics} diskOpsTotal={diskOps} />}
      <Dialog open={keysOpen} onClose={() => setKeysOpen(false)} title="Keyboard shortcuts">
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
          {[
            [`1 to ${VIEWS.length}`, 'Switch view'],
            ['← →', 'Move between tabs, or between cores in the core grid'],
            ['P', 'Pause or resume readings'],
            ['T', 'Cycle theme: System, Light, Dark'],
            ['F', 'Open fun facts and achievements'],
            ['?', 'Show this list'],
            ['Esc', 'Close a dialog'],
          ].map(([k, d]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="type-reading rounded-chip border border-line px-2 py-0.5 text-xs">{k}</kbd>
              </dt>
              <dd className="type-condensed m-0 text-sm text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}

/**
 * Live status, which is also the pause control. The dot flashes once per
 * reading, so a steady flash means data is arriving.
 */
function StatusButton({ link, paused, onToggle, beat }: { link: LinkState; paused: boolean; onToggle: () => void; beat: object | null }) {
  const label = link === 'waiting' ? 'Connecting' : link === 'lost' ? 'Lost contact' : paused ? 'Paused' : 'Live';
  const beats = useBeatCount(beat);
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={link === 'waiting'}
      aria-pressed={paused}
      aria-label={`${label}. ${paused ? 'Resume' : 'Pause'} readings (P)`}
      className="type-condensed flex min-h-11 items-center gap-2 rounded-control border border-line px-3 text-sm hover:bg-sunken disabled:opacity-70"
    >
      <span className="flex h-2 w-2" aria-hidden>
        {paused ? (
          <span className="h-2 w-2 rounded-full border border-ink" />
        ) : (
          <span
            key={link === 'live' ? beats : link}
            className={`h-2 w-2 rounded-full ${link === 'live' ? 'beat bg-signal' : link === 'lost' ? 'bg-signal' : 'bg-muted'}`}
          />
        )}
      </span>
      {label}
      {link === 'live' && <span className="text-muted">{paused ? 'resume' : 'pause'}</span>}
    </button>
  );
}

/** Counts readings so the status dot can restart its flash on each one. */
function useBeatCount(beat: object | null): number {
  const n = useRef(0);
  const last = useRef<object | null>(null);
  if (beat && beat !== last.current) {
    last.current = beat;
    n.current += 1;
  }
  return n.current;
}

function Waiting({ link }: { link: LinkState }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <p className="type-condensed m-0 flex items-center gap-3 text-muted">
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
        {link === 'lost' ? 'Still waiting for the first reading…' : 'Waiting for the first reading from the collector…'}
      </p>
    </div>
  );
}

/** Running tally of completed disk operations since launch (for the facts drawer). */
function useDiskOpsTotal(m: LiveMetrics | null): number {
  const acc = useRef({ total: 0, last: 0 });
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!m) return;
    const now = performance.now();
    if (acc.current.last) {
      acc.current.total += (m.disk_io.reads_per_sec + m.disk_io.writes_per_sec) * ((now - acc.current.last) / 1000);
      setTotal(acc.current.total);
    }
    acc.current.last = now;
  }, [m]);
  return total;
}
