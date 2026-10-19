import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { IpLocation, NetInfo } from './types';
import { inDesktopApp } from './useMetrics';

export type LoadState = 'loading' | 'ready' | 'error';

async function getJson(url: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Public IP + geolocation (web) and local Wi-Fi/router detail (backend). */
export function useLocation() {
  const [loc, setLoc] = useState<IpLocation | null>(null);
  const [locState, setLocState] = useState<LoadState>('loading');
  const [net, setNet] = useState<NetInfo | null>(null);
  const [netState, setNetState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLocState('loading');
    setNetState('loading');

    (async () => {
      const [geo, v4, v6] = await Promise.all([
        getJson('https://ipapi.co/json/'),
        getJson('https://api.ipify.org?format=json'),
        getJson('https://api64.ipify.org?format=json'),
      ]);
      if (cancelled) return;
      if (geo && typeof geo.latitude === 'number') {
        setLoc({
          ipv4: v4?.ip ?? geo.ip ?? '',
          ipv6: typeof v6?.ip === 'string' && v6.ip.includes(':') ? v6.ip : null,
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
        setLocState('ready');
      } else {
        setLocState('error');
      }
    })();

    if (inDesktopApp) {
      invoke<NetInfo | null>('get_network_info')
        .then((info) => {
          if (cancelled) return;
          setNet(info);
          setNetState(info ? 'ready' : 'error');
        })
        .catch(() => !cancelled && setNetState('error'));
    } else {
      setNetState('error');
    }

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { loc, locState, net, netState, retry };
}
