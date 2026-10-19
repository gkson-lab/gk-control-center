import { useEffect, useRef, useState, type ReactNode } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Gauge } from './components/Gauge';
import { Odometer } from './components/Odometer';
import { CoreBars } from './components/CoreBars';
import { Globe } from './components/Globe';

interface DiskSpecs {
  name: string;
  total_gb: number;
  used_gb: number;
}

interface GpuInfo {
  available: boolean;
  name: string;
  usage: number;
  mem_used_mb: number;
  mem_total_mb: number;
  temp_c: number;
  power_w: number;
  core_clock_mhz: number;
  mem_clock_mhz: number;
  fan_percent: number;
}

interface DiskIo {
  reads_per_sec: number;
  writes_per_sec: number;
  read_mb_per_sec: number;
  write_mb_per_sec: number;
  busy_percent: number;
}

interface LiveMetrics {
  cpu_usage: number;
  cpu_brand: string;
  cpu_frequency_mhz: number;
  cpu_temp_c: number;
  cpu_temp_available: boolean;
  logical_cores: number;
  cores: { usage: number; freq_mhz: number }[];
  memory_usage_percent: number;
  total_memory_gb: number;
  used_memory_gb: number;
  total_swap_gb: number;
  used_swap_gb: number;
  net_down_mbps: number;
  net_up_mbps: number;
  processes: number;
  threads: number;
  context_switches_per_sec: number;
  system_calls_per_sec: number;
  system_calls_available: boolean;
  uptime_seconds: number;
  odometer_total: number;
  disks: DiskSpecs[];
  disk_io: DiskIo;
  gpu: GpuInfo;
  host_name: string;
  os_version: string;
}

interface IpLocation {
  ipv4: string;
  ipv6: string | null;
  city: string;
  region: string;
  country: string;
  org: string;
  asn: string;
  postal: string;
  timezone: string;
  lat: number;
  lon: number;
}

interface NetInfo {
  iface?: string | null;
  gateway?: string | null;
  localV4?: string | null;
  dns?: string[] | string | null;
  ssid?: string | null;
  bssid?: string | null;
  signal?: number | null;
  radio?: string | null;
  band?: string | null;
  channel?: string | null;
  rxMbps?: string | null;
  txMbps?: string | null;
  auth?: string | null;
}

function formatUptime(s: number): string {
  const t = Math.floor(s);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}

function App() {
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showGlobe, setShowGlobe] = useState(false);
  const [loc, setLoc] = useState<IpLocation | null>(null);
  const [net, setNet] = useState<NetInfo | null>(null);
  const [locError, setLocError] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [showAchievement, setShowAchievement] = useState(false);
  const [iopsTotal, setIopsTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen<LiveMetrics>('metrics', (event) => {
      if (!cancelled) setMetrics(event.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Gather public IP + ISP/geo (web) and local Wi-Fi/router (backend) the first
  // time the globe sidebar is opened.
  useEffect(() => {
    if (!showGlobe || loc) return;
    let cancelled = false;

    const safeJson = async (url: string) => {
      try {
        const r = await fetch(url);
        return await r.json();
      } catch {
        return null;
      }
    };

    (async () => {
      const [geo, v4, v6] = await Promise.all([
        safeJson('https://ipapi.co/json/'),
        safeJson('https://api.ipify.org?format=json'),
        safeJson('https://api64.ipify.org?format=json'),
      ]);

      if (!cancelled) {
        if (geo && geo.latitude != null) {
          const v6addr: string | null = v6?.ip && v6.ip.includes(':') ? v6.ip : null;
          setLoc({
            ipv4: v4?.ip ?? geo.ip ?? '—',
            ipv6: v6addr,
            city: geo.city ?? '',
            region: geo.region ?? '',
            country: geo.country_name ?? '',
            org: geo.org ?? '',
            asn: geo.asn ?? '',
            postal: geo.postal ?? '',
            timezone: geo.timezone ?? '',
            lat: geo.latitude,
            lon: geo.longitude,
          });
        } else {
          setLocError(true);
        }
      }
    })();

    invoke<NetInfo>('get_network_info')
      .then((info) => { if (!cancelled && info) setNet(info); })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [showGlobe, loc]);

  // Running tally of completed disk I/O operations since launch.
  const iopsRef = useRef({ total: 0, last: performance.now() });
  useEffect(() => {
    if (!metrics) return;
    const now = performance.now();
    const dt = Math.max(0, (now - iopsRef.current.last) / 1000);
    iopsRef.current.last = now;
    iopsRef.current.total += (metrics.disk_io.reads_per_sec + metrics.disk_io.writes_per_sec) * dt;
    setIopsTotal(iopsRef.current.total);
  }, [metrics]);

  const achTimer = useRef<number | undefined>(undefined);
  const triggerAchievement = () => {
    setShowAchievement(true);
    if (achTimer.current) window.clearTimeout(achTimer.current);
    achTimer.current = window.setTimeout(() => setShowAchievement(false), 5200);
  };

  const t = {
    page: isDark ? 'bg-[#141413] text-[#faf9f5]' : 'bg-[#faf9f5] text-[#141413]',
    card: isDark
      ? 'bg-[#1d1d1b] border-[#2c2c29]'
      : 'bg-white border-[#e8e6dc] shadow-[0_1px_2px_rgba(20,20,19,0.04),0_8px_24px_-12px_rgba(20,20,19,0.10)]',
    hairline: isDark ? 'border-[#2c2c29]' : 'border-[#e8e6dc]',
    muted: isDark ? 'text-[#8a8881]' : 'text-[#b0aea5]',
    subtle: isDark ? 'text-[#a3a199]' : 'text-[#8a8881]',
    divide: isDark ? 'divide-[#2c2c29]' : 'divide-[#e8e6dc]',
  };

  if (!metrics) {
    return (
      <div className={`flex min-h-screen items-center justify-center font-sans ${t.page}`}>
        <div className="flex items-center gap-3 text-sm text-[#b0aea5]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
          Initializing system link…
        </div>
      </div>
    );
  }

  const m = metrics;
  const gpu = m.gpu;
  const vramPct = gpu.mem_total_mb > 0 ? (gpu.mem_used_mb / gpu.mem_total_mb) * 100 : 0;
  const bytesStored = Math.round(m.disks.reduce((acc, d) => acc + d.used_gb, 0) * 1024 ** 3);

  const pillBase = 'h-9 px-4 rounded-full text-xs font-medium border transition-colors duration-200';
  const pillGhost = isDark
    ? `${t.hairline} text-[#a3a199] hover:bg-[#26261f] hover:text-[#faf9f5]`
    : `${t.hairline} text-[#56544e] hover:bg-[#f0eee6]`;
  const pillActive = isDark
    ? 'bg-[#faf9f5] text-[#141413] border-[#faf9f5]'
    : 'bg-[#141413] text-[#faf9f5] border-[#141413]';

  const chip = `rounded-full border px-2.5 py-1 text-[10px] font-medium tabular-nums ${t.hairline} ${t.muted}`;

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${t.page}`}>
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-8 sm:py-12">

        {/* Header */}
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
              </span>
              <h1 className="font-display text-2xl font-semibold tracking-tight">GK Control Center</h1>
            </div>
            <p className={`mt-1.5 text-[11px] font-medium uppercase tracking-[0.2em] ${t.muted}`}>
              {m.host_name ? `${m.host_name} · ` : ''}Real-time system monitor
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsDark(!isDark)} className={`${pillBase} ${pillGhost}`}>
              {isDark ? 'Light' : 'Dark'}
            </button>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`${pillBase} ${showAdvanced ? pillActive : pillGhost}`}
            >
              {showAdvanced ? 'Hide details' : 'Details'}
            </button>
          </div>
        </header>

        {/* Primary gauges */}
        <Card card={t.card} subtle={t.subtle} title="Live hardware" action={<span className={chip}>{m.cpu_frequency_mhz} MHz</span>}>
          <div className="grid grid-cols-2 gap-y-8 md:grid-cols-4">
            <Gauge label="CPU Load" value={m.cpu_usage} max={100} unit="%" isDark={isDark} />
            <Gauge label="Memory" value={m.memory_usage_percent} max={100} unit="%" isDark={isDark} />
            <Gauge label="GPU Load" value={gpu.usage} max={100} unit="%" available={gpu.available} isDark={isDark} />
            <Gauge label="GPU Temp" value={gpu.temp_c} max={100} unit="°" available={gpu.available && gpu.temp_c > 0} isDark={isDark} />
          </div>
        </Card>

        {/* CPU cores */}
        <div className="mt-6">
          <Card
            card={t.card}
            subtle={t.subtle}
            title="Processor cores"
            action={
              <div className="flex items-center gap-2">
                <span className={chip}>{m.cpu_temp_available ? `${Math.round(m.cpu_temp_c)}° CPU` : 'CPU temp N/A'}</span>
                <span className={chip}>{m.logical_cores} threads</span>
              </div>
            }
          >
            <p className={`mb-5 text-xs ${t.muted}`}>{m.cpu_brand || 'Processor'}</p>
            <CoreBars cores={m.cores} isDark={isDark} />
          </Card>
        </div>

        {/* GPU + I/O */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* GPU */}
          <Card card={t.card} subtle={t.subtle} title="Graphics" action={<span className={chip}>{gpu.available ? 'NVIDIA' : 'No GPU'}</span>}>
            {gpu.available ? (
              <>
                <p className={`mb-5 text-xs ${t.muted}`}>{gpu.name || 'NVIDIA GPU'}</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                  <Metric label="Usage" value={Math.round(gpu.usage).toString()} unit="%" muted={t.muted} />
                  <Metric label="Temp" value={Math.round(gpu.temp_c).toString()} unit="°C" muted={t.muted} />
                  <Metric label="Power" value={gpu.power_w.toFixed(0)} unit="W" muted={t.muted} />
                  <Metric label="Core clock" value={gpu.core_clock_mhz.toString()} unit="MHz" muted={t.muted} />
                  <Metric label="Mem clock" value={gpu.mem_clock_mhz.toString()} unit="MHz" muted={t.muted} />
                  <Metric label="Fan" value={gpu.fan_percent.toString()} unit="%" muted={t.muted} />
                </div>
                <div className="mt-6">
                  <div className="flex items-center justify-between text-xs">
                    <span className={t.muted}>VRAM</span>
                    <span className="tabular-nums">
                      {(gpu.mem_used_mb / 1024).toFixed(1)} / {(gpu.mem_total_mb / 1024).toFixed(1)} GB
                    </span>
                  </div>
                  <Bar pct={vramPct} isDark={isDark} />
                </div>
              </>
            ) : (
              <p className={`text-sm ${t.muted}`}>No NVIDIA GPU detected (NVML unavailable).</p>
            )}
          </Card>

          {/* Disk I/O + Network */}
          <Card card={t.card} subtle={t.subtle} title="Disk & network">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Metric label="Read IOPS" value={Math.round(m.disk_io.reads_per_sec).toString()} muted={t.muted} />
              <Metric label="Write IOPS" value={Math.round(m.disk_io.writes_per_sec).toString()} muted={t.muted} />
              <Metric label="Disk read" value={m.disk_io.read_mb_per_sec.toFixed(1)} unit="MB/s" muted={t.muted} />
              <Metric label="Disk write" value={m.disk_io.write_mb_per_sec.toFixed(1)} unit="MB/s" muted={t.muted} />
              <Metric label="Net down" value={m.net_down_mbps.toFixed(2)} unit="MB/s" muted={t.muted} />
              <Metric label="Net up" value={m.net_up_mbps.toFixed(2)} unit="MB/s" muted={t.muted} />
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs">
                <span className={t.muted}>Disk active time</span>
                <span className="tabular-nums">{Math.round(m.disk_io.busy_percent)}%</span>
              </div>
              <Bar pct={m.disk_io.busy_percent} isDark={isDark} />
            </div>
          </Card>
        </div>

        {/* Odometer */}
        <div className="mt-6">
          <Card card={t.card} subtle={t.subtle} title="Accumulated runtime" action={<span className={chip}>UPTIME {formatUptime(m.uptime_seconds)}</span>}>
            <Odometer seconds={m.odometer_total} isDark={isDark} />
            <p className={`mt-5 max-w-md text-[11px] leading-relaxed ${t.muted}`}>
              Seconds of runtime this session. The cache clears on every launch, so the odometer resets to zero each time you open the app.
            </p>
          </Card>
        </div>

        {/* Advanced detail */}
        {showAdvanced && (
          <div className="mt-6">
            <Card card={t.card} subtle={t.subtle} title="System detail">
              <div className="grid gap-8 lg:grid-cols-3">
                <div>
                  <p className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.muted}`}>Memory</p>
                  <div className={`divide-y ${t.divide}`}>
                    <Stat label="Used" value={`${m.used_memory_gb.toFixed(1)} / ${m.total_memory_gb.toFixed(1)} GB`} muted={t.muted} />
                    <Stat label="Load" value={`${m.memory_usage_percent.toFixed(1)}%`} muted={t.muted} />
                    <Stat label="Swap used" value={`${m.used_swap_gb.toFixed(2)} GB`} muted={t.muted} />
                    <Stat label="Swap total" value={`${m.total_swap_gb.toFixed(2)} GB`} muted={t.muted} />
                  </div>
                </div>

                <div>
                  <p className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.muted}`}>Scheduler</p>
                  <div className={`divide-y ${t.divide}`}>
                    <Stat label="Processes" value={m.processes.toLocaleString()} muted={t.muted} />
                    <Stat label="Threads" value={m.threads.toLocaleString()} muted={t.muted} />
                    <Stat label="Ctx switches/s" value={m.context_switches_per_sec.toLocaleString()} muted={t.muted} />
                    <Stat label="Syscalls/s" value={m.system_calls_available ? m.system_calls_per_sec.toLocaleString() : 'N/A'} muted={t.muted} />
                  </div>
                </div>

                <div>
                  <p className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.muted}`}>Storage</p>
                  <div className="space-y-3">
                    {m.disks.map((disk, i) => {
                      const pct = disk.total_gb > 0 ? (disk.used_gb / disk.total_gb) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate pr-2 font-medium">{disk.name || 'Mount'}</span>
                            <span className={`tabular-nums ${t.muted}`}>
                              {disk.used_gb.toFixed(0)}/{disk.total_gb.toFixed(0)} GB
                            </span>
                          </div>
                          <Bar pct={pct} isDark={isDark} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {m.os_version && (
                <p className={`mt-7 border-t pt-4 text-[11px] ${t.hairline} ${t.muted}`}>{m.os_version}</p>
              )}
            </Card>
          </div>
        )}

      </div>

      {/* Bottom trigger */}
      <button
        onClick={() => setShowGlobe(!showGlobe)}
        className={`fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 ${pillBase} ${
          showGlobe ? pillActive : `${t.card} ${isDark ? 'text-[#faf9f5]' : 'text-[#141413]'}`
        }`}
      >
        <GlobeIcon />
        {showGlobe ? 'Hide location' : 'Location'}
      </button>

      {/* Slide-out globe sidebar */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-[92vw] flex-col border-l transition-transform duration-300 ease-out ${t.card} ${t.hairline} ${
          showGlobe ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-6">
          <h2 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${t.subtle}`}>Your location</h2>
          <button onClick={() => setShowGlobe(false)} className={`text-xs ${t.muted} hover:underline`}>
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-24">
          <div className="flex items-center justify-center py-1">
            <Globe isDark={isDark} lat={loc?.lat ?? null} lon={loc?.lon ?? null} size={360} />
          </div>

          {loc ? (
            <div className="mt-4 space-y-6">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-xl font-semibold tracking-tight">{loc.city || 'Unknown'}</span>
                <span className={`text-xs ${t.muted}`}>{[loc.region, loc.country].filter(Boolean).join(', ')}</span>
              </div>

              <div>
                <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.muted}`}>Internet</p>
                <div className={`divide-y ${t.divide}`}>
                  <Stat label="IPv4" value={loc.ipv4} muted={t.muted} />
                  <Stat label="IPv6" value={loc.ipv6 ?? 'Not available'} muted={t.muted} />
                  <Stat label="ISP" value={loc.org || '—'} muted={t.muted} />
                  <Stat label="ASN" value={loc.asn || '—'} muted={t.muted} />
                  <Stat label="Timezone" value={loc.timezone || '—'} muted={t.muted} />
                  <Stat label="Postal" value={loc.postal || '—'} muted={t.muted} />
                  <Stat label="Coordinates" value={`${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`} muted={t.muted} />
                </div>
              </div>

              <div>
                <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.muted}`}>Wi-Fi</p>
                {net?.ssid ? (
                  <div className={`divide-y ${t.divide}`}>
                    <Stat label="Network" value={net.ssid} muted={t.muted} />
                    {net.signal != null && <Stat label="Signal" value={`${net.signal}%`} muted={t.muted} />}
                    {net.band && <Stat label="Band" value={net.band} muted={t.muted} />}
                    {net.radio && <Stat label="Radio" value={net.radio} muted={t.muted} />}
                    {net.channel && <Stat label="Channel" value={net.channel} muted={t.muted} />}
                    {net.rxMbps && <Stat label="Receive" value={`${net.rxMbps} Mbps`} muted={t.muted} />}
                    {net.txMbps && <Stat label="Transmit" value={`${net.txMbps} Mbps`} muted={t.muted} />}
                    {net.auth && <Stat label="Security" value={net.auth} muted={t.muted} />}
                    {net.bssid && <Stat label="Access point" value={net.bssid} muted={t.muted} />}
                  </div>
                ) : (
                  <p className={`text-xs ${t.muted}`}>No active Wi-Fi adapter (wired or unavailable).</p>
                )}
              </div>

              <div>
                <p className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${t.muted}`}>Router &amp; LAN</p>
                <div className={`divide-y ${t.divide}`}>
                  <Stat label="Adapter" value={net?.iface ?? '—'} muted={t.muted} />
                  <Stat label="Gateway (router)" value={net?.gateway ?? '—'} muted={t.muted} />
                  <Stat label="Local IPv4" value={net?.localV4 ?? '—'} muted={t.muted} />
                  <Stat
                    label="DNS"
                    value={(net?.dns ? (Array.isArray(net.dns) ? net.dns : [net.dns]) : []).join(', ') || '—'}
                    muted={t.muted}
                  />
                </div>
              </div>
            </div>
          ) : locError ? (
            <p className={`mt-4 text-sm ${t.muted}`}>Couldn't reach the geolocation service. Check your connection.</p>
          ) : (
            <div className="mt-4 flex items-center gap-2 text-sm text-[#b0aea5]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
              Locating…
            </div>
          )}
        </div>
      </aside>

      {/* Bottom-left credit */}
      <div className="fixed bottom-6 left-6 z-40 flex items-center gap-1.5 text-[11px]">
        <span className={t.muted}>made with</span>
        <HeartIcon />
        <span className={t.muted}>by</span>
        <button
          onClick={() => setShowFacts(!showFacts)}
          className="font-medium underline-offset-2 transition-colors hover:underline"
        >
          gkson
        </button>
      </div>

      {/* Left fun-facts sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-80 max-w-[88vw] flex-col border-r transition-transform duration-300 ease-out ${t.card} ${t.hairline} ${
          showFacts ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-6">
          <h2 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${t.subtle}`}>Fun facts</h2>
          <button onClick={() => setShowFacts(false)} className={`text-xs ${t.muted} hover:underline`}>
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6">
            <BigFact label="Bytes stored on disk" value={bytesStored.toLocaleString()} unit="B" muted={t.muted} />
            <BigFact label="Total runtime this session" value={(m.odometer_total / 3600).toFixed(2)} unit="hours" muted={t.muted} />
            <BigFact label="Disk operations completed" value={Math.round(iopsTotal).toLocaleString()} unit="ops" muted={t.muted} />
            <div className={`grid grid-cols-2 gap-4 border-t pt-5 ${t.hairline}`}>
              <BigFact label="Logical processors" value={String(m.logical_cores)} muted={t.muted} small />
              <BigFact label="Active processes" value={m.processes.toLocaleString()} muted={t.muted} small />
            </div>
          </div>
        </div>

        {/* Hidden achievement trigger — blends into the panel but stays visible */}
        <div className="shrink-0 px-6 pb-6 pt-4">
          <button
            onClick={triggerAchievement}
            aria-label="Hidden achievement"
            className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-transform hover:scale-110 ${t.hairline}`}
            style={{ color: isDark ? '#4a4943' : '#c7c4b8' }}
          >
            <TrophyIcon />
          </button>
        </div>
      </aside>

      {/* Xbox-style achievement toast */}
      <div
        className={`fixed left-1/2 top-6 z-[60] -translate-x-1/2 transition-all duration-500 ease-out ${
          showAchievement ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-24 opacity-0'
        }`}
      >
        <div className={`flex items-center gap-3 rounded-2xl border py-3 pl-3 pr-5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)] ${t.card} ${t.hairline}`}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#3b82f6', color: '#ffffff' }}>
            <TrophyIcon />
          </div>
          <div>
            <p className={`text-[9px] font-semibold uppercase tracking-[0.2em] ${t.muted}`}>Achievement Unlocked</p>
            <p className="font-display text-sm font-semibold tracking-tight">Consider this Center Controlled</p>
            <p className={`text-[11px] ${t.muted}`}>made with love by gkson</p>
          </div>
        </div>
      </div>

    </div>
  );
}

function HeartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21s-7-4.6-9.3-9C1 8.8 2.6 5.5 6 5.5c2 0 3.2 1.1 4 2.3.8-1.2 2-2.3 4-2.3 3.4 0 5 3.3 3.3 6.5C19 16.4 12 21 12 21z" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 14v3" />
      <path d="M9 20h6l-1-3h-4z" />
    </svg>
  );
}

function BigFact({
  label,
  value,
  unit,
  muted,
  small,
}: {
  label: string;
  value: string;
  unit?: string;
  muted: string;
  small?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-display ${small ? 'text-xl' : 'text-3xl'} font-semibold tabular-nums tracking-tight`}>
          {value}
        </span>
        {unit && <span className={`text-xs ${muted}`}>{unit}</span>}
      </div>
      <p className={`mt-1 text-[10px] font-medium uppercase tracking-[0.14em] ${muted}`}>{label}</p>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" />
    </svg>
  );
}

function Card({
  title,
  action,
  card,
  subtle,
  children,
}: {
  title?: string;
  action?: ReactNode;
  card: string;
  subtle: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-3xl border p-6 sm:p-7 ${card}`}>
      {(title || action) && (
        <div className="mb-6 flex items-center justify-between gap-3">
          {title && <h2 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${subtle}`}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Metric({ label, value, unit, muted }: { label: string; value: string; unit?: string; muted: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {unit && <span className={`text-xs ${muted}`}>{unit}</span>}
      </div>
      <p className={`mt-0.5 text-[10px] font-medium uppercase tracking-[0.13em] ${muted}`}>{label}</p>
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className={`shrink-0 text-xs ${muted}`}>{label}</span>
      <span className="break-all text-right text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

function Bar({ pct, isDark }: { pct: number; isDark: boolean }) {
  return (
    <div className={`mt-1.5 h-1 w-full overflow-hidden rounded-full ${isDark ? 'bg-[#2c2c29]' : 'bg-[#e8e6dc]'}`}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: isDark ? '#faf9f5' : '#141413' }}
      />
    </div>
  );
}

export default App;
