// Expansion pack: always on. A tray icon whose tooltip carries the key
// readings, a small always-on-top overlay window, and desktop notifications
// when a reading stays past a limit you set.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;

const TRAY_ID: &str = "main-tray";
const OVERLAY: &str = "overlay";
/// A reading must stay past its limit this long before it alerts (ignores spikes).
const HOLD: Duration = Duration::from_secs(10);
/// The same alert won't repeat within this time.
const COOLDOWN: Duration = Duration::from_secs(5 * 60);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Alert {
    pub on: bool,
    pub limit: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub close_to_tray: bool,
    pub cpu_load: Alert,
    pub cpu_temp: Alert,
    pub gpu_temp: Alert,
    pub memory: Alert,
    pub disk_full: Alert,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            close_to_tray: false,
            cpu_load: Alert { on: false, limit: 95.0 },
            cpu_temp: Alert { on: false, limit: 90.0 },
            gpu_temp: Alert { on: false, limit: 85.0 },
            memory: Alert { on: false, limit: 90.0 },
            disk_full: Alert { on: false, limit: 95.0 },
        }
    }
}

/// What the collector hands over each check.
pub struct Readings {
    pub cpu_load: f64,
    pub cpu_temp: Option<f64>,
    pub gpu_temp: Option<f64>,
    pub memory: f64,
    /// Fullest drive: (name, percent full).
    pub disk_full: Option<(String, f64)>,
    pub gpu_load: Option<f64>,
}

pub struct AlwaysOn {
    settings: Mutex<Settings>,
    path: PathBuf,
    over_since: Mutex<HashMap<&'static str, Instant>>,
    last_fired: Mutex<HashMap<&'static str, Instant>>,
    overlay_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

impl AlwaysOn {
    pub fn load(path: PathBuf) -> Self {
        let settings = fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        AlwaysOn {
            settings: Mutex::new(settings),
            path,
            over_since: Mutex::new(HashMap::new()),
            last_fired: Mutex::new(HashMap::new()),
            overlay_item: Mutex::new(None),
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().map(|s| s.clone()).unwrap_or_default()
    }

    pub fn save(&self, s: Settings) -> Result<(), String> {
        let body = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
        fs::write(&self.path, body).map_err(|e| format!("Couldn't save settings: {e}"))?;
        if let Ok(mut cur) = self.settings.lock() {
            *cur = s;
        }
        Ok(())
    }
}

/// Which alerts should fire now. Pure, so it can be tested without a window.
fn due(
    s: &Settings,
    r: &Readings,
    now: Instant,
    over_since: &mut HashMap<&'static str, Instant>,
    last_fired: &mut HashMap<&'static str, Instant>,
) -> Vec<(&'static str, String)> {
    let mut checks: Vec<(&'static str, &Alert, Option<f64>, String)> = vec![
        ("cpu_load", &s.cpu_load, Some(r.cpu_load), format!("Processor load has been at {:.0}% for 10 seconds.", r.cpu_load)),
        ("memory", &s.memory, Some(r.memory), format!("Memory is {:.0}% full.", r.memory)),
    ];
    if let Some(t) = r.cpu_temp {
        checks.push(("cpu_temp", &s.cpu_temp, Some(t), format!("The CPU is at {t:.0} °C.")));
    }
    if let Some(t) = r.gpu_temp {
        checks.push(("gpu_temp", &s.gpu_temp, Some(t), format!("The GPU is at {t:.0} °C.")));
    }
    if let Some((name, p)) = &r.disk_full {
        checks.push(("disk_full", &s.disk_full, Some(*p), format!("Drive {name} is {p:.0}% full.")));
    }

    let mut out = Vec::new();
    for (key, alert, value, message) in checks {
        let over = alert.on && value.is_some_and(|v| v >= alert.limit);
        if !over {
            over_since.remove(key);
            continue;
        }
        let since = *over_since.entry(key).or_insert(now);
        let cooled = last_fired.get(key).map_or(true, |t| now.duration_since(*t) >= COOLDOWN);
        if now.duration_since(since) >= HOLD && cooled {
            last_fired.insert(key, now);
            out.push((key, message));
        }
    }
    out
}

/// Called by the collector every couple of seconds.
pub fn tick(app: &AppHandle, r: Readings) {
    let Some(state) = app.try_state::<AlwaysOn>() else { return };
    let settings = state.settings();
    let fired = {
        let (Ok(mut over), Ok(mut last)) = (state.over_since.lock(), state.last_fired.lock()) else { return };
        due(&settings, &r, Instant::now(), &mut over, &mut last)
    };
    for (_, message) in fired {
        let _ = app.notification().builder().title("gklabs Device Manager").body(message).show();
    }

    let mut tip = format!("gklabs Device Manager\nCPU {:.0}%", r.cpu_load);
    if let Some(t) = r.cpu_temp {
        tip.push_str(&format!(" · {t:.0} °C"));
    }
    if let Some(g) = r.gpu_load {
        tip.push_str(&format!("\nGPU {g:.0}%"));
        if let Some(t) = r.gpu_temp {
            tip.push_str(&format!(" · {t:.0} °C"));
        }
    }
    tip.push_str(&format!("\nMemory {:.0}%", r.memory));
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tip));
    }
}

pub fn notify_test(app: &AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("gklabs Device Manager")
        .body("Alerts are working. You'll see one like this when a reading passes a limit you set.")
        .show()
        .map_err(|e| e.to_string())
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn overlay_visible(app: &AppHandle) -> bool {
    app.get_webview_window(OVERLAY).is_some()
}

pub fn set_overlay(app: &AppHandle, show: bool) -> Result<(), String> {
    if show && !overlay_visible(app) {
        let w = WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("index.html?overlay=1".into()))
            .title("gklabs overlay")
            .inner_size(248.0, 156.0)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()
            .map_err(|e| e.to_string())?;
        // Top-right corner of the screen it opened on, 24px in.
        if let (Ok(Some(mon)), Ok(size)) = (w.current_monitor(), w.outer_size()) {
            let x = mon.position().x + mon.size().width as i32 - size.width as i32 - 24;
            let y = mon.position().y + 24;
            let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
        }
    } else if !show {
        if let Some(w) = app.get_webview_window(OVERLAY) {
            w.close().map_err(|e| e.to_string())?;
        }
    }
    sync_overlay_state(app, show);
    Ok(())
}

fn sync_overlay_state(app: &AppHandle, on: bool) {
    if let Some(state) = app.try_state::<AlwaysOn>() {
        if let Ok(item) = state.overlay_item.lock() {
            if let Some(i) = item.as_ref() {
                let _ = i.set_checked(on);
            }
        }
    }
    let _ = app.emit("overlay-changed", on);
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show gklabs Device Manager", true, None::<&str>)?;
    let overlay = CheckMenuItem::with_id(app, "overlay", "Overlay", true, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &overlay, &PredefinedMenuItem::separator(app)?, &quit])?;
    if let Some(state) = app.try_state::<AlwaysOn>() {
        if let Ok(mut slot) = state.overlay_item.lock() {
            *slot = Some(overlay.clone());
        }
    }

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("gklabs Device Manager")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "overlay" => {
                let _ = set_overlay(app, !overlay_visible(app));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn readings(cpu: f64, gpu_temp: f64) -> Readings {
        Readings {
            cpu_load: cpu,
            cpu_temp: None,
            gpu_temp: Some(gpu_temp),
            memory: 40.0,
            disk_full: Some(("C:\\".into(), 50.0)),
            gpu_load: Some(10.0),
        }
    }

    #[test]
    fn alerts_need_a_sustained_reading_and_respect_cooldown() {
        let mut s = Settings::default();
        s.gpu_temp = Alert { on: true, limit: 80.0 };
        let (mut over, mut last) = (HashMap::new(), HashMap::new());
        let t0 = Instant::now();
        assert!(due(&s, &readings(10.0, 85.0), t0, &mut over, &mut last).is_empty(), "not yet held");
        let fired = due(&s, &readings(10.0, 85.0), t0 + Duration::from_secs(11), &mut over, &mut last);
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0].0, "gpu_temp");
        assert!(due(&s, &readings(10.0, 86.0), t0 + Duration::from_secs(60), &mut over, &mut last).is_empty(), "cooling down");
        assert!(due(&s, &readings(10.0, 70.0), t0 + Duration::from_secs(61), &mut over, &mut last).is_empty());
        assert!(!over.contains_key("gpu_temp"), "dropping below resets the hold");
    }

    #[test]
    fn disabled_alerts_never_fire() {
        let s = Settings::default();
        let (mut over, mut last) = (HashMap::new(), HashMap::new());
        let t0 = Instant::now();
        due(&s, &readings(100.0, 99.0), t0, &mut over, &mut last);
        assert!(due(&s, &readings(100.0, 99.0), t0 + Duration::from_secs(30), &mut over, &mut last).is_empty());
    }

    #[test]
    fn settings_round_trip_and_fill_missing_fields() {
        let partial: Settings = serde_json::from_str(r#"{"close_to_tray":true}"#).unwrap();
        assert!(partial.close_to_tray);
        assert_eq!(partial.gpu_temp, Settings::default().gpu_temp);
    }
}
