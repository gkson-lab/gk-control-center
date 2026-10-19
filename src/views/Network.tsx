import { Panel, Stat } from '../components/Panel';
import { Globe } from '../components/Globe';
import { formatRate } from '../lib/format';
import type { LiveMetrics } from '../lib/types';
import { useLocation } from '../lib/useLocation';
import { inDesktopApp } from '../lib/useMetrics';
import { Empty } from './Hardware';

export function Network({ m }: { m: LiveMetrics }) {
  const { loc, locState, net, netState, retry } = useLocation();
  const dns = net?.dns ? (Array.isArray(net.dns) ? net.dns : [net.dns]) : [];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Focal point: the globe and the place under it (DESIGN.md). */}
      <Panel title="Where you're connecting from">
        <div className="flex justify-center">
          <Globe lat={loc?.lat ?? null} lon={loc?.lon ?? null} size={340} />
        </div>
        <div className="mt-4 min-h-16">
          {locState === 'ready' && loc ? (
            <>
              <p className="type-display m-0 text-2xl">{loc.city || 'Unknown city'}</p>
              <p className="type-condensed m-0 mt-1 text-sm text-muted">
                {[loc.region, loc.country].filter(Boolean).join(', ')} · approximate, based on your public IP
              </p>
            </>
          ) : locState === 'loading' ? (
            <Waiting text="Looking up your public IP…" />
          ) : (
            <Problem text="Couldn't reach the location service. Check your internet connection." onRetry={retry} />
          )}
        </div>
      </Panel>

      <div className="grid content-start gap-5">
        <Panel title="Throughput">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="type-reading m-0 text-[1.75rem] leading-tight">{formatRate(m.net_down_mbps)}</p>
              <p className="type-condensed m-0 mt-1 text-sm text-muted">MB/s down</p>
            </div>
            <div>
              <p className="type-reading m-0 text-[1.75rem] leading-tight">{formatRate(m.net_up_mbps)}</p>
              <p className="type-condensed m-0 mt-1 text-sm text-muted">MB/s up</p>
            </div>
          </div>
        </Panel>

        <Panel title="Internet">
          {locState === 'ready' && loc ? (
            <dl className="m-0">
              <Stat label="IPv4" value={loc.ipv4 || 'Not available'} />
              <Stat label="IPv6" value={loc.ipv6 ?? 'Not available'} />
              <Stat label="Provider" value={loc.org || 'Unknown'} />
              <Stat label="ASN" value={loc.asn || 'Unknown'} />
              <Stat label="Time zone" value={loc.timezone || 'Unknown'} />
              <Stat label="Coordinates" value={`${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}`} />
            </dl>
          ) : locState === 'loading' ? (
            <Waiting text="Waiting for ipapi.co and ipify…" />
          ) : (
            <Problem text="No internet details without the location service." onRetry={retry} />
          )}
        </Panel>

        <Panel title="Wi-Fi and router">
          {!inDesktopApp ? (
            <Empty title="Desktop app only" body="Wi-Fi and router details come from the gklabs Device Manager backend, so the browser preview can't show them." />
          ) : netState === 'loading' ? (
            <Waiting text="Reading adapter details…" />
          ) : netState === 'error' || !net ? (
            <Problem text="Couldn't read the network adapter details." onRetry={retry} />
          ) : (
            <>
              {net.ssid ? (
                <dl className="m-0 mb-4">
                  <Stat label="Network" value={net.ssid} />
                  {net.signal != null && <Stat label="Signal" value={`${net.signal}%`} />}
                  {net.band && <Stat label="Band" value={net.band} />}
                  {net.channel && <Stat label="Channel" value={net.channel} />}
                  {net.radio && <Stat label="Standard" value={net.radio} />}
                  {net.rxMbps && <Stat label="Link speed" value={`${net.rxMbps} down / ${net.txMbps ?? '?'} up Mbps`} />}
                  {net.auth && <Stat label="Security" value={net.auth} />}
                  {net.bssid && <Stat label="Access point" value={net.bssid} />}
                </dl>
              ) : (
                <p className="type-condensed m-0 mb-4 text-sm text-muted">No Wi-Fi connection: wired, or the adapter is off.</p>
              )}
              <dl className="m-0">
                <Stat label="Adapter" value={net.iface ?? 'Unknown'} />
                <Stat label="Router" value={net.gateway ?? 'Unknown'} />
                <Stat label="Local IPv4" value={net.localV4 ?? 'Unknown'} />
                <Stat label="DNS" value={dns.join(', ') || 'Unknown'} />
              </dl>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <p className="type-condensed m-0 flex items-center gap-2 text-sm text-muted" role="status">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      {text}
    </p>
  );
}

function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
      <p className="type-condensed m-0 text-sm text-muted">{text}</p>
      <button type="button" onClick={onRetry} className="min-h-11 rounded-control border border-line px-4 text-sm font-medium hover:bg-sunken">
        Try again
      </button>
    </div>
  );
}
