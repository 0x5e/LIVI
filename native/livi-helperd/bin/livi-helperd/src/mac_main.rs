// macOS: a wired phone sits on a Mac port and is reached through the system usbmuxd, the MFi chip
// (`mfid`) comes from the LIVI Link dongle over NCM. Wireless CarPlay comes from the dongle too:
// it is the Bluetooth accessory itself and hands the session up on TCP, because macOS has no way
// to lend a foreign controller to its own stack.

use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use iap2_csm::messages::wifi::SecurityType;
use iap2_link::LinkConfig;
use iap2_mfi::{AuthCoprocessor, NcmCoprocessor, NoCoprocessor, local::LocalCoprocessor};
use livi_runtime::bonjour::Bonjour;
use livi_runtime::bringup::{CpConfig, run_accessory};
use livi_runtime::driver::spawn_link_stream;
use livi_runtime::ident::{Identity, Transport};
use livi_runtime::livi_sock::{
    self, Broadcaster, LiviSockConfig, SharedTag, pump_artwork, pump_events_for,
};
use livi_runtime::mfi_async::SharedCoprocessor;
use livi_runtime::state::HelperState;

use crate::link::LinkPresence;

/// How long the access point is waited for before a phone is turned away.
const AP_WAIT: Duration = Duration::from_secs(15);
/// How soon the arriving dongle is offered the paging list again. It pages nobody without it.
const TARGET_RETRY: Duration = Duration::from_millis(500);

/// The published service, kept so nothing drops it while the helper runs.
static BONJOUR: std::sync::OnceLock<Bonjour> = std::sync::OnceLock::new();

fn env_s(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// Software MFi identity from `LIVI_AUTH_DIR` (identity.pk8 + certificate.p7b), loaded the
/// same way MacPlay does. Serves every session while the dongle is absent; the dongle's
/// own chip takes over (and gives this back) as it comes and goes.
fn local_auth() -> Box<dyn AuthCoprocessor + Send> {
    let dir = env_s("LIVI_AUTH_DIR", "");
    if dir.is_empty() {
        return Box::new(NoCoprocessor);
    }
    match LocalCoprocessor::load(std::path::Path::new(&dir)) {
        Ok(chip) => {
            println!("[helperd] local MFi credentials loaded from {dir}");
            Box::new(chip)
        }
        Err(e) => {
            eprintln!("[helperd] local authentication: {e}");
            Box::new(NoCoprocessor)
        }
    }
}

/// 6-byte accessory id: LIVI_CP_BT_MAC if set, else derived from the host pairing id.
fn accessory_mac(pi: &str) -> [u8; 6] {
    if let Ok(s) = std::env::var("LIVI_CP_BT_MAC") {
        let bytes: Vec<u8> = s.split(':').filter_map(|h| u8::from_str_radix(h, 16).ok()).collect();
        if bytes.len() == 6 {
            return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]];
        }
    }
    let mut m = [0x02u8, 0, 0, 0, 0, 0]; // locally-administered
    for (i, b) in pi.bytes().enumerate() {
        m[1 + (i % 5)] ^= b;
    }
    m
}

fn cp_config() -> (CpConfig, Identity) {
    let name = env_s("LIVI_CP_NAME", "LIVI");
    let pi = env_s("LIVI_CP_PI", "");
    let cp = CpConfig {
        ap_mac: None,
        ap_on_air: None,
        wifi_iface: String::new(),
        ssid: name.clone(),
        passphrase: env_s("LIVI_PASSPHRASE", "12345678"),
        channel: env_s("LIVI_CHANNEL", "36").parse().unwrap_or(36),
        security_type: SecurityType::WpaWpa2,
        airplay_port: env_s("LIVI_CP_AIRPLAY_PORT", "").parse().unwrap_or(0),
        source_version: env_s("LIVI_CP_SOURCE_VERSION", "950.7.1"),
        public_key: pi.clone(),
        transport: Transport::Wired,
        av_iface: None, // resolved per session from the interface facing the dongle
        av_iface_late: None,
        available_current_ma: 500,
        on_cable: None,
        start_again: None,
    };
    let identity = Identity { name: name.clone(), ssid: name, bt_mac: accessory_mac(&pi) };
    (cp, identity)
}

/// The same configuration for a phone that joins the dongle's access point, with the values the
/// dongle reports rather than what we hope it used.
fn wireless_config(base: &CpConfig) -> CpConfig {
    CpConfig {
        ap_mac: livi_dongle::ap::mac(),
        ssid: livi_dongle::ap::ssid().unwrap_or_else(|| base.ssid.clone()),
        // The phone reaches us over the dongle's link, so that interface carries the session.
        wifi_iface: livi_runtime::net::iface_facing(livi_dongle::link::LINK_NAME)
            .unwrap_or_default(),
        channel: livi_dongle::ap::status_field("channel")
            .and_then(|c| c.parse().ok())
            .unwrap_or(base.channel),
        transport: Transport::Wireless,
        ..base.clone()
    }
}

/// The same identity, but naming the controller the phone actually talked to.
fn wireless_identity(base: &Identity) -> Identity {
    Identity { bt_mac: livi_dongle::ap::bt_mac().unwrap_or(base.bt_mac), ..base.clone() }
}

/// Runs a CarPlay session for every phone the dongle's own Bluetooth hands over.
async fn wireless_sessions(
    auth: SharedCoprocessor,
    identity: Identity,
    cp: CpConfig,
    bcast: Broadcaster,
    link: Arc<LinkPresence>,
    state: Arc<HelperState>,
) {
    let mut sessions = livi_dongle::iap::sessions(move || link.is_present());
    while let Some(session) = sessions.recv().await {
        if state.carkit_claims(&session.peer) {
            println!("[helperd] {} is on the cable, its Bluetooth link goes", session.peer);
            crate::link::drop_dongle_link(session.peer.to_string());
            continue;
        }
        // The phone is about to be told which network to join, so make sure it is on the air.
        if !tokio::task::spawn_blocking(|| livi_dongle::ap::ready(AP_WAIT)).await.unwrap_or(false) {
            eprintln!("[helperd] the dongle's access point is not up, not starting a session");
            continue;
        }
        let cp = CpConfig {
            on_cable: Some(crate::link::dongle_on_cable(state.clone())),
            ..wireless_config(&cp)
        };
        // The phone is talking to the dongle's controller, so that is the address it must hear.
        let identity = Identity { bt_mac: session.local, ..identity.clone() };
        println!(
            "[helperd] phone connected mac={} over the dongle, ap {} channel {}",
            session.peer,
            cp.ap_mac.clone().unwrap_or_default(),
            cp.channel
        );
        let cfg = LinkConfig { max_outgoing: 4, control_version: 2, ..LinkConfig::default() };
        let (channel, art_rx) = spawn_link_stream(session.stream, cfg, false);
        let (tx, rx) = tokio::sync::mpsc::channel(64);
        tokio::spawn(run_accessory(channel, auth.clone(), identity, cp, tx, state.vehicle_feed()));
        let ident: SharedTag = Default::default();
        tokio::spawn(pump_events_for(rx, bcast.clone(), "bt", None, ident.clone()));
        tokio::spawn(pump_artwork(art_rx, bcast.clone(), ident));
    }
}

/// Each time the link is up: reads the coprocessor generation.
/// Gives the dongle the phones it may page, for as long as the link lasts. It answers only once
/// its accessory is listening, which is a moment after the name resolves.
async fn hand_targets(state: Arc<HelperState>, link: Arc<LinkPresence>) {
    link.wait_until(true).await;
    let mut refused = false;
    while link.is_present() {
        let macs: Vec<String> = state.reconnect_targets().into_iter().map(|(mac, _)| mac).collect();
        let sent = tokio::task::spawn_blocking(move || livi_dongle::iap::set_targets(&macs)).await;
        match sent {
            Ok(Ok(())) => return,
            Ok(Err(e)) if !refused => {
                eprintln!("[helperd] the dongle has no paging list yet: {e}");
                refused = true;
            }
            Ok(Err(_)) => {}
            Err(e) => eprintln!("[helperd] {e}"),
        }
        tokio::time::sleep(TARGET_RETRY).await;
    }
}

async fn identify_on_link(link: Arc<LinkPresence>, mut auth: SharedCoprocessor) {
    use livi_runtime::AsyncAuth;
    loop {
        link.wait_until(true).await;
        let mut reported = false;
        let major = loop {
            if !link.is_present() {
                break None;
            }
            match auth.protocol_major().await {
                Ok(major) => break Some(major),
                Err(e) => {
                    if !reported {
                        eprintln!("[helperd] MFi coprocessor not answering yet: {e}");
                        reported = true;
                    }
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        };
        let Some(major) = major else { continue };
        let kind = if major == 2 { "2.0 (RSA, SHA-1)" } else { "3.0 (ECDSA, SHA-256)" };
        println!("[helperd] MFi coprocessor: auth protocol major {major} — {kind}");
        link.wait_until(false).await;
    }
}

fn start_carplay_seam(link: Arc<LinkPresence>) {
    let (cp, identity) = cp_config();
    let auth = SharedCoprocessor::new(local_auth());
    let bcast = Broadcaster::default();
    let state = Arc::new(HelperState::default());

    // A phone that came in over the dongle's Bluetooth carries on wirelessly, so the session on
    // the socket has to identify the same way. Announcing a USB accessory to it gets turned down.
    let over_dongle = env_s("LIVI_BT_ADAPTER", "") == livi_dongle::link::CHOICE;

    // The dongle's mfid, once its address is known.
    let (up_auth, down_auth) = (auth.clone(), auth.clone());
    let (arriving, handing) = (state.clone(), link.clone());
    let (arrived, left) = (bcast.clone(), bcast.clone());
    tokio::spawn(link.clone().resolve(
        move || {
            up_auth.replace(Box::new(NcmCoprocessor::new(&livi_dongle::link::addr(
                livi_net::port::MFI,
            ))));
            // A dongle that arrives while LIVI runs has heard nothing yet.
            if over_dongle {
                tokio::spawn(hand_targets(arriving.clone(), handing.clone()));
            }
            arrived.push_json("{\"type\":\"link\",\"up\":true}".into());
        },
        move || {
            down_auth.replace(local_auth());
            // Everything it carried is gone with it, and a blocking read would not notice for
            // another ten seconds.
            let closed = livi_dongle::iap::drop_sessions();
            println!("[helperd] the dongle went, closed {closed} session(s)");
            left.push_json("{\"type\":\"link\",\"up\":false}".into());
        },
    ));
    let sock_cfg = LiviSockConfig {
        path: livi_sock::SOCK_PATH.into(),
        identity: if over_dongle { wireless_identity(&identity) } else { identity.clone() },
        cp: if over_dongle { wireless_config(&cp) } else { cp.clone() },
        // No BlueZ here, so the dongle drops the link after the handover and pages for us.
        disconnect: over_dongle
            .then(|| Arc::new(|mac: String| livi_dongle::iap::drop_link(&mac)) as _),
        targets: over_dongle
            .then(|| Arc::new(|macs: Vec<String>| livi_dongle::iap::set_targets(&macs)) as _),
        // The dongle can reappear with a new access-point MAC; resolve it per session so the
        // tunnel names the same accessory the phone joined, not the one seen at start.
        cp_live: over_dongle.then(|| {
            let base = cp.clone();
            Arc::new(move || wireless_config(&base)) as _
        }),
    };
    let (bc, st, a) = (bcast.clone(), state.clone(), auth.clone());
    tokio::spawn(async move {
        let no_bluez = tokio::sync::watch::channel(None).1;
        if let Err(e) = livi_sock::serve(sock_cfg, a, no_bluez, bc, st).await {
            eprintln!("[helperd] livi_sock ended: {e}");
        }
    });

    let (auth_wireless, identity_wireless, cp_wireless) =
        (auth.clone(), identity.clone(), cp.clone());
    tokio::spawn(identify_on_link(link.clone(), auth.clone()));
    let dongle_ap = env_s("LIVI_WIFI_IFACE", "") == livi_dongle::link::CHOICE;
    tokio::spawn(crate::wired::watch_usbmuxd(
        auth,
        identity,
        cp.clone(),
        crate::wired::Dongle {
            ap_mac: dongle_ap.then_some(livi_dongle::ap::mac as fn() -> Option<String>),
            bt_mac: over_dongle.then_some(livi_dongle::ap::bt_mac as fn() -> Option<[u8; 6]>),
        },
        bcast.clone(),
        state.clone(),
        // System usbmuxd phones need no dongle; local MFi credentials answer for the chip.
        LinkPresence::always(),
    ));
    println!("[helperd] wired CarPlay watcher started (system usbmuxd), waiting for the LIVI Link");
    if dongle_ap {
        tokio::spawn(crate::link::relay_stations(bcast.clone()));
    }
    // Wireless CarPlay comes over the dongle's own Bluetooth, and only when it is the chosen one.
    if env_s("LIVI_BT_ADAPTER", "") == livi_dongle::link::CHOICE {
        tokio::spawn(wireless_sessions(
            auth_wireless,
            identity_wireless,
            cp_wireless,
            bcast.clone(),
            link.clone(),
            state,
        ));
        println!("[helperd] wireless CarPlay over the dongle's bluetooth is on");
    }

    if cp.airplay_port == 0 {
        eprintln!("[helperd] LIVI opened no CarPlay port, CarPlay is not announced");
        return;
    }
    let pk = env_s("LIVI_CP_PK", "");
    let pi = env_s("LIVI_CP_PI", "");
    let [a, b, c, d, e, f] = accessory_mac(&pi);
    let device_id = format!("{a:02x}:{b:02x}:{c:02x}:{d:02x}:{e:02x}:{f:02x}");
    match Bonjour::start(
        device_id,
        cp.airplay_port as u16,
        cp.source_version.clone(),
        pk,
        pi,
        bcast,
    ) {
        Ok(b) => {
            // Held for the life of the process. A static is never dropped, so `bonjour::stop`
            // ends its publisher.
            let _ = BONJOUR.set(b);
            println!(
                "[helperd] CarPlay receiver seam ready (cp-bt.sock + bonjour :{})",
                cp.airplay_port
            );
        }
        Err(e) => eprintln!("[helperd] bonjour start failed: {e}"),
    }
}

pub fn run() -> ExitCode {
    let rt = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("[helperd] runtime: {e}");
            return ExitCode::FAILURE;
        }
    };
    rt.block_on(async {
        let dongle_ap = env_s("LIVI_WIFI_IFACE", "") == livi_dongle::link::CHOICE;
        let shared = livi_runtime::shared_sock::SharedSockDeps {
            adapter: String::new(),
            wifi_iface: String::new(),
            events: Broadcaster::default(),
            set_playback_status: Box::new(|_| {}),
            deauth_dongle: dongle_ap.then_some(livi_dongle::ap::deauth as fn() -> Option<usize>),
        };
        tokio::spawn(async move {
            let path = livi_runtime::shared_sock::SOCK_PATH;
            if let Err(e) = livi_runtime::shared_sock::serve(path, None, shared).await {
                eprintln!("[shared-sock] ended: {e}");
            }
        });
        let aa_events = Broadcaster::default();
        let usb_control = livi_aa::usb::Control::default();
        let deps = livi_runtime::aa_sock::AaSockDeps {
            set_wired_phones: Box::new(|_| {}),
            restart_usb: Box::new({
                let usb = usb_control.clone();
                move |serial| usb.restart(serial)
            }),
            events: aa_events.clone(),
            set_sco_sink: Box::new(|_| {}),
        };
        tokio::spawn(async move {
            if let Err(e) = livi_runtime::aa_sock::serve(deps).await {
                eprintln!("[aa-sock] ended: {e}");
            }
        });
        let events = aa_events.clone();
        let subscribed = aa_events.clone();
        tokio::spawn(livi_aa::usb::run(
            usb_control,
            move |socket, peer, serial| {
                events.push_json(format!(
                    "{{\"event\":\"aa-session\",\"socket\":\"{socket}\",\"peer\":\"{peer}\",\"transport\":\"usb\",\"serial\":\"{serial}\"}}"
                ));
            },
            async move { subscribed.subscribed().await },
        ));
        println!("[helperd] Android Auto USB watcher started");
        let link = LinkPresence::new();
        let link_state = link.clone();
        tokio::spawn(livi_dongle::run(move |on, _serial| link_state.set_on_bus(on)));
        println!("[helperd] dongle watcher started");

        start_carplay_seam(link);

        crate::shutdown_signal().await;
        println!("[helperd] shutting down");
        livi_runtime::bonjour::stop();
    });
    ExitCode::SUCCESS
}
