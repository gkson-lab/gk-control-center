// Expansion pack: history. Keeps every reading for the last 24 hours (one
// sample every 2 s) in memory, plus one-minute averages for the last 7 days on
// disk, so the History view can chart any range and say what was busiest when.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const RECENT_SECS: u64 = 24 * 3600;
const LONG_SECS: u64 = 7 * 24 * 3600;
const MAX_POINTS: usize = 480;

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
pub struct Sample {
    /// Unix seconds.
    pub t: u64,
    pub cpu: f32,
    pub mem: f32,
    pub gpu: f32,
    pub gpu_temp: f32,
    pub cpu_temp: f32,
    pub disk: f32,
    pub down: f32,
    pub up: f32,
    /// Busiest process at the time (by CPU), empty if unknown.
    #[serde(default)]
    pub top: String,
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub struct History {
    recent: VecDeque<Sample>,
    long: Vec<Sample>,
    minute: Vec<Sample>,
    path: PathBuf,
}

impl History {
    /// Loads the last 7 days of minute averages and rewrites the file without
    /// anything older.
    pub fn load(path: PathBuf) -> Self {
        let cutoff = now_secs().saturating_sub(LONG_SECS);
        let long: Vec<Sample> = fs::read_to_string(&path)
            .map(|text| {
                text.lines()
                    .filter_map(|l| serde_json::from_str::<Sample>(l).ok())
                    .filter(|s| s.t >= cutoff)
                    .collect()
            })
            .unwrap_or_default();
        let body: String = long.iter().filter_map(|s| serde_json::to_string(s).ok()).map(|l| l + "\n").collect();
        let _ = fs::write(&path, body);
        History { recent: VecDeque::new(), long, minute: Vec::new(), path }
    }

    pub fn push(&mut self, s: Sample) {
        let t = s.t;
        self.minute.push(s.clone());
        self.recent.push_back(s);
        while self.recent.front().is_some_and(|f| f.t + RECENT_SECS < t) {
            self.recent.pop_front();
        }
        // Close the minute once a sample lands in a new one.
        if let Some(first) = self.minute.first() {
            if t / 60 != first.t / 60 && self.minute.len() > 1 {
                let done: Vec<Sample> = self.minute.drain(..self.minute.len() - 1).collect();
                let avg = average(&done);
                if let Ok(line) = serde_json::to_string(&avg) {
                    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&self.path) {
                        let _ = writeln!(f, "{}", line);
                    }
                }
                self.long.push(avg);
                let cutoff = t.saturating_sub(LONG_SECS);
                self.long.retain(|x| x.t >= cutoff);
            }
        }
    }

    /// Samples from the last `range_secs`, averaged into at most MAX_POINTS
    /// buckets. Each bucket keeps the busiest process from its peak sample.
    pub fn query(&self, range_secs: u64) -> Vec<Sample> {
        let now = now_secs();
        let from = now.saturating_sub(range_secs);
        let first_recent = self.recent.front().map(|s| s.t).unwrap_or(u64::MAX);
        let src: Vec<&Sample> = self
            .long
            .iter()
            .filter(|s| s.t >= from && s.t < first_recent)
            .chain(self.recent.iter().filter(|s| s.t >= from))
            .collect();
        bucket(&src, from, now, MAX_POINTS)
    }
}

fn average(xs: &[Sample]) -> Sample {
    let n = xs.len().max(1) as f32;
    let sum = |f: fn(&Sample) -> f32| xs.iter().map(f).sum::<f32>() / n;
    let peak = xs.iter().max_by(|a, b| a.cpu.total_cmp(&b.cpu));
    Sample {
        t: xs.first().map(|s| s.t / 60 * 60).unwrap_or(0),
        cpu: sum(|s| s.cpu),
        mem: sum(|s| s.mem),
        gpu: sum(|s| s.gpu),
        gpu_temp: sum(|s| s.gpu_temp),
        cpu_temp: sum(|s| s.cpu_temp),
        disk: sum(|s| s.disk),
        down: sum(|s| s.down),
        up: sum(|s| s.up),
        top: peak.map(|s| s.top.clone()).unwrap_or_default(),
    }
}

fn bucket(src: &[&Sample], from: u64, to: u64, max: usize) -> Vec<Sample> {
    if src.len() <= max {
        return src.iter().map(|s| (*s).clone()).collect();
    }
    let width = ((to - from) as f64 / max as f64).max(1.0);
    let mut out = Vec::with_capacity(max);
    let mut group: Vec<Sample> = Vec::new();
    let mut idx = 0usize;
    for s in src {
        let i = (((s.t - from) as f64) / width) as usize;
        if i != idx && !group.is_empty() {
            let mut a = average(&group);
            a.t = group[0].t;
            out.push(a);
            group.clear();
        }
        idx = i;
        group.push((*s).clone());
    }
    if !group.is_empty() {
        let mut a = average(&group);
        a.t = group[0].t;
        out.push(a);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(t: u64, cpu: f32, top: &str) -> Sample {
        Sample { t, cpu, top: top.into(), ..Default::default() }
    }

    #[test]
    fn average_keeps_peak_process() {
        let a = average(&[s(120, 10.0, "idle"), s(122, 90.0, "game.exe"), s(124, 20.0, "chrome")]);
        assert_eq!(a.t, 120);
        assert!((a.cpu - 40.0).abs() < 1e-3);
        assert_eq!(a.top, "game.exe");
    }

    #[test]
    fn bucket_caps_point_count() {
        let src: Vec<Sample> = (0..2000).map(|i| s(1000 + i * 2, (i % 100) as f32, "x")).collect();
        let refs: Vec<&Sample> = src.iter().collect();
        let out = bucket(&refs, 1000, 1000 + 4000, 480);
        assert!(out.len() <= 481 && out.len() > 400, "{}", out.len());
        let few: Vec<&Sample> = src.iter().take(10).collect();
        assert_eq!(bucket(&few, 1000, 5000, 480).len(), 10);
    }

    #[test]
    fn minutes_are_written_and_reloaded() {
        let dir = std::env::temp_dir().join(format!("gkcc-history-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("history.jsonl");
        let _ = fs::remove_file(&path);
        let base = now_secs() / 60 * 60 - 600;
        let mut h = History::load(path.clone());
        for i in 0..90 {
            h.push(s(base + i * 2, 50.0, "a"));
        }
        assert_eq!(h.long.len(), 2, "two full minutes closed");
        let again = History::load(path.clone());
        assert_eq!(again.long.len(), 2);
        assert!(!again.query(3600).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
