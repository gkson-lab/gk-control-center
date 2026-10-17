// Linux data sources. These replace the PowerShell / CIM / netsh shell-outs used
// on Windows with direct reads of /proc and /sys, sysinfo's hwmon sensors, and
// the standard `nvidia-smi`, `ip`, `iw` and `nmcli` tools. Every source degrades
// gracefully: a missing file or tool just leaves that field empty.

use super::{PsGpu, PsStats, POLL_INTERVAL_MS};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::Components;

const SECTOR_BYTES: f64 = 512.0; // /proc/diskstats always counts 512-byte sectors

// ---------- Small helpers ----------

fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(cmd).args(args).output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        None
    }
}

/// Parses a number out of a string like "42 %", "20.25 W" or "[N/A]" (→ 0).
fn num(s: &str) -> f64 {
    let cleaned: String = s.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect();
    cleaned.parse().unwrap_or(0.0)
}

// ---------- Disk I/O (/proc/diskstats) ----------

#[derive(Clone, Copy, Default, Debug, PartialEq)]
struct DiskCounters {
    reads: u64,
    writes: u64,
    read_sectors: u64,
    write_sectors: u64,
    io_ticks_ms: u64,
}

/// Physical whole disks only (no partitions, loop, ram, zram or device-mapper),
/// so activity is not double counted.
fn is_physical_disk(name: &str) -> bool {
    Path::new("/sys/block").join(name).join("device").exists()
}

fn parse_diskstats(text: &str, keep: impl Fn(&str) -> bool) -> HashMap<String, DiskCounters> {
    let mut out = HashMap::new();
    for line in text.lines() {
        let f: Vec<&str> = line.split_whitespace().collect();
        if f.len() < 14 || !keep(f[2]) {
            continue;
        }
        let n = |i: usize| f[i].parse::<u64>().unwrap_or(0);
        out.insert(
            f[2].to_string(),
            DiskCounters {
                reads: n(3),
                read_sectors: n(5),
                writes: n(7),
                write_sectors: n(9),
                io_ticks_ms: n(12),
            },
        );
    }
    out
}

// ---------- Scheduler counters (/proc) ----------

/// Total context switches since boot, from the `ctxt` line of /proc/stat.
fn parse_ctxt(stat: &str) -> Option<u64> {
    stat.lines()
        .find_map(|l| l.strip_prefix("ctxt "))
        .and_then(|v| v.trim().parse().ok())
}

/// Total threads (kernel scheduling entities), the "total" half of the
/// running/total field in /proc/loadavg.
fn parse_loadavg_threads(loadavg: &str) -> Option<u32> {
    loadavg
        .split_whitespace()
        .nth(3)
        .and_then(|f| f.split('/').nth(1))
        .and_then(|t| t.parse().ok())
}

fn count_processes() -> u32 {
    fs::read_dir("/proc")
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_name().to_string_lossy().bytes().all(|b| b.is_ascii_digit()))
                .count() as u32
        })
        .unwrap_or(0)
}

// ---------- CPU temperature (hwmon via sysinfo) ----------

/// Picks the CPU package temperature from hwmon sensor labels, e.g.
/// "coretemp Package id 0" (Intel), "k10temp Tctl" (AMD), "cpu_thermal temp1" (ARM).
fn pick_cpu_temp<'a>(sensors: impl Iterator<Item = (&'a str, f32)> + Clone) -> Option<f64> {
    let valid = |t: f32| t.is_finite() && t > 0.0 && t < 150.0;
    let by = |pat: &[&str]| {
        sensors.clone().find(|(label, t)| {
            let l = label.to_ascii_lowercase();
            valid(*t) && pat.iter().any(|p| l.contains(p))
        })
    };
    by(&["package", "tctl", "tdie"])
        .or_else(|| by(&["coretemp", "k10temp", "zenpower", "cpu_thermal", "cpu"]))
        .map(|(_, t)| t as f64)
}

// ---------- GPU (nvidia-smi) ----------

const NVIDIA_QUERY: &str = "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.current.graphics,clocks.current.memory,fan.speed";

fn parse_nvidia_smi(csv: &str) -> Option<PsGpu> {
    let line = csv.lines().find(|l| !l.trim().is_empty())?;
    let p: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if p.len() < 9 {
        return None;
    }
    Some(PsGpu {
        name: p[0].to_string(),
        usage: num(p[1]),
        temp: num(p[2]),
        mem_used: num(p[3]),
        mem_total: num(p[4]),
        power: num(p[5]),
        core_clock: num(p[6]),
        mem_clock: num(p[7]),
        fan: num(p[8]),
    })
}

fn read_gpu() -> Option<PsGpu> {
    run("nvidia-smi", &[NVIDIA_QUERY, "--format=csv,noheader,nounits"])
        .and_then(|out| parse_nvidia_smi(&out))
}

// ---------- Poller ----------

pub(crate) fn poller_loop(shared: Arc<Mutex<PsStats>>) {
    let mut components = Components::new_with_refreshed_list();
    let mut prev_disks: Option<HashMap<String, DiskCounters>> = None;
    let mut prev_ctxt: Option<u64> = None;
    let mut prev_time = Instant::now();
    // Skip nvidia-smi entirely after the first failure (no driver installed).
    let mut gpu_present = true;

    loop {
        let now = Instant::now();
        let secs = now.duration_since(prev_time).as_secs_f64().max(1e-3);
        prev_time = now;

        let mut stats = PsStats::default();

        // Disk I/O rates from counter deltas.
        let disks = fs::read_to_string("/proc/diskstats")
            .map(|t| parse_diskstats(&t, is_physical_disk))
            .unwrap_or_default();
        if let Some(prev) = &prev_disks {
            let mut max_busy = 0.0f64;
            for (name, cur) in &disks {
                let Some(old) = prev.get(name) else { continue };
                let d = |a: u64, b: u64| a.saturating_sub(b) as f64;
                stats.reads += d(cur.reads, old.reads) / secs;
                stats.writes += d(cur.writes, old.writes) / secs;
                stats.read_bytes += d(cur.read_sectors, old.read_sectors) * SECTOR_BYTES / secs;
                stats.write_bytes += d(cur.write_sectors, old.write_sectors) * SECTOR_BYTES / secs;
                let busy = d(cur.io_ticks_ms, old.io_ticks_ms) / (secs * 1000.0) * 100.0;
                max_busy = max_busy.max(busy);
            }
            stats.busy = max_busy.min(100.0);
        }
        prev_disks = Some(disks);

        // Scheduler counters. Linux has no system-wide syscall counter, so
        // `syscalls` stays None and the UI shows N/A.
        let ctxt = fs::read_to_string("/proc/stat").ok().and_then(|s| parse_ctxt(&s));
        if let (Some(cur), Some(old)) = (ctxt, prev_ctxt) {
            stats.ctx = cur.saturating_sub(old) as f64 / secs;
        }
        prev_ctxt = ctxt;
        stats.processes = count_processes();
        stats.threads = fs::read_to_string("/proc/loadavg")
            .ok()
            .and_then(|s| parse_loadavg_threads(&s))
            .unwrap_or(0);

        components.refresh();
        stats.cpu_temp = pick_cpu_temp(components.list().iter().map(|c| (c.label(), c.temperature())));

        if gpu_present {
            stats.gpu = read_gpu();
            gpu_present = stats.gpu.is_some();
        }

        if let Ok(mut guard) = shared.lock() {
            *guard = stats;
        }
        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }
}

// ---------- Network info (sidebar) ----------

/// "default via 192.168.1.1 dev wlan0 proto dhcp ..." → (gateway, iface)
fn parse_default_route(text: &str) -> (Option<String>, Option<String>) {
    let line = text.lines().find(|l| l.starts_with("default")).unwrap_or("");
    let f: Vec<&str> = line.split_whitespace().collect();
    let after = |key: &str| f.iter().position(|w| *w == key).and_then(|i| f.get(i + 1)).map(|s| s.to_string());
    (after("via"), after("dev"))
}

/// "3: wlan0    inet 192.168.1.5/24 brd ..." → "192.168.1.5"
fn parse_ipv4_addr(text: &str) -> Option<String> {
    let f: Vec<&str> = text.split_whitespace().collect();
    let i = f.iter().position(|w| *w == "inet")?;
    f.get(i + 1).map(|a| a.split('/').next().unwrap_or(a).to_string())
}

fn parse_resolv_conf(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|l| l.trim().strip_prefix("nameserver"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// "Link 3 (wlan0): 1.1.1.1 8.8.8.8" → ["1.1.1.1", "8.8.8.8"]
fn parse_resolvectl(text: &str) -> Vec<String> {
    text.lines()
        .filter_map(|l| l.split_once("):").map(|(_, v)| v))
        .flat_map(|v| v.split_whitespace().map(|s| s.to_string()))
        .collect()
}

#[derive(Default, Debug, PartialEq)]
struct WifiLink {
    ssid: Option<String>,
    bssid: Option<String>,
    signal: Option<i64>,
    radio: Option<String>,
    band: Option<String>,
    channel: Option<String>,
    rx: Option<String>,
    tx: Option<String>,
}

fn freq_to_band_channel(mhz: f64) -> (String, String) {
    let m = mhz as i64;
    if (2412..=2472).contains(&m) {
        ("2.4 GHz".into(), ((m - 2407) / 5).to_string())
    } else if m == 2484 {
        ("2.4 GHz".into(), "14".into())
    } else if (5000..5925).contains(&m) {
        ("5 GHz".into(), ((m - 5000) / 5).to_string())
    } else if m >= 5925 {
        ("6 GHz".into(), ((m - 5950) / 5).to_string())
    } else {
        (format!("{} MHz", m), String::new())
    }
}

/// Parses `iw dev <iface> link`.
fn parse_iw_link(text: &str) -> WifiLink {
    let mut w = WifiLink::default();
    for raw in text.lines() {
        let line = raw.trim();
        if let Some(rest) = line.strip_prefix("Connected to ") {
            w.bssid = rest.split_whitespace().next().map(|s| s.to_uppercase());
        } else if let Some(v) = line.strip_prefix("SSID:") {
            w.ssid = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("freq:") {
            let (band, chan) = freq_to_band_channel(num(v));
            w.band = Some(band);
            w.channel = (!chan.is_empty()).then_some(chan);
        } else if let Some(v) = line.strip_prefix("signal:") {
            // dBm → the 0-100% quality scale Windows reports.
            let dbm: i64 = v.trim().split_whitespace().next().and_then(|s| s.parse().ok()).unwrap_or(-100);
            w.signal = Some((2 * (dbm + 100)).clamp(0, 100));
        } else if let Some(v) = line.strip_prefix("rx bitrate:") {
            w.rx = v.split_whitespace().next().map(|s| s.to_string());
        } else if let Some(v) = line.strip_prefix("tx bitrate:") {
            w.tx = v.split_whitespace().next().map(|s| s.to_string());
            w.radio = if v.contains("EHT-MCS") {
                Some("802.11be".into())
            } else if v.contains("HE-MCS") {
                Some("802.11ax".into())
            } else if v.contains("VHT-MCS") {
                Some("802.11ac".into())
            } else if v.contains("MCS") {
                Some("802.11n".into())
            } else {
                None
            };
        }
    }
    w
}

/// Security of the active network from `nmcli -t -f ACTIVE,SECURITY dev wifi`.
fn parse_nmcli_security(text: &str) -> Option<String> {
    text.lines()
        .find_map(|l| l.strip_prefix("yes:"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub(crate) fn network_info() -> serde_json::Value {
    let (gateway, iface) = run("ip", &["-4", "route", "show", "default"])
        .map(|t| parse_default_route(&t))
        .unwrap_or((None, None));

    let mut local_v4 = None;
    let mut dns = Vec::new();
    let mut wifi = WifiLink::default();
    let mut auth = None;

    if let Some(dev) = iface.as_deref() {
        local_v4 = run("ip", &["-4", "-o", "addr", "show", "dev", dev]).and_then(|t| parse_ipv4_addr(&t));
        dns = run("resolvectl", &["dns", dev]).map(|t| parse_resolvectl(&t)).unwrap_or_default();
        if Path::new("/sys/class/net").join(dev).join("wireless").exists() {
            wifi = run("iw", &["dev", dev, "link"]).map(|t| parse_iw_link(&t)).unwrap_or_default();
            auth = run("nmcli", &["-t", "-f", "ACTIVE,SECURITY", "dev", "wifi"]).and_then(|t| parse_nmcli_security(&t));
        }
    }
    if dns.is_empty() {
        dns = fs::read_to_string("/etc/resolv.conf").map(|t| parse_resolv_conf(&t)).unwrap_or_default();
    }

    serde_json::json!({
        "iface": iface, "gateway": gateway, "localV4": local_v4, "dns": dns,
        "ssid": wifi.ssid, "bssid": wifi.bssid, "signal": wifi.signal, "radio": wifi.radio,
        "band": wifi.band, "channel": wifi.channel, "rxMbps": wifi.rx, "txMbps": wifi.tx,
        "auth": auth,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diskstats_keeps_selected_devices() {
        let text = "   8       0 sda 100 5 2000 30 50 2 800 20 0 40 60 0 0 0 0\n\
                       8       1 sda1 90 5 1800 28 45 2 700 18 0 35 50 0 0 0 0\n\
                       7       0 loop0 10 0 20 1 0 0 0 0 0 1 1 0 0 0 0\n";
        let d = parse_diskstats(text, |n| n == "sda");
        assert_eq!(d.len(), 1);
        assert_eq!(
            d["sda"],
            DiskCounters { reads: 100, read_sectors: 2000, writes: 50, write_sectors: 800, io_ticks_ms: 40 }
        );
    }

    #[test]
    fn proc_counters() {
        assert_eq!(parse_ctxt("cpu 1 2 3\nctxt 123456\nbtime 1\n"), Some(123456));
        assert_eq!(parse_loadavg_threads("0.52 0.58 0.59 2/1234 5678\n"), Some(1234));
    }

    #[test]
    fn cpu_temp_prefers_package() {
        let s = vec![("acpitz temp1", 30.0), ("coretemp Core 0", 45.0), ("coretemp Package id 0", 51.0)];
        assert_eq!(pick_cpu_temp(s.iter().map(|(l, t)| (*l, *t))), Some(51.0));
        let s = vec![("nvme Composite", 38.0), ("k10temp Tctl", 62.5)];
        assert_eq!(pick_cpu_temp(s.iter().map(|(l, t)| (*l, *t))), Some(62.5));
        let s = vec![("nvme Composite", 38.0), ("coretemp Package id 0", f32::NAN)];
        assert_eq!(pick_cpu_temp(s.iter().map(|(l, t)| (*l, *t))), None);
    }

    #[test]
    fn nvidia_smi_csv() {
        let g = parse_nvidia_smi("NVIDIA GeForce RTX 5060 Ti, 3, 42, 2007, 16311, 20.25, 1162, 7001, [N/A]\n").unwrap();
        assert_eq!(g.name, "NVIDIA GeForce RTX 5060 Ti");
        assert_eq!((g.usage, g.temp, g.mem_total, g.power, g.fan), (3.0, 42.0, 16311.0, 20.25, 0.0));
        assert!(parse_nvidia_smi("").is_none());
    }

    #[test]
    fn route_addr_dns() {
        let (gw, dev) = parse_default_route("default via 192.168.1.1 dev wlan0 proto dhcp src 192.168.1.5 metric 600\n");
        assert_eq!((gw.as_deref(), dev.as_deref()), (Some("192.168.1.1"), Some("wlan0")));
        assert_eq!(parse_default_route(""), (None, None));
        assert_eq!(
            parse_ipv4_addr("3: wlan0    inet 192.168.1.5/24 brd 192.168.1.255 scope global dynamic wlan0\n").as_deref(),
            Some("192.168.1.5")
        );
        assert_eq!(parse_resolv_conf("# hi\nnameserver 127.0.0.53\noptions edns0\n"), vec!["127.0.0.53"]);
        assert_eq!(parse_resolvectl("Link 3 (wlan0): 1.1.1.1 8.8.8.8\n"), vec!["1.1.1.1", "8.8.8.8"]);
    }

    #[test]
    fn iw_link() {
        let text = "Connected to aa:bb:cc:dd:ee:ff (on wlan0)\n\
                    \tSSID: HomeNet\n\
                    \tfreq: 5180\n\
                    \tsignal: -52 dBm\n\
                    \trx bitrate: 866.7 MBit/s VHT-MCS 9 80MHz short GI VHT-NSS 2\n\
                    \ttx bitrate: 780.0 MBit/s VHT-MCS 8 80MHz short GI VHT-NSS 2\n";
        let w = parse_iw_link(text);
        assert_eq!(w.ssid.as_deref(), Some("HomeNet"));
        assert_eq!(w.bssid.as_deref(), Some("AA:BB:CC:DD:EE:FF"));
        assert_eq!(w.signal, Some(96));
        assert_eq!((w.band.as_deref(), w.channel.as_deref()), (Some("5 GHz"), Some("36")));
        assert_eq!(w.radio.as_deref(), Some("802.11ac"));
        assert_eq!((w.rx.as_deref(), w.tx.as_deref()), (Some("866.7"), Some("780.0")));
        assert_eq!(parse_iw_link("Not connected.\n"), WifiLink::default());
        assert_eq!(parse_nmcli_security("no:WPA2\nyes:WPA2 WPA3\n").as_deref(), Some("WPA2 WPA3"));
    }
}
