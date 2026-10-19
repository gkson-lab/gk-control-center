import { useEffect, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Chip, Panel } from '../components/Panel';
import { Scale } from '../components/Scale';
import { HOT_LOAD, HOT_TEMP } from '../lib/format';
import { inDesktopApp } from '../lib/useMetrics';
import type { LiveMetrics } from '../lib/types';
import { Empty } from './Hardware';

interface ShareStatus {
  enabled: boolean;
  port: number;
  token: string;
  addresses: string[];
  error: string | null;
}

interface Machine {
  id: string;
  name: string;
  /** host:port, e.g. 192.168.1.20:47823 */
  address: string;
  token: string;
}

const KEY = 'gkcc.machines';
const readMachines = (): Machine[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** Accepts a pasted share link ("http://192.168.1.20:47823/#token=...") or a bare address. */
function parseLink(text: string): { address: string; token: string } | null {
  const t = text.trim();
  const m = t.match(/^(?:https?:\/\/)?([^/#\s]+?)(?::(\d+))?\/?(?:#token=([0-9a-f]+))?$/i);
  if (!m) return null;
  return { address: `${m[1]}:${m[2] ?? '47823'}`, token: m[3] ?? '' };
}

/** Expansion pack: multi-PC. Share this PC on the local network and watch others. */
export function Machines({ m }: { m: LiveMetrics }) {
  const [machines, setMachines] = useState<Machine[]>(readMachines);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(machines));
    } catch {
      /* kept for this session only */
    }
  }, [machines]);

  return (
    <div className="grid gap-5">
      <SharePanel />
      <div className="grid gap-5 md:grid-cols-2">
        <MachineCard name="This PC" metrics={m} state="live" />
        {machines.map((mc) => (
          <RemoteMachine key={mc.id} machine={mc} onRemove={() => setMachines((all) => all.filter((x) => x.id !== mc.id))} />
        ))}
      </div>
      <AddMachine onAdd={(mc) => setMachines((all) => [...all, mc])} />
    </div>
  );
}

function SharePanel() {
  const [st, setSt] = useState<ShareStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (inDesktopApp) invoke<ShareStatus>('share_status').then(setSt).catch(() => setErr("Couldn't read the sharing status."));
  }, []);

  if (!inDesktopApp) {
    return (
      <Panel title="Share this PC">
        <Empty title="Desktop app only" body="Sharing runs a small server inside the desktop app, so the browser preview can't turn it on." />
      </Panel>
    );
  }

  const link = st?.addresses[0] ? `http://${st.addresses[0]}:${st.port}/#token=${st.token}` : '';
  const toggle = async () => {
    if (!st) return;
    try {
      setSt(await invoke<ShareStatus>('share_set', { enabled: !st.enabled }));
    } catch (e) {
      setErr(String(e));
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("Couldn't copy. Select the link and copy it by hand.");
    }
  };

  return (
    <Panel title="Share this PC" aside={st?.enabled ? <Chip>Sharing on port {st.port}</Chip> : undefined}>
      {!st ? (
        <p className="type-condensed m-0 text-sm text-muted" role="status">
          {err ?? 'Checking…'}
        </p>
      ) : (
        <div className="grid gap-4">
          <button type="button" role="switch" aria-checked={st.enabled} onClick={toggle} className="flex min-h-11 items-start gap-3 text-left">
            <span aria-hidden className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors ${st.enabled ? 'border-ink bg-ink' : 'border-line bg-sunken'}`}>
              <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-surface transition-[left] duration-150 ${st.enabled ? 'left-[19px]' : 'left-[3px]'}`} />
            </span>
            <span>
              <span className="block text-[15px] font-medium">Let devices on my network see this PC's readings</span>
              <span className="type-condensed block text-sm text-muted">
                Only devices with the link (it includes a private token) can read anything. Windows may ask once to allow the app through its firewall: choose private networks.
              </span>
            </span>
          </button>
          {st.error && (
            <p role="alert" className="type-condensed m-0 text-sm text-signal">
              {st.error}
            </p>
          )}
          {st.enabled && link && (
            <div className="grid gap-2 rounded-control border border-line p-3">
              <span className="type-condensed text-sm text-muted">Open this on your phone, or paste it into "Add a machine" on another PC:</span>
              <code className="type-reading block break-all text-[13px]">{link}</code>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copy} className="min-h-11 rounded-control border border-line px-4 text-sm font-medium hover:bg-sunken">
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button
                  type="button"
                  onClick={async () => setSt(await invoke<ShareStatus>('share_new_token'))}
                  className="min-h-11 rounded-control border border-line px-4 text-sm hover:bg-sunken"
                >
                  New token (old links stop working)
                </button>
              </div>
            </div>
          )}
          {err && <p className="type-condensed m-0 text-sm text-signal">{err}</p>}
        </div>
      )}
    </Panel>
  );
}

function RemoteMachine({ machine, onRemove }: { machine: Machine; onRemove: () => void }) {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [state, setState] = useState<'waiting' | 'live' | 'unreachable' | 'denied'>('waiting');

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const r = await fetch(`http://${machine.address}/api/metrics?token=${encodeURIComponent(machine.token)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (r.status === 401) setState('denied');
        else {
          const data = (await r.json()) as LiveMetrics | null;
          if (data) {
            setMetrics(data);
            setState('live');
          }
        }
      } catch {
        if (!cancelled) setState('unreachable');
      }
      if (!cancelled) timer = window.setTimeout(poll, 2000);
    };
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [machine.address, machine.token]);

  return <MachineCard name={machine.name} address={machine.address} metrics={metrics} state={state} onRemove={onRemove} />;
}

function MachineCard({
  name,
  address,
  metrics: m,
  state,
  onRemove,
}: {
  name: string;
  address?: string;
  metrics: LiveMetrics | null;
  state: 'waiting' | 'live' | 'unreachable' | 'denied';
  onRemove?: () => void;
}) {
  const label = { waiting: 'Connecting…', live: 'Live', unreachable: "Can't reach it", denied: 'Token rejected' }[state];
  return (
    <Panel
      title={name}
      aside={
        <span className="flex items-center gap-2">
          <span className={`type-condensed text-sm ${state === 'live' ? 'text-muted' : 'text-signal'}`}>{label}</span>
          {onRemove && (
            <button type="button" onClick={onRemove} className="type-condensed min-h-11 rounded-control px-3 text-sm text-muted hover:bg-sunken hover:text-ink">
              Remove
            </button>
          )}
        </span>
      }
    >
      <p className="type-condensed m-0 mb-4 truncate text-sm text-muted">
        {m ? [m.host_name, m.os_version].filter(Boolean).join(' · ') : address}
      </p>
      {m && state === 'live' ? (
        <div className="grid gap-3">
          <Meter label="CPU" value={m.cpu_usage} note={m.cpu_temp_available ? `${Math.round(m.cpu_temp_c)} °C` : ''} hot={m.cpu_temp_available && m.cpu_temp_c >= HOT_TEMP} />
          <Meter label="Memory" value={m.memory_usage_percent} note={`${m.used_memory_gb.toFixed(1)} / ${m.total_memory_gb.toFixed(0)} GB`} />
          {m.gpu.available && <Meter label="GPU" value={m.gpu.usage} note={`${Math.round(m.gpu.temp_c)} °C`} hot={m.gpu.temp_c >= HOT_TEMP} />}
          <Meter label="Disk" value={m.disk_io.busy_percent} note="active" />
        </div>
      ) : state === 'denied' ? (
        <p className="type-condensed m-0 text-sm text-muted">The token was changed on that PC. Remove this machine and add it again with the new link.</p>
      ) : state === 'unreachable' ? (
        <p className="type-condensed m-0 text-sm text-muted">Check that it's on, sharing is turned on there, and both PCs are on the same network.</p>
      ) : (
        <p className="type-condensed m-0 text-sm text-muted">Waiting for its first reading…</p>
      )}
    </Panel>
  );
}

function Meter({ label, value, note, hot = false }: { label: string; value: number; note: string; hot?: boolean }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
      <span className="type-condensed text-sm text-muted">{label}</span>
      <Scale value={value} hotFrom={HOT_LOAD} thickness={8} label={`${label} ${Math.round(value)}%`} />
      <span className={`type-reading w-28 text-right text-[13px] ${value >= HOT_LOAD || hot ? 'text-signal' : ''}`}>
        {Math.round(value)}% <span className="type-condensed font-sans text-xs text-muted">{note}</span>
      </span>
    </div>
  );
}

function AddMachine({ onAdd }: { onAdd: (m: Machine) => void }) {
  const [name, setName] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseLink(link);
    if (!parsed) return setError('That doesn\'t look like a share link. It should start with http:// and end with #token=…');
    if (!parsed.token) return setError('The link is missing its token. Copy the whole link from the other PC\'s Machines tab.');
    onAdd({ id: `${Date.now()}`, name: name.trim() || parsed.address.split(':')[0], ...parsed });
    setName('');
    setLink('');
    setError(null);
  };

  return (
    <Panel title="Add a machine">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[12rem_1fr_auto] md:items-end">
        <label className="type-condensed grid gap-1 text-sm text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Living room PC"
            className="min-h-11 rounded-control border border-line bg-paper px-3 text-[15px] text-ink placeholder:text-muted"
          />
        </label>
        <label className="type-condensed grid gap-1 text-sm text-muted">
          Share link from that PC
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
            placeholder="http://192.168.1.20:47823/#token=…"
            className="type-reading min-h-11 rounded-control border border-line bg-paper px-3 text-[13px] text-ink placeholder:text-muted"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-control border border-ink bg-ink px-5 text-sm font-semibold text-[var(--paper)]">
          Add machine
        </button>
      </form>
      {error && (
        <p role="alert" className="type-condensed m-0 mt-3 text-sm text-signal">
          {error}
        </p>
      )}
    </Panel>
  );
}
