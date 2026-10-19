import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Panel, Stat } from '../components/Panel';
import { Scale } from '../components/Scale';
import { Dialog } from '../components/Dialog';
import { HOT_LOAD } from '../lib/format';
import { inDesktopApp } from '../lib/useMetrics';
import { Empty } from './Hardware';

interface Proc {
  pid: number;
  name: string;
  cpu: number;
  mem_mb: number;
  read_kbps: number;
  write_kbps: number;
  path: string;
}

type SortKey = 'name' | 'cpu' | 'mem_mb' | 'disk';
const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Name', numeric: false },
  { key: 'cpu', label: 'CPU', numeric: true },
  { key: 'mem_mb', label: 'Memory', numeric: true },
  { key: 'disk', label: 'Disk', numeric: true },
];

const disk = (p: Proc) => p.read_kbps + p.write_kbps;
const mem = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`);
const kbps = (k: number) => (k >= 1024 ? `${(k / 1024).toFixed(1)} MB/s` : `${k.toFixed(0)} KB/s`);

/** Expansion pack: process explorer. */
export function Processes({ paused }: { paused: boolean }) {
  const [procs, setProcs] = useState<Proc[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'cpu', desc: true });
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<Proc | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    const load = async () => {
      try {
        const list = inDesktopApp ? await invoke<Proc[]>('list_processes') : simulate();
        if (!cancelled) {
          setProcs(list);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    };
    load();
    const id = window.setInterval(load, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [paused]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? procs.filter((p) => p.name.toLowerCase().includes(q) || String(p.pid) === q) : procs;
    const val = (p: Proc) => (sort.key === 'disk' ? disk(p) : sort.key === 'name' ? p.name.toLowerCase() : p[sort.key]);
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.desc ? -c : c;
    });
  }, [procs, query, sort]);

  const sel = procs.find((p) => p.pid === selected) ?? null;

  const endTask = async (p: Proc) => {
    setConfirming(null);
    try {
      if (!inDesktopApp) throw new Error('The browser preview cannot end processes.');
      await invoke('end_process', { pid: p.pid });
      setNotice({ ok: true, text: `Ended ${p.name} (${p.pid}).` });
      setSelected(null);
    } catch (e) {
      setNotice({ ok: false, text: `Couldn't end ${p.name}: ${typeof e === 'string' ? e : (e as Error).message}` });
    }
  };

  return (
    <div className="grid gap-5">
      <Panel
        title="Processes"
        aside={<span className="type-condensed text-sm text-muted">{procs.length ? `${procs.length} running${paused ? ' · paused' : ''}` : ''}</span>}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="type-condensed flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
            <span className="shrink-0">Find</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or process ID"
              className="min-h-11 min-w-0 flex-1 rounded-control border border-line bg-paper px-3 text-[15px] text-ink placeholder:text-muted"
            />
          </label>
        </div>

        {notice && (
          <div role="status" className={`type-condensed mb-4 flex items-center justify-between gap-3 rounded-control border px-3 py-2 text-sm ${notice.ok ? 'border-line' : 'border-signal text-signal'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="min-h-11 rounded-control px-2 text-muted hover:text-ink">
              Dismiss
            </button>
          </div>
        )}

        {state === 'error' ? (
          <Empty title="Couldn't list processes" body="The collector didn't answer. Restart the app if this keeps happening." />
        ) : state === 'loading' ? (
          <p className="type-condensed m-0 text-sm text-muted" role="status">
            Listing processes…
          </p>
        ) : !shown.length ? (
          <Empty title="No matches" body={`Nothing running matches "${query}".`} />
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-control border border-line">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                      className={`border-b border-line p-0 ${c.numeric ? 'text-right' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.numeric }))}
                        className={`type-condensed min-h-11 w-full px-3 text-sm hover:bg-sunken ${c.numeric ? 'text-right' : 'text-left'} ${
                          sort.key === c.key ? 'font-semibold text-ink' : 'text-muted'
                        }`}
                      >
                        {c.label}
                        {sort.key === c.key && <span aria-hidden> {sort.desc ? '↓' : '↑'}</span>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((p) => {
                  const on = p.pid === selected;
                  return (
                    <tr
                      key={p.pid}
                      tabIndex={0}
                      aria-selected={on}
                      onClick={() => setSelected(p.pid)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(p.pid);
                        }
                      }}
                      className={`cursor-default border-b border-line last:border-b-0 hover:bg-sunken ${on ? 'bg-sunken' : ''}`}
                    >
                      <td className="max-w-0 px-3 py-2">
                        <span className="block truncate text-[14px]">{p.name}</span>
                        <span className="type-reading block text-[11px] text-muted">{p.pid}</span>
                      </td>
                      <td className="w-36 px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`type-reading w-12 text-right text-[13px] ${p.cpu >= HOT_LOAD ? 'text-signal' : ''}`}>{p.cpu.toFixed(1)}%</span>
                          <span className="hidden w-16 sm:block">
                            <Scale value={p.cpu} hotFrom={HOT_LOAD} ticks={10} thickness={6} label={`${p.name} CPU`} />
                          </span>
                        </div>
                      </td>
                      <td className="type-reading w-28 px-3 py-2 text-right text-[13px]">{mem(p.mem_mb)}</td>
                      <td className="type-reading w-28 px-3 py-2 text-right text-[13px]">{kbps(disk(p))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length > 300 && (
              <p className="type-condensed m-0 px-3 py-2 text-sm text-muted">Showing the first 300 of {shown.length}. Search to narrow it down.</p>
            )}
          </div>
        )}
      </Panel>

      {sel && (
        <Panel
          title={sel.name}
          aside={
            <button
              type="button"
              onClick={() => setConfirming(sel)}
              className="min-h-11 rounded-control border border-signal px-4 text-sm font-semibold text-signal hover:bg-sunken"
            >
              End task
            </button>
          }
        >
          <dl className="m-0 grid gap-x-8 sm:grid-cols-2">
            <Stat label="Process ID" value={String(sel.pid)} />
            <Stat label="CPU" value={`${sel.cpu.toFixed(1)}%`} hot={sel.cpu >= HOT_LOAD} />
            <Stat label="Memory" value={mem(sel.mem_mb)} />
            <Stat label="Disk read" value={kbps(sel.read_kbps)} />
            <Stat label="Disk write" value={kbps(sel.write_kbps)} />
            <Stat label="Location" value={sel.path || 'Not available'} />
          </dl>
        </Panel>
      )}

      <Dialog open={confirming != null} onClose={() => setConfirming(null)} title="End this process?">
        {confirming && (
          <div>
            <p className="m-0 text-[15px]">
              <strong>{confirming.name}</strong> (process {confirming.pid}) will close immediately. Anything unsaved in it will be lost.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="min-h-11 rounded-control border border-line px-4 text-sm hover:bg-sunken">
                Keep it running
              </button>
              <button
                type="button"
                onClick={() => endTask(confirming)}
                className="min-h-11 rounded-control border border-signal bg-signal px-4 text-sm font-semibold text-[var(--paper)]"
              >
                End {confirming.name}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// Browser preview only: a fixed made-up list, labelled as simulated by the app banner.
function simulate(): Proc[] {
  const names = ['chrome.exe', 'Code.exe', 'explorer.exe', 'Spotify.exe', 'svchost.exe', 'Discord.exe', 'steam.exe', 'node.exe', 'gkcc.exe'];
  return names.map((name, i) => ({
    pid: 1200 + i * 137,
    name,
    cpu: Math.max(0, (9 - i) * 1.3 + Math.random() * 3),
    mem_mb: 120 + ((i * 397) % 1400),
    read_kbps: Math.random() * 300,
    write_kbps: Math.random() * 90,
    path: `C:\\Program Files\\${name.replace('.exe', '')}\\${name}`,
  }));
}
