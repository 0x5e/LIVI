use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use crate::livi_sock::SharedTag;
use crate::vehicle::{Vehicle, VehicleFeed};
use tokio::sync::Notify;

/// Shared helper state: reconnect targets, the tags of the carkit iAP2 sessions, and the
/// phones an iAP2 link is running with. Targets stay in the order LIVI sent them: most
/// recently seen phone first.
#[derive(Default)]
pub struct HelperState {
    reconnect_targets: Mutex<Vec<(String, Option<String>)>>,
    carkit: Mutex<Vec<SharedTag>>,
    links: Mutex<HashSet<String>>,
    vehicle: Vehicle,
    wired: Mutex<HashMap<String, Wired>>,
    redo: Mutex<HashSet<String>>,
}

/// A running wired session: how to end it, and how to have it offer CarPlay again.
struct Wired {
    restart: Arc<Notify>,
    again: Arc<Notify>,
}

impl HelperState {
    pub fn vehicle(&self) -> &Vehicle {
        &self.vehicle
    }

    pub fn vehicle_feed(&self) -> VehicleFeed {
        self.vehicle.feed()
    }

    pub fn wired_started(&self, serial: &str, restart: Arc<Notify>, again: Arc<Notify>) {
        self.wired.lock().unwrap().insert(serial.to_string(), Wired { restart, again });
    }

    pub fn wired_ended(&self, serial: &str) {
        self.wired.lock().unwrap().remove(serial);
    }

    /// Ends every wired iAP2 session.
    pub fn restart_wired(&self) -> usize {
        let wired = self.wired.lock().unwrap();
        let mut redo = self.redo.lock().unwrap();
        for (serial, w) in wired.iter() {
            redo.insert(serial.clone());
            w.restart.notify_one();
        }
        wired.len()
    }

    /// Has this phone's wired session offer CarPlay again over the iAP2 it already runs.
    pub fn start_wired_again(&self, serial: &str) -> bool {
        let wired = self.wired.lock().unwrap();
        wired.get(serial).inspect(|w| w.again.notify_one()).is_some()
    }

    /// Whether this phone's session was ended for a fresh start, once.
    pub fn take_redo(&self, serial: &str) -> bool {
        self.redo.lock().unwrap().remove(serial)
    }

    pub fn link_up(&self, mac: &str) {
        self.links.lock().unwrap().insert(mac.to_uppercase());
    }

    pub fn link_down(&self, mac: &str) {
        self.links.lock().unwrap().remove(&mac.to_uppercase());
    }

    /// True while an iAP2 link runs with this phone, from identification to the end.
    pub fn link_active(&self, mac: &str) -> bool {
        self.links.lock().unwrap().contains(&mac.to_uppercase())
    }

    pub fn set_reconnect_targets(&self, targets: Vec<(String, Option<String>)>) {
        let normalized = targets.into_iter().map(|(m, u)| (m.to_uppercase(), u)).collect();
        *self.reconnect_targets.lock().unwrap() = normalized;
    }

    pub fn reconnect_targets(&self) -> Vec<(String, Option<String>)> {
        self.reconnect_targets.lock().unwrap().clone()
    }

    pub fn carkit_started(&self, tag: SharedTag) {
        self.carkit.lock().unwrap().push(tag);
    }

    pub fn carkit_ended(&self, tag: &SharedTag) {
        self.carkit.lock().unwrap().retain(|t| !Arc::ptr_eq(t, tag));
    }

    /// True when this phone (or any phone, when no MAC is given) runs iAP2 over carkit.
    pub fn carkit_blocks(&self, bt_mac: &str) -> bool {
        let sessions = self.carkit.lock().unwrap();
        if bt_mac.is_empty() {
            return !sessions.is_empty();
        }
        sessions.iter().any(|t| {
            t.lock().unwrap().phone_id.as_deref().is_some_and(|p| p.eq_ignore_ascii_case(bt_mac))
        })
    }

    /// True when iAP2 over Bluetooth with this phone would compete with carkit for it: carkit runs
    /// with this phone, or with one it has not identified yet. The phone takes the transport of
    /// whichever identified last, so a Bluetooth session pulls it off the cable.
    pub fn carkit_claims(&self, bt_mac: &str) -> bool {
        let sessions = self.carkit.lock().unwrap();
        sessions.iter().any(|t| {
            t.lock().unwrap().phone_id.as_deref().is_none_or(|p| p.eq_ignore_ascii_case(bt_mac))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::EventTag;

    fn tag(mac: Option<&str>) -> SharedTag {
        Arc::new(Mutex::new(EventTag { phone_id: mac.map(str::to_string), ..Default::default() }))
    }

    #[test]
    fn blocks_only_the_wired_phone() {
        let state = HelperState::default();
        let wired = tag(Some("0C:6A:C4:4E:F3:2A"));
        state.carkit_started(wired.clone());
        assert!(state.carkit_blocks("0c:6a:c4:4e:f3:2a"));
        assert!(!state.carkit_blocks("AA:BB:CC:DD:EE:FF"));
        state.carkit_ended(&wired);
        assert!(!state.carkit_blocks("0C:6A:C4:4E:F3:2A"));
    }

    #[test]
    fn no_mac_falls_back_to_any_carkit_session() {
        let state = HelperState::default();
        assert!(!state.carkit_blocks(""));
        let unlearned = tag(None);
        state.carkit_started(unlearned.clone());
        assert!(state.carkit_blocks(""));
        // A session that has not learned its phone yet cannot be matched by MAC.
        assert!(!state.carkit_blocks("AA:BB:CC:DD:EE:FF"));
        state.carkit_ended(&unlearned);
        assert!(!state.carkit_blocks(""));
    }

    #[test]
    fn carkit_claims_its_phone_and_any_it_has_not_identified() {
        let state = HelperState::default();
        assert!(!state.carkit_claims("0c:6a:c4:4e:f3:2a"));
        let unidentified = tag(None);
        state.carkit_started(unidentified.clone());
        assert!(state.carkit_claims("AA:BB:CC:DD:EE:FF"));
        unidentified.lock().unwrap().phone_id = Some("0C:6A:C4:4E:F3:2A".into());
        assert!(state.carkit_claims("0c:6a:c4:4e:f3:2a"));
        assert!(!state.carkit_claims("AA:BB:CC:DD:EE:FF"));
        state.carkit_ended(&unidentified);
        assert!(!state.carkit_claims("0c:6a:c4:4e:f3:2a"));
    }

    #[tokio::test]
    async fn a_wired_session_is_asked_for_another_start_without_being_ended() {
        let state = HelperState::default();
        let (restart, again) = (Arc::new(Notify::new()), Arc::new(Notify::new()));
        state.wired_started("00008120", restart.clone(), again.clone());

        assert!(!state.start_wired_again("00008030"));
        assert!(state.start_wired_again("00008120"));
        again.notified().await;
        assert!(!state.take_redo("00008120"));

        state.wired_ended("00008120");
        assert!(!state.start_wired_again("00008120"));
    }

    #[test]
    fn a_phone_with_a_link_is_known_whatever_the_case_of_its_mac() {
        let state = HelperState::default();
        assert!(!state.link_active("0c:6a:c4:4e:f3:2a"));
        state.link_up("0c:6a:c4:4e:f3:2a");
        assert!(state.link_active("0C:6A:C4:4E:F3:2A"));
        state.link_down("0C:6A:C4:4E:F3:2A");
        assert!(!state.link_active("0c:6a:c4:4e:f3:2a"));
    }
}
