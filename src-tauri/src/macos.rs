// macOS data sources. `top` gives process/thread counts and cumulative disk
// operations and bytes; the network panel uses route, ipconfig, scutil and
// system_profiler. macOS doesn't expose context switches, disk active time,
// system calls or CPU temperature to normal apps, so those stay None (N/A in
// the UI), and GPU readings stay empty (no nvidia-smi).

use super::{PsStats, POLL_INTERVAL_MS};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// "108G" → bytes. Accepts B, K, M, G, T suffixes (binary multiples, as `top` uses).
fn size_bytes(s: &str) -> Option<f64> {
    let s = s.trim();
    let (num, mult) = match s.chars().last()? {
        'B' => (&s[..s.len() - 1], 1.0),
        'K' => (&s[..s.len() - 1], 1024.0),
        'M' => (&s[..s.len() - 1], 1024.0 * 1024.0),
        'G' => (&s[..s.len() - 1], 1024.0 * 1024.0 * 1024.0),
        'T' => (&s[..s.len() - 1], 1024.0f64.powi(4)),
        _ => (s, 1.0),
    };
    num.parse::<f64>().ok().map(|n| n * mult)
}

#[derive(Debug, Default, PartialEq)]
struct TopHeader {
    processes: u32,
    threads: u32,
    /// Cumulative (read ops, read bytes, write ops, write bytes) since boot.
    disks: Option<(f64, f64, f64, f64)>,
}

/// Parses the header of `top -l 1 -n 0`:
///   Processes: 512 total, 3 running, 509 sleeping, 2391 threads
///   Disks: 3713458/108G read, 1638471/59G written.
fn parse_top(text: &str) -> TopHeader {
    let mut h = TopHeader::default();
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("Processes:") {
            for part in rest.split(',') {
                let mut w = part.split_whitespace();
                let (Some(n), Some(label)) = (w.next(), w.next()) else { continue };
                let n: u32 = n.parse().unwrap_or(0);
                match label.trim_end_matches('.') {
                    "total" => h.processes = n,
                    "threads" => h.threads = n,
                    _ => {}
                }
            }
        } else if let Some(rest) = line.strip_prefix("Disks:") {
            let pair = |seg: &str| -> Option<(f64, f64)> {
                let token = seg.split_whitespace().next()?;
                let (ops, bytes) = token.split_once('/')?;
                Some((ops.parse().ok()?, size_bytes(bytes)?))
            };
            let mut segs = rest.split(',');
            if let (Some(r), Some(w)) = (segs.next().and_then(pair), segs.next().and_then(pair)) {
                h.disks = Some((r.0, r.1, w.0, w.1));
            }
        }
    }
    h
}

pub(crate) fn poller_loop(shared: Arc<Mutex<PsStats>>) {
    let mut prev: Option<((f64, f64, f64, f64), Instant)> = None;
    loop {
        let mut stats = PsStats::default();
        if let Some(text) = run("top", &["-l", "1", "-n", "0", "-s", "0"]) {
            let h = parse_top(&text);
            stats.processes = h.processes;
            stats.threads = h.threads;
            if let Some(cur) = h.disks {
                let now = Instant::now();
                if let Some((old, at)) = prev {
                    let secs = now.duration_since(at).as_secs_f64().max(0.2);
                    let d = |a: f64, b: f64| (a - b).max(0.0) / secs;
                    stats.reads = d(cur.0, old.0);
                    stats.read_bytes = d(cur.1, old.1);
                    stats.writes = d(cur.2, old.2);
                    stats.write_bytes = d(cur.3, old.3);
                }
                prev = Some((cur, now));
            }
        }
        if let Ok(mut g) = shared.lock() {
            *g = stats;
        }
        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }
}

// ---------- Network info (sidebar) ----------

/// `route -n get default` → (gateway, interface)
fn parse_route(text: &str) -> (Option<String>, Option<String>) {
    let field = |key: &str| {
        text.lines()
            .find_map(|l| l.trim().strip_prefix(key).map(|v| v.trim().to_string()))
            .filter(|v| !v.is_empty())
    };
    (field("gateway:"), field("interface:"))
}

/// `scutil --dns` → unique nameservers, in order.
fn parse_scutil_dns(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with("nameserver[") {
            if let Some((_, v)) = l.split_once(':') {
                let v = v.trim().to_string();
                if !v.is_empty() && !out.contains(&v) {
                    out.push(v);
                }
            }
        }
    }
    out
}

#[derive(Debug, Default, PartialEq)]
struct Wifi {
    ssid: Option<String>,
    radio: Option<String>,
    channel: Option<String>,
    band: Option<String>,
    security: Option<String>,
    signal: Option<i64>,
    tx: Option<String>,
}

/// The "Current Network Information:" block of `system_profiler SPAirPortDataType`.
fn parse_airport(text: &str) -> Wifi {
    let mut w = Wifi::default();
    let mut lines = text.lines().skip_while(|l| !l.trim().starts_with("Current Network Information:"));
    if lines.next().is_none() {
        return w;
    }
    // The next line is the network name, ending in ':'.
    if let Some(name) = lines.next() {
        let n = name.trim().trim_end_matches(':').to_string();
        if !n.is_empty() {
            w.ssid = Some(n);
        }
    }
    for line in lines {
        let l = line.trim();
        if l.ends_with(':') && !l.contains(": ") {
            break; // next section ("Other Local Wi-Fi Networks:")
        }
        let Some((k, v)) = l.split_once(':') else { continue };
        let v = v.trim();
        match k.trim() {
            "PHY Mode" => w.radio = Some(v.to_string()),
            "Channel" => {
                // "149 (5GHz, 80MHz)"
                w.channel = v.split_whitespace().next().map(|c| c.to_string());
                if let Some(b) = v.split('(').nth(1).and_then(|r| r.split(',').next()) {
                    w.band = Some(b.trim().replace("GHz", " GHz"));
                }
            }
            "Security" => w.security = Some(v.to_string()),
            "Signal / Noise" => {
                let dbm: i64 = v.split_whitespace().next().and_then(|s| s.parse().ok()).unwrap_or(-100);
                w.signal = Some((2 * (dbm + 100)).clamp(0, 100));
            }
            "Transmit Rate" => w.tx = Some(v.to_string()),
            _ => {}
        }
    }
    w
}

pub(crate) fn network_info() -> serde_json::Value {
    let (gateway, iface) = run("route", &["-n", "get", "default"]).map(|t| parse_route(&t)).unwrap_or((None, None));
    let local_v4 = iface.as_deref().and_then(|i| run("ipconfig", &["getifaddr", i])).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let dns = run("scutil", &["--dns"]).map(|t| parse_scutil_dns(&t)).unwrap_or_default();
    let wifi = run("system_profiler", &["SPAirPortDataType"]).map(|t| parse_airport(&t)).unwrap_or_default();
    serde_json::json!({
        "iface": iface, "gateway": gateway, "localV4": local_v4, "dns": dns,
        "ssid": wifi.ssid, "bssid": null, "signal": wifi.signal, "radio": wifi.radio,
        "band": wifi.band, "channel": wifi.channel, "rxMbps": null, "txMbps": wifi.tx,
        "auth": wifi.security,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes() {
        assert_eq!(size_bytes("512B"), Some(512.0));
        assert_eq!(size_bytes("2K"), Some(2048.0));
        assert_eq!(size_bytes("1.5G"), Some(1.5 * 1024.0 * 1024.0 * 1024.0));
        assert_eq!(size_bytes("x"), None);
    }

    #[test]
    fn top_header() {
        let text = "Processes: 512 total, 3 running, 509 sleeping, 2391 threads \n\
                    2026/10/18 21:00:00\n\
                    Load Avg: 1.52, 1.61, 1.70\n\
                    Disks: 3713458/108G read, 1638471/59G written.\n";
        let h = parse_top(text);
        assert_eq!((h.processes, h.threads), (512, 2391));
        let (ro, rb, wo, wb) = h.disks.unwrap();
        assert_eq!((ro, wo), (3713458.0, 1638471.0));
        assert_eq!(rb, 108.0 * 1024f64.powi(3));
        assert_eq!(wb, 59.0 * 1024f64.powi(3));
        assert_eq!(parse_top("nothing useful"), TopHeader::default());
    }

    #[test]
    fn route_and_dns() {
        let route = "   route to: default\ndestination: default\n       mask: default\n    gateway: 192.168.1.1\n  interface: en0\n      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING>\n";
        assert_eq!(parse_route(route), (Some("192.168.1.1".into()), Some("en0".into())));
        let dns = "DNS configuration\n\nresolver #1\n  nameserver[0] : 192.168.1.1\n  nameserver[1] : 1.1.1.1\n\nresolver #2\n  nameserver[0] : 192.168.1.1\n";
        assert_eq!(parse_scutil_dns(dns), vec!["192.168.1.1", "1.1.1.1"]);
    }

    #[test]
    fn airport() {
        let text = "Wi-Fi:\n\n      Software Versions:\n          CoreWLAN: 16.0\n      Interfaces:\n        en0:\n          Card Type: Wi-Fi\n          Status: Connected\n          Current Network Information:\n            HomeNet:\n              PHY Mode: 802.11ax\n              Channel: 149 (5GHz, 80MHz)\n              Country Code: US\n              Network Type: Infrastructure\n              Security: WPA2 Personal\n              Signal / Noise: -52 dBm / -91 dBm\n              Transmit Rate: 1200\n          Other Local Wi-Fi Networks:\n            Neighbour:\n              PHY Mode: 802.11n\n";
        let w = parse_airport(text);
        assert_eq!(w.ssid.as_deref(), Some("HomeNet"));
        assert_eq!(w.radio.as_deref(), Some("802.11ax"));
        assert_eq!((w.channel.as_deref(), w.band.as_deref()), (Some("149"), Some("5 GHz")));
        assert_eq!(w.security.as_deref(), Some("WPA2 Personal"));
        assert_eq!(w.signal, Some(96));
        assert_eq!(w.tx.as_deref(), Some("1200"));
        assert_eq!(parse_airport("Wi-Fi:\n  Status: Off\n"), Wifi::default());
    }
}
