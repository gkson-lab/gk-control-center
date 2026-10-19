// Expansion pack: multi-PC. When sharing is on, a small HTTP server on the
// local network answers with this PC's latest readings, but only to requests
// carrying this PC's token. It also serves a phone-sized page that shows them.

use serde::{Deserialize, Serialize};
use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Method, Response, Server};

pub const PORT: u16 = 47823;
const PHONE_PAGE: &str = include_str!("phone.html");

#[derive(Serialize, Deserialize, Clone, Default)]
struct Saved {
    enabled: bool,
    token: String,
}

#[derive(Serialize, Clone)]
pub struct Status {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
    /// Addresses other devices can use, e.g. "192.168.1.20".
    pub addresses: Vec<String>,
    pub error: Option<String>,
}

pub struct Share {
    saved: Mutex<Saved>,
    path: PathBuf,
    /// Latest readings as JSON, written by the collector.
    pub latest: Arc<Mutex<String>>,
    server: Mutex<Option<Arc<Server>>>,
    error: Mutex<Option<String>>,
}

pub fn new_token() -> String {
    let mut out = String::new();
    for i in 0..2u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u128(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.write_u64(i ^ std::process::id() as u64);
        out.push_str(&format!("{:016x}", h.finish()));
    }
    out[..24].to_string()
}

/// The address this PC uses on its network (no packets are sent).
fn local_address() -> Option<String> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("8.8.8.8:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

/// Splits "/api/metrics?token=abc" into the path and the token value.
fn parse_request(url: &str) -> (&str, Option<&str>) {
    let (path, query) = url.split_once('?').unwrap_or((url, ""));
    let token = query.split('&').find_map(|kv| kv.strip_prefix("token="));
    (path, token)
}

impl Share {
    pub fn load(path: PathBuf) -> Self {
        let mut saved: Saved = fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        if saved.token.len() < 16 {
            saved.token = new_token();
        }
        let share = Share {
            saved: Mutex::new(saved.clone()),
            path,
            latest: Arc::new(Mutex::new(String::from("null"))),
            server: Mutex::new(None),
            error: Mutex::new(None),
        };
        share.persist();
        if saved.enabled {
            let _ = share.start();
        }
        share
    }

    fn persist(&self) {
        if let Ok(s) = self.saved.lock() {
            if let Ok(body) = serde_json::to_string_pretty(&*s) {
                let _ = fs::write(&self.path, body);
            }
        }
    }

    pub fn status(&self) -> Status {
        let s = self.saved.lock().map(|s| s.clone()).unwrap_or_default();
        Status {
            enabled: s.enabled && self.server.lock().map(|g| g.is_some()).unwrap_or(false),
            port: PORT,
            token: s.token,
            addresses: local_address().into_iter().collect(),
            error: self.error.lock().ok().and_then(|e| e.clone()),
        }
    }

    pub fn set_enabled(&self, on: bool) -> Status {
        if let Ok(mut s) = self.saved.lock() {
            s.enabled = on;
        }
        self.persist();
        if on {
            let _ = self.start();
        } else {
            self.stop();
        }
        self.status()
    }

    pub fn new_token(&self) -> Status {
        if let Ok(mut s) = self.saved.lock() {
            s.token = new_token();
        }
        self.persist();
        self.status()
    }

    fn stop(&self) {
        if let Ok(mut g) = self.server.lock() {
            if let Some(server) = g.take() {
                server.unblock();
            }
        }
    }

    fn start(&self) -> Result<(), String> {
        if self.server.lock().map(|g| g.is_some()).unwrap_or(false) {
            return Ok(());
        }
        let server = match Server::http(("0.0.0.0", PORT)) {
            Ok(s) => Arc::new(s),
            Err(e) => {
                let msg = format!("Couldn't open port {PORT}: {e}");
                if let Ok(mut err) = self.error.lock() {
                    *err = Some(msg.clone());
                }
                return Err(msg);
            }
        };
        if let Ok(mut err) = self.error.lock() {
            *err = None;
        }
        if let Ok(mut g) = self.server.lock() {
            *g = Some(server.clone());
        }
        let latest = self.latest.clone();
        let saved_path = self.path.clone();
        thread::spawn(move || serve(server, latest, saved_path));
        Ok(())
    }
}

fn serve(server: Arc<Server>, latest: Arc<Mutex<String>>, saved_path: PathBuf) {
    let cors = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).expect("static header");
    let json = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).expect("static header");
    let html = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).expect("static header");
    for req in server.incoming_requests() {
        if req.method() != &Method::Get {
            let _ = req.respond(Response::from_string("Method not allowed").with_status_code(405));
            continue;
        }
        // Re-read the token so "New token" takes effect without a restart.
        let token = fs::read_to_string(&saved_path)
            .ok()
            .and_then(|t| serde_json::from_str::<Saved>(&t).ok())
            .map(|s| s.token)
            .unwrap_or_default();
        let url = req.url().to_string();
        let (path, given) = parse_request(&url);
        let resp = match path {
            "/" | "/index.html" => Response::from_string(PHONE_PAGE).with_header(html.clone()),
            "/api/metrics" if !token.is_empty() && given == Some(token.as_str()) => {
                let body = latest.lock().map(|l| l.clone()).unwrap_or_else(|_| "null".into());
                Response::from_string(body).with_header(json.clone()).with_header(cors.clone())
            }
            "/api/metrics" => Response::from_string("{\"error\":\"wrong or missing token\"}")
                .with_status_code(401)
                .with_header(json.clone())
                .with_header(cors.clone()),
            _ => Response::from_string("Not found").with_status_code(404),
        };
        let _ = req.respond(resp);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_24_hex_chars_and_differ() {
        let a = new_token();
        let b = new_token();
        assert_eq!(a.len(), 24);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn request_parsing() {
        assert_eq!(parse_request("/api/metrics?token=abc"), ("/api/metrics", Some("abc")));
        assert_eq!(parse_request("/api/metrics?x=1&token=abc"), ("/api/metrics", Some("abc")));
        assert_eq!(parse_request("/api/metrics"), ("/api/metrics", None));
        assert_eq!(parse_request("/"), ("/", None));
    }

    #[test]
    fn server_requires_the_token() {
        let dir = std::env::temp_dir().join(format!("gkcc-share-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("share.json");
        let token = "0123456789abcdef01234567".to_string();
        fs::write(&path, serde_json::to_string(&Saved { enabled: true, token: token.clone() }).unwrap()).unwrap();
        let server = Arc::new(Server::http("127.0.0.1:0").unwrap());
        let port = server.server_addr().to_ip().unwrap().port();
        let latest = Arc::new(Mutex::new("{\"cpu_usage\":12}".to_string()));
        let s2 = server.clone();
        let p2 = path.clone();
        thread::spawn(move || serve(s2, latest, p2));

        let get = |path: &str| -> String {
            use std::io::{Read, Write};
            let mut c = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(c, "GET {path} HTTP/1.0\r\nHost: x\r\n\r\n").unwrap();
            let mut out = String::new();
            c.read_to_string(&mut out).unwrap();
            out
        };
        assert!(get("/api/metrics").contains("401"));
        assert!(get("/api/metrics?token=nope").contains("401"));
        let ok = get(&format!("/api/metrics?token={token}"));
        assert!(ok.contains("200") && ok.contains("cpu_usage"), "{ok}");
        assert!(get("/").contains("gklabs"));
        server.unblock();
        let _ = fs::remove_dir_all(&dir);
    }
}
