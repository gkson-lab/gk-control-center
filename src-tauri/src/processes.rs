// Expansion pack: process explorer. Lists running processes with their CPU,
// memory and disk use, and ends one on request.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Instant;
use sysinfo::{Pid, ProcessRefreshKind, System, UpdateKind};

#[derive(Serialize, Clone, Debug)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    /// Share of the whole processor, 0 to 100 (not per core).
    pub cpu: f32,
    pub mem_mb: f64,
    pub read_kbps: f64,
    pub write_kbps: f64,
    pub path: String,
}

pub struct ProcState {
    sys: System,
    last: Instant,
}

impl ProcState {
    pub fn new() -> Mutex<Self> {
        let mut sys = System::new();
        sys.refresh_cpu();
        sys.refresh_processes_specifics(kind());
        Mutex::new(ProcState { sys, last: Instant::now() })
    }
}

fn kind() -> ProcessRefreshKind {
    ProcessRefreshKind::new().with_cpu().with_memory().with_disk_usage().with_exe(UpdateKind::OnlyIfNotSet)
}

pub fn list(state: &Mutex<ProcState>) -> Vec<ProcInfo> {
    let Ok(mut st) = state.lock() else { return Vec::new() };
    st.sys.refresh_processes_specifics(kind());
    let secs = st.last.elapsed().as_secs_f64().max(0.2);
    st.last = Instant::now();
    let cores = st.sys.cpus().len().max(1) as f32;
    let mut out: Vec<ProcInfo> = st
        .sys
        .processes()
        .values()
        .filter(|p| p.pid().as_u32() != 0)
        .map(|p| {
            let d = p.disk_usage();
            ProcInfo {
                pid: p.pid().as_u32(),
                name: p.name().to_string(),
                cpu: (p.cpu_usage() / cores).min(100.0),
                mem_mb: p.memory() as f64 / 1_048_576.0,
                read_kbps: d.read_bytes as f64 / 1024.0 / secs,
                write_kbps: d.written_bytes as f64 / 1024.0 / secs,
                path: p.exe().map(|e| e.to_string_lossy().into_owned()).unwrap_or_default(),
            }
        })
        .collect();
    out.sort_by(|a, b| b.cpu.total_cmp(&a.cpu));
    out
}

/// Ends a process. Refuses the system idle/kernel processes and this app itself.
pub fn end(state: &Mutex<ProcState>, pid: u32) -> Result<(), String> {
    if pid <= 4 || pid == std::process::id() {
        return Err("That process is protected and can't be ended from here.".into());
    }
    let st = state.lock().map_err(|_| "Process list is busy, try again.".to_string())?;
    let p = st.sys.process(Pid::from_u32(pid)).ok_or("That process has already exited.")?;
    if p.kill() {
        Ok(())
    } else {
        Err("The system refused. It may belong to another user or need administrator rights.".into())
    }
}
