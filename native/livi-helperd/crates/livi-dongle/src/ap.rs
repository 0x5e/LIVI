//! The dongle's access point, asked over its control port.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::time::Duration;

use crate::link;

const TIMEOUT: Duration = Duration::from_secs(3);
const POLL: Duration = Duration::from_millis(500);
const WATCH_SILENCE: Duration = Duration::from_secs(15);

/// What the dongle answers to `command`, or None when it does not answer.
fn ask(command: &str) -> Option<HashMap<String, String>> {
    let mut stream = livi_net::connect((link::LINK_NAME, livi_net::port::CONTROL), TIMEOUT).ok()?;
    stream.set_read_timeout(Some(TIMEOUT)).ok()?;
    stream.write_all(format!("{command}\n").as_bytes()).ok()?;
    Some(fields(BufReader::new(stream)))
}

fn fields(answer: impl BufRead) -> HashMap<String, String> {
    let mut fields = HashMap::new();
    for line in answer.lines().map_while(Result::ok) {
        if line == "ok" || line.starts_with("error") {
            break;
        }
        if let Some((key, value)) = line.split_once(' ') {
            fields.insert(key.to_string(), value.trim().to_string());
        }
    }
    fields
}

/// One command that the dongle answers with `ok` or an error.
pub(crate) fn order(command: &str) -> Result<(), String> {
    let mut stream = livi_net::connect((link::LINK_NAME, livi_net::port::CONTROL), TIMEOUT)
        .map_err(|e| format!("dongle: {e}"))?;
    stream.set_read_timeout(Some(TIMEOUT)).map_err(|e| format!("dongle: {e}"))?;
    writeln!(stream, "{command}").map_err(|e| format!("dongle: {e}"))?;
    let mut answer = String::new();
    BufReader::new(&stream).read_line(&mut answer).map_err(|e| format!("dongle: {e}"))?;
    answered(&answer)
}

fn answered(answer: &str) -> Result<(), String> {
    match answer.trim() {
        "ok" => Ok(()),
        other => Err(other.trim_start_matches("error ").to_string()),
    }
}

/// All of `status`, or None when the dongle does not answer.
fn status() -> Option<HashMap<String, String>> {
    ask("status")
}

/// Sends every phone off the access point and says how many.
pub fn deauth() -> Option<usize> {
    ask("deauth")?.get("deauth")?.parse().ok()
}

/// A phone joining (true) or leaving (false) the access point, by its Wi-Fi MAC.
fn station(line: &str) -> Option<(bool, &str)> {
    match line.trim().split_once(' ')? {
        ("joined", mac) => Some((true, mac)),
        ("left", mac) => Some((false, mac)),
        _ => None,
    }
}

/// Hands on every phone that joins or leaves the access point, until the dongle goes.
pub fn watch_stations(mut on: impl FnMut(bool, &str)) -> std::io::Result<()> {
    let mut stream = livi_net::connect((link::LINK_NAME, livi_net::port::CONTROL), TIMEOUT)?;
    stream.set_read_timeout(Some(WATCH_SILENCE))?;
    stream.write_all(b"watch\n")?;
    for line in BufReader::new(stream).lines() {
        if let Some((joined, mac)) = station(&line?) {
            on(joined, mac);
        }
    }
    Ok(())
}

/// One field of `status`, or None when the dongle does not answer.
pub fn status_field(key: &str) -> Option<String> {
    status()?.remove(key)
}

/// The name and channel the access point is on air with, None while it is off.
pub fn on_air() -> Option<(String, u8)> {
    let mut status = status()?;
    if status.get("state")? != "on" {
        return None;
    }
    Some((status.remove("ssid")?, status.get("channel")?.parse().ok()?))
}

/// Waits until the access point is on
pub fn ready(within: Duration) -> bool {
    let deadline = std::time::Instant::now() + within;
    loop {
        if status_field("state").as_deref() == Some("on") {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(POLL);
    }
}

/// The name the access point is really carrying, which is what the phone must look for.
pub fn ssid() -> Option<String> {
    status_field("ssid")
}

/// The MAC the phone is told to look for.
pub fn mac() -> Option<String> {
    status_field("mac")
}

/// The dongle's Bluetooth address, six bytes, most significant first.
pub fn bt_mac() -> Option<[u8; 6]> {
    let text = status_field("btmac")?;
    let mut out = [0u8; 6];
    let mut parts = text.trim().split(':');
    for byte in &mut out {
        *byte = u8::from_str_radix(parts.next()?, 16).ok()?;
    }
    parts.next().is_none().then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_answer_reads_up_to_its_end() {
        let answer = fields("deauth 2\nok\nstate on\n".as_bytes());
        assert_eq!(answer.get("deauth").map(String::as_str), Some("2"));
        assert!(!answer.contains_key("state"));
        assert!(fields("error hostapd is gone\n".as_bytes()).is_empty());
    }

    #[test]
    fn an_order_is_done_on_ok_and_names_what_went_wrong_otherwise() {
        assert_eq!(answered("ok\n"), Ok(()));
        assert_eq!(answered("error not an address\n").unwrap_err(), "not an address");
        assert!(answered("").is_err());
    }

    #[test]
    fn a_watch_line_names_the_phone_and_which_way_it_went() {
        assert_eq!(station("joined 9a:c4:e2:44:5e:0f"), Some((true, "9a:c4:e2:44:5e:0f")));
        assert_eq!(station("left 9a:c4:e2:44:5e:0f\n"), Some((false, "9a:c4:e2:44:5e:0f")));
        assert_eq!(station(""), None);
        assert_eq!(station("ok"), None);
        assert_eq!(station("moved 9a:c4:e2:44:5e:0f"), None);
    }
}
