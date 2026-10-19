use sysinfo::{System, Disks, Networks, CpuRefreshKind};
use serde::{Serialize, Deserialize};
use std::time::{Instant, Duration};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Manager, Emitter, AppHandle};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use std::process::Command;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const BYTES_PER_GB: f64 = 1_073_741_824.0;
const EMIT_INTERVAL_MS: u64 = 500;   // hardware gauges (sysinfo) cadence
const POLL_INTERVAL_MS: u64 = 1000;  // shell-out (GPU + WMI) cadence
const WRITE_EVERY_N_TICKS: u64 = 10;
const RELIST_EVERY_N_TICKS: u64 = 120;

// PowerShell does everything that used to need the `wmi` crate, plus nvidia-smi,
// in one process spawn per second, returning a single JSON object. This avoids
// pulling a second `windows-core` version into the dependency graph (the cause
// of the build errors) entirely. Linux uses /proc, /sys and hwmon instead (see
// linux.rs).
#[cfg(windows)]
const PS_SCRIPT: &str = r#"
$ErrorActionPreference='SilentlyContinue'
$disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
$sys  = Get-CimInstance Win32_PerfFormattedData_PerfOS_System | Select-Object -First 1
$cpuTemp = $null
$sensors = Get-CimInstance -Namespace 'root/LibreHardwareMonitor' -ClassName Sensor | Where-Object { $_.SensorType -eq 'Temperature' }
if ($sensors) {
  $pkg = $sensors | Where-Object { $_.Name -match 'Package|Tctl|Tdie' } | Select-Object -First 1
  if (-not $pkg) { $pkg = $sensors | Where-Object { $_.Identifier -match 'cpu' } | Select-Object -First 1 }
  if ($pkg) { $cpuTemp = [double]$pkg.Value }
}
$gpu = $null
$g = (& nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.current.graphics,clocks.current.memory,fan.speed --format=csv,noheader,nounits) 2>$null
if ($g) {
  $p = ($g -split ',') | ForEach-Object { $_.Trim() }
  $num = { param($s) [double]($s -replace '[^0-9.]','') }
  $gpu = [pscustomobject]@{
    name=$p[0]; usage=(& $num $p[1]); temp=(& $num $p[2]); memUsed=(& $num $p[3]);
    memTotal=(& $num $p[4]); power=(& $num $p[5]); coreClock=(& $num $p[6]);
    memClock=(& $num $p[7]); fan=(& $num $p[8])
  }
}
[pscustomobject]@{
  reads=[double]$disk.DiskReadsPersec; writes=[double]$disk.DiskWritesPersec;
  readBytes=[double]$disk.DiskReadBytesPersec; writeBytes=[double]$disk.DiskWriteBytesPersec;
  busy=[double]$disk.PercentDiskTime;
  processes=[int]$sys.Processes; threads=[int]$sys.Threads;
  ctx=[double]$sys.ContextSwitchesPersec; syscalls=[double]$sys.SystemCallsPersec;
  cpuTemp=$cpuTemp; gpu=$gpu
} | ConvertTo-Json -Compress
"#;

// ---------- Wire format (serialized to the frontend as snake_case) ----------

#[derive(Serialize, Clone)]
struct CoreInfo {
    usage: f32,
    freq_mhz: u64,
}

#[derive(Serialize, Clone, Default)]
struct GpuInfo {
    available: bool,
    name: String,
    usage: f32,
    mem_used_mb: f64,
    mem_total_mb: f64,
    temp_c: f32,
    power_w: f64,
    core_clock_mhz: u32,
    mem_clock_mhz: u32,
    fan_percent: u32,
}

#[derive(Serialize, Clone, Default)]
struct DiskIo {
    reads_per_sec: f64,
    writes_per_sec: f64,
    read_mb_per_sec: f64,
    write_mb_per_sec: f64,
    busy_percent: f64,
}

#[derive(Serialize, Clone)]
struct DiskSpecs {
    name: String,
    total_gb: f64,
    used_gb: f64,
}

#[derive(Serialize, Clone)]
struct LiveMetrics {
    cpu_usage: f32,
    cpu_brand: String,
    cpu_frequency_mhz: u64,
    cpu_temp_c: f32,
    cpu_temp_available: bool,
    logical_cores: usize,
    cores: Vec<CoreInfo>,
    memory_usage_percent: f64,
    total_memory_gb: f64,
    used_memory_gb: f64,
    total_swap_gb: f64,
    used_swap_gb: f64,
    net_down_mbps: f64,
    net_up_mbps: f64,
    processes: u32,
    threads: u32,
    context_switches_per_sec: u64,
    system_calls_per_sec: u64,
    system_calls_available: bool,
    uptime_seconds: f64,
    odometer_total: f64,
    disks: Vec<DiskSpecs>,
    disk_io: DiskIo,
    gpu: GpuInfo,
    host_name: String,
    os_version: String,
}

// ---------- Shell-out (GPU + WMI) result shapes ----------

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct PsGpu {
    name: String,
    usage: f64,
    temp: f64,
    mem_used: f64,
    mem_total: f64,
    power: f64,
    core_clock: f64,
    mem_clock: f64,
    fan: f64,
}

#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct PsStats {
    reads: f64,
    writes: f64,
    read_bytes: f64,
    write_bytes: f64,
    busy: f64,
    processes: u32,
    threads: u32,
    ctx: f64,
    syscalls: Option<f64>,
    cpu_temp: Option<f64>,
    gpu: Option<PsGpu>,
}

// ---------- Odometer persistence ----------

fn write_stored_odometer(path: &Path, val: f64) {
    if let Ok(mut file) = OpenOptions::new().write(true).create(true).truncate(true).open(path) {
        let _ = write!(file, "{}", val);
    }
}

// ---------- Shell-out poller ----------

#[cfg(windows)]
fn run_powershell(script: &str) -> Option<String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let output = cmd.output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        None
    }
}

// Local network / Wi-Fi / router detail, queried on demand by the sidebar.
#[cfg(windows)]
const NET_SCRIPT: &str = r#"
$ErrorActionPreference='SilentlyContinue'
$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1
$gateway = $cfg.IPv4DefaultGateway.NextHop
$localv4 = ($cfg.IPv4Address | Select-Object -First 1).IPAddress
$iface = $cfg.InterfaceAlias
$dns = @($cfg.DNSServer.ServerAddresses)
$ssid=$null;$bssid=$null;$signal=$null;$radio=$null;$band=$null;$chan=$null;$rx=$null;$tx=$null;$auth=$null
$w = netsh wlan show interfaces
if ($w) {
  $tt = ($w -join "`n")
  $F = { param($p) $m=[regex]::Match($tt,$p); if($m.Success){ $m.Groups[1].Value.Trim() } else { $null } }
  $ssid  = & $F '(?m)^\s*SSID\s*:\s*(.+)$'
  $bssid = & $F '(?m)^\s*BSSID\s*:\s*(.+)$'
  $radio = & $F '(?m)^\s*Radio type\s*:\s*(.+)$'
  $band  = & $F '(?m)^\s*Band\s*:\s*(.+)$'
  $chan  = & $F '(?m)^\s*Channel\s*:\s*(.+)$'
  $auth  = & $F '(?m)^\s*Authentication\s*:\s*(.+)$'
  $sig   = & $F '(?m)^\s*Signal\s*:\s*(.+)$'
  if ($sig) { $signal = [int]($sig -replace '[^0-9]','') }
  $rx = & $F '(?m)^\s*Receive rate \(Mbps\)\s*:\s*(.+)$'
  $tx = & $F '(?m)^\s*Transmit rate \(Mbps\)\s*:\s*(.+)$'
}
[pscustomobject]@{
  iface=$iface; gateway=$gateway; localV4=$localv4; dns=$dns;
  ssid=$ssid; bssid=$bssid; signal=$signal; radio=$radio; band=$band;
  channel=$chan; rxMbps=$rx; txMbps=$tx; auth=$auth
} | ConvertTo-Json -Compress
"#;

#[cfg(windows)]
#[tauri::command]
fn get_network_info() -> serde_json::Value {
    if let Some(out) = run_powershell(NET_SCRIPT) {
        let trimmed = out.trim().trim_start_matches('\u{feff}');
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            return v;
        }
    }
    serde_json::Value::Null
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn get_network_info() -> serde_json::Value {
    linux::network_info()
}

#[cfg(not(any(windows, target_os = "linux")))]
#[tauri::command]
fn get_network_info() -> serde_json::Value {
    serde_json::Value::Null
}

#[cfg(target_os = "linux")]
use linux::poller_loop;

// No extra data sources on other platforms yet; the sysinfo gauges still work.
#[cfg(not(any(windows, target_os = "linux")))]
fn poller_loop(_shared: Arc<Mutex<PsStats>>) {}

#[cfg(windows)]
fn poller_loop(shared: Arc<Mutex<PsStats>>) {
    loop {
        if let Some(out) = run_powershell(PS_SCRIPT) {
            let trimmed = out.trim().trim_start_matches('\u{feff}');
            if let Ok(stats) = serde_json::from_str::<PsStats>(trimmed) {
                if let Ok(mut guard) = shared.lock() {
                    *guard = stats;
                }
            }
        }
        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }
}

// ---------- Collector ----------

fn collector_loop(handle: AppHandle, odometer_path: PathBuf, odometer_base: f64, shared: Arc<Mutex<PsStats>>) {
    let start_time = Instant::now();

    let mut sys = System::new_all();
    sys.refresh_all();
    let mut disks = Disks::new_with_refreshed_list();
    let mut networks = Networks::new_with_refreshed_list();

    let host_name = System::host_name().unwrap_or_default();
    let os_version = System::long_os_version().unwrap_or_default();
    let cpu_brand = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_default();
    let logical_cores = sys.cpus().len();

    // Warm-up so the first emitted sample has valid CPU/network rates.
    sys.refresh_cpu_specifics(CpuRefreshKind::everything());
    networks.refresh();
    thread::sleep(Duration::from_millis(EMIT_INTERVAL_MS));
    let mut last_sample = Instant::now();
    let mut tick: u64 = 0;

    loop {
        tick = tick.wrapping_add(1);

        sys.refresh_cpu_specifics(CpuRefreshKind::everything());
        sys.refresh_memory();
        disks.refresh();
        networks.refresh();
        if tick % RELIST_EVERY_N_TICKS == 0 {
            disks.refresh_list();
        }

        let now = Instant::now();
        let elapsed = now.duration_since(last_sample).as_secs_f64().max(1e-6);
        last_sample = now;

        let down_bytes: u64 = networks.iter().map(|(_, d)| d.received()).sum();
        let up_bytes: u64 = networks.iter().map(|(_, d)| d.transmitted()).sum();
        let net_down_mbps = (down_bytes as f64 / elapsed) / 1_000_000.0;
        let net_up_mbps = (up_bytes as f64 / elapsed) / 1_000_000.0;

        let cores: Vec<CoreInfo> = sys
            .cpus()
            .iter()
            .map(|c| CoreInfo { usage: c.cpu_usage(), freq_mhz: c.frequency() })
            .collect();
        let cpu_usage = sys.global_cpu_info().cpu_usage();
        let cpu_frequency_mhz = sys.cpus().iter().map(|c| c.frequency()).max().unwrap_or(0);

        let total_mem = sys.total_memory() as f64;
        let used_mem = sys.used_memory() as f64;
        let memory_usage_percent = if total_mem > 0.0 { used_mem / total_mem * 100.0 } else { 0.0 };

        // Latest shell-out snapshot (updated ~1/s on its own thread).
        let extra = shared.lock().ok().map(|g| g.clone()).unwrap_or_default();
        let gpu = match &extra.gpu {
            Some(g) => GpuInfo {
                available: true,
                name: g.name.clone(),
                usage: g.usage as f32,
                mem_used_mb: g.mem_used,
                mem_total_mb: g.mem_total,
                temp_c: g.temp as f32,
                power_w: g.power,
                core_clock_mhz: g.core_clock as u32,
                mem_clock_mhz: g.mem_clock as u32,
                fan_percent: g.fan as u32,
            },
            None => GpuInfo::default(),
        };
        let disk_io = DiskIo {
            reads_per_sec: extra.reads,
            writes_per_sec: extra.writes,
            read_mb_per_sec: extra.read_bytes / 1_000_000.0,
            write_mb_per_sec: extra.write_bytes / 1_000_000.0,
            busy_percent: extra.busy.min(100.0),
        };

        let mut disk_list = Vec::new();
        for disk in disks.list() {
            let total_gb = disk.total_space() as f64 / BYTES_PER_GB;
            let available_gb = disk.available_space() as f64 / BYTES_PER_GB;
            disk_list.push(DiskSpecs {
                name: disk.mount_point().to_string_lossy().to_string(),
                total_gb: (total_gb * 10.0).round() / 10.0,
                used_gb: ((total_gb - available_gb) * 10.0).round() / 10.0,
            });
        }

        let odometer_total = odometer_base + start_time.elapsed().as_secs_f64();
        if tick % WRITE_EVERY_N_TICKS == 0 {
            write_stored_odometer(&odometer_path, odometer_total);
        }

        let metrics = LiveMetrics {
            cpu_usage,
            cpu_brand: cpu_brand.clone(),
            cpu_frequency_mhz,
            cpu_temp_c: extra.cpu_temp.unwrap_or(0.0) as f32,
            cpu_temp_available: extra.cpu_temp.is_some(),
            logical_cores,
            cores,
            memory_usage_percent: (memory_usage_percent * 100.0).round() / 100.0,
            total_memory_gb: (total_mem / BYTES_PER_GB * 100.0).round() / 100.0,
            used_memory_gb: (used_mem / BYTES_PER_GB * 100.0).round() / 100.0,
            total_swap_gb: (sys.total_swap() as f64 / BYTES_PER_GB * 100.0).round() / 100.0,
            used_swap_gb: (sys.used_swap() as f64 / BYTES_PER_GB * 100.0).round() / 100.0,
            net_down_mbps: (net_down_mbps * 100.0).round() / 100.0,
            net_up_mbps: (net_up_mbps * 100.0).round() / 100.0,
            processes: extra.processes,
            threads: extra.threads,
            context_switches_per_sec: extra.ctx as u64,
            system_calls_per_sec: extra.syscalls.unwrap_or(0.0) as u64,
            system_calls_available: extra.syscalls.is_some(),
            uptime_seconds: start_time.elapsed().as_secs_f64(),
            odometer_total,
            disks: disk_list,
            disk_io,
            gpu,
            host_name: host_name.clone(),
            os_version: os_version.clone(),
        };

        // Multi-PC pack: keep the latest readings ready for the sharing server.
        if let Some(sh) = handle.try_state::<share::Share>() {
            if let (Ok(json), Ok(mut slot)) = (serde_json::to_string(&metrics), sh.latest.lock()) {
                *slot = json;
            }
        }

        let _ = handle.emit("metrics", metrics);
        thread::sleep(Duration::from_millis(EMIT_INTERVAL_MS));
    }
}

mod share;

#[tauri::command]
fn share_status(state: tauri::State<share::Share>) -> share::Status {
    state.status()
}

#[tauri::command]
fn share_set(enabled: bool, state: tauri::State<share::Share>) -> share::Status {
    state.set_enabled(enabled)
}

#[tauri::command]
fn share_new_token(state: tauri::State<share::Share>) -> share::Status {
    state.new_token()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMA-BUF renderer shows a blank window on many NVIDIA setups.
    // Turn it off there unless the user already chose a value.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        && Path::new("/proc/driver/nvidia").exists()
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let _ = std::fs::create_dir_all(&data_dir);
            app.manage(share::Share::load(data_dir.join("multi-pc.json")));

            // Reset the odometer on every launch so runtime always starts from
            // zero. (We only remove our own odometer file — never the app cache
            // dir, which on Windows can sit next to the WebView2 data folder.)
            let odometer_path = data_dir.join("odometer.txt");
            let _ = std::fs::remove_file(&odometer_path);
            let odometer_base = 0.0;

            let shared = Arc::new(Mutex::new(PsStats::default()));
            let shared_poll = shared.clone();
            thread::spawn(move || poller_loop(shared_poll));

            let handle = app.handle().clone();
            thread::spawn(move || collector_loop(handle, odometer_path, odometer_base, shared));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_network_info, share_status, share_set, share_new_token])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
