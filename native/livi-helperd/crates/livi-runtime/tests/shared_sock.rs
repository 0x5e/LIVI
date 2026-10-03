use std::sync::{Arc, Mutex};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;

use livi_runtime::livi_sock::Broadcaster;
use livi_runtime::shared_sock::{SharedSockDeps, serve};

fn deps() -> SharedSockDeps {
    SharedSockDeps {
        adapter: "hci0".into(),
        wifi_iface: "none0".into(),
        events: Broadcaster::default(),
        set_playback_status: Box::new(|_| {}),
        deauth_dongle: Some(|| Some(2)),
        deauth: None,
    }
}

fn path(name: &str) -> String {
    std::env::temp_dir()
        .join(format!("livi-shared-{name}-{}", std::process::id()))
        .to_string_lossy()
        .to_string()
}

async fn listening(path: &str) {
    for _ in 0..50 {
        if UnixStream::connect(path).await.is_ok() {
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
}

async fn request(path: &str, line: &str) -> String {
    let stream = UnixStream::connect(path).await.unwrap();
    let mut reader = BufReader::new(stream);
    reader.get_mut().write_all(format!("{line}\n").as_bytes()).await.unwrap();
    let mut resp = String::new();
    reader.read_line(&mut resp).await.unwrap();
    resp.trim().to_string()
}

#[tokio::test]
async fn one_phone_leaves_the_access_point_or_all_of_them() {
    let path = path("deauth");
    let sent_off = Arc::new(Mutex::new(Vec::new()));
    let heard = sent_off.clone();
    let deps = SharedSockDeps {
        deauth: Some(Arc::new(move |mac: String| {
            heard.lock().unwrap().push(mac);
            Ok(())
        })),
        ..deps()
    };
    let server = tokio::spawn({
        let path = path.clone();
        async move { serve(&path, None, deps).await }
    });
    listening(&path).await;

    assert!(request(&path, "deauth 9a:c4:e2:44:5e:0f").await.contains("\"ok\":true"));
    assert_eq!(*sent_off.lock().unwrap(), vec!["9a:c4:e2:44:5e:0f".to_string()]);
    assert!(request(&path, "deauth").await.contains("\"ok\":false"));
    assert_eq!(request(&path, "deauth-ap").await, "{\"ok\":true,\"count\":2}");

    server.abort();
    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn without_an_access_point_nobody_is_sent_off() {
    let path = path("no-ap");
    let server = tokio::spawn({
        let path = path.clone();
        async move { serve(&path, None, deps()).await }
    });
    listening(&path).await;

    assert!(request(&path, "deauth 9a:c4:e2:44:5e:0f").await.contains("no access point"));

    server.abort();
    let _ = std::fs::remove_file(&path);
}

#[tokio::test]
async fn the_player_state_and_the_events_reach_their_ends() {
    let path = path("player");
    let states = Arc::new(Mutex::new(Vec::new()));
    let heard = states.clone();
    let events = Broadcaster::default();
    let deps = SharedSockDeps {
        set_playback_status: Box::new(move |s| heard.lock().unwrap().push(s.to_string())),
        events: events.clone(),
        ..deps()
    };
    let server = tokio::spawn({
        let path = path.clone();
        async move { serve(&path, None, deps).await }
    });
    listening(&path).await;

    assert!(request(&path, "playback-status playing").await.contains("\"ok\":true"));
    assert!(request(&path, "playback-status rewinding").await.contains("\"ok\":false"));
    assert_eq!(*states.lock().unwrap(), vec!["playing".to_string()]);
    // No BlueZ without a bus, and nothing the socket does not know.
    assert!(request(&path, "list_paired").await.contains("bluetooth unavailable"));
    assert!(request(&path, "bogus").await.contains("unknown command"));

    let stream = UnixStream::connect(&path).await.unwrap();
    let mut reader = BufReader::new(stream);
    reader.get_mut().write_all(b"subscribe\n").await.unwrap();
    events.subscribed().await;
    events.push_json("{\"event\":\"input\",\"command\":\"next\"}".into());
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    assert!(line.contains("\"command\":\"next\""));

    server.abort();
    let _ = std::fs::remove_file(&path);
}
