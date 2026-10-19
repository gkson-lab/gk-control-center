// Mirrors the `LiveMetrics` struct the Rust collector emits (snake_case).

export interface DiskSpecs {
  name: string;
  total_gb: number;
  used_gb: number;
}

export interface GpuInfo {
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

export interface DiskIo {
  reads_per_sec: number;
  writes_per_sec: number;
  read_mb_per_sec: number;
  write_mb_per_sec: number;
  busy_percent: number;
}

export interface CoreInfo {
  usage: number;
  freq_mhz: number;
}

export interface LiveMetrics {
  cpu_usage: number;
  cpu_brand: string;
  cpu_frequency_mhz: number;
  cpu_temp_c: number;
  cpu_temp_available: boolean;
  logical_cores: number;
  cores: CoreInfo[];
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

export interface IpLocation {
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

export interface NetInfo {
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
