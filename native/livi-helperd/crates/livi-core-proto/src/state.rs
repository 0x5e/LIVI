use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

use crate::config::{Config, WifiBand};
use crate::theme::Cluster;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct State {
    pub front: PerScreen<Front>,
    pub sessions: Sessions,
    pub now_playing: NowPlaying,
    pub navigation: Navigation,
    pub system: System,
    pub devices: Vec<DeviceView>,
    #[ts(type = "TelemetrySnapshot & Record<string, unknown>")]
    pub telemetry: Map<String, Value>,
    pub update: Update,
    pub cluster: Cluster,
    pub dab: Dab,
    pub config: Config,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct Dab {
    pub receiver: Option<String>,
    pub stations: Vec<DabStation>,
    pub last_station: Option<u32>,
    pub scan: Option<DabScan>,
    pub active: bool,
    pub station: Option<u32>,
    pub playing: bool,
    pub text: Option<String>,
    pub signal: DabSignal,
    pub error: Option<String>,
    pub gains_db: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct DabStation {
    pub service_id: u32,
    pub label: String,
    pub short_label: String,
    pub ensemble: String,
    pub channel: String,
    pub frequency_hz: u32,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub logo: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct DabScan {
    pub channel: String,
    pub done: u32,
    pub total: u32,
    pub found: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct DabSignal {
    pub locked: bool,
    pub quality: u32,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct Update {
    pub latest: Option<Release>,
    pub checking: bool,
    pub checked: bool,
    pub phase: UpdatePhase,
    pub received: f64,
    pub total: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct Release {
    pub version: String,
    pub commit: String,
    pub run: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export_to = "contract.ts")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Download,
    Ready,
    Installing,
    Relaunching,
    Error,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct DeviceView {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub protocol: Option<Protocol>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_transport: Option<String>,
    pub status: DeviceStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub battery_level: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub battery_charging: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub signal_strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub carrier_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub session: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export_to = "contract.ts")]
pub enum DeviceStatus {
    Active,
    Available,
    #[default]
    Offline,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct System {
    pub wifi_interfaces: Vec<String>,
    pub bt_adapters: Vec<String>,
    pub interface_models: BTreeMap<String, String>,
    pub dongle: Option<DongleRadios>,
    pub link_speed: Option<LinkSpeed>,
    pub wifi_bands: Vec<WifiBand>,
    pub wifi_channels: Vec<u32>,
    pub wifi_countries: Vec<String>,
    pub displays: Vec<Display>,
    pub displays_settable: bool,
    pub audio_sinks: Vec<AudioDevice>,
    pub audio_sources: Vec<AudioDevice>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub offline: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export_to = "contract.ts")]
pub struct DongleRadios {
    pub wifi: bool,
    pub bt: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct LinkSpeed {
    pub down_mbps: f64,
    pub up_mbps: f64,
    pub down_rate: f64,
    pub up_rate: f64,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct Navigation {
    pub active: Option<bool>,
    pub order_type: Option<u32>,
    pub road_name: Option<String>,
    pub after_road_name: Option<String>,
    pub destination_name: Option<String>,
    pub time_to_destination: Option<f64>,
    pub distance_to_destination: Option<f64>,
    pub remain_distance: Option<f64>,
    pub maneuver_type: Option<u32>,
    pub turn_side: Option<u32>,
    pub junction_type: Option<u32>,
    pub turn_angle: Option<i32>,
    pub eta: Option<f64>,
    pub eta_text: Option<String>,
    pub app_name: Option<String>,
    pub image: Option<String>,
    pub maneuver_text: Option<String>,
    pub maneuver_distance_text: Option<String>,
    pub destination_distance_text: Option<String>,
    pub time_left_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct NowPlaying {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub app: Option<String>,
    pub duration_ms: Option<f64>,
    pub elapsed_ms: Option<f64>,
    pub playing: Option<bool>,
    pub artwork: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct Sessions {
    pub active: Option<Protocol>,
    pub position: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export_to = "contract.ts")]
pub enum Protocol {
    Carplay,
    Androidauto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub enum Screen {
    Main,
    Cluster,
    Aux,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub enum Front {
    Livi,
    Projection,
    Cluster,
    Camera,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "contract.ts")]
pub struct Display {
    pub connector: String,
    pub panel: String,
    pub screen: Option<Screen>,
    pub current: Option<String>,
    pub modes: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[ts(export_to = "contract.ts")]
pub struct PerScreen<T> {
    pub main: T,
    pub cluster: T,
    pub aux: T,
}

impl<T> PerScreen<T> {
    pub fn get(&self, screen: Screen) -> &T {
        match screen {
            Screen::Main => &self.main,
            Screen::Cluster => &self.cluster,
            Screen::Aux => &self.aux,
        }
    }

    pub fn get_mut(&mut self, screen: Screen) -> &mut T {
        match screen {
            Screen::Main => &mut self.main,
            Screen::Cluster => &mut self.cluster,
            Screen::Aux => &mut self.aux,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn per_screen_addresses_each_screen() {
        let mut fronts = PerScreen {
            main: Front::Livi,
            cluster: Front::Livi,
            aux: Front::Livi,
        };
        *fronts.get_mut(Screen::Cluster) = Front::Cluster;
        assert_eq!(*fronts.get(Screen::Main), Front::Livi);
        assert_eq!(*fronts.get(Screen::Cluster), Front::Cluster);
        assert_eq!(*fronts.get(Screen::Aux), Front::Livi);
    }

    #[test]
    fn fronts_are_lower_case_on_the_wire() {
        let fronts = PerScreen {
            main: Front::Projection,
            cluster: Front::Cluster,
            aux: Front::Camera,
        };
        assert_eq!(
            serde_json::to_string(&fronts).unwrap(),
            r#"{"main":"projection","cluster":"cluster","aux":"camera"}"#
        );
    }

    #[test]
    fn now_playing_says_null_for_what_the_phone_did_not_tell() {
        let np = NowPlaying {
            title: Some("Song".into()),
            playing: Some(true),
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_value(&np).unwrap(),
            serde_json::json!({
                "title": "Song", "artist": null, "album": null, "app": null,
                "durationMs": null, "elapsedMs": null, "playing": true, "artwork": null
            })
        );
    }

    #[test]
    fn sessions_name_the_protocol_as_the_ui_does() {
        let sessions = Sessions {
            active: Some(Protocol::Androidauto),
            position: 1,
            total: 2,
        };
        assert_eq!(
            serde_json::to_string(&sessions).unwrap(),
            r#"{"active":"androidauto","position":1,"total":2}"#
        );
        assert_eq!(
            serde_json::to_string(&Sessions::default()).unwrap(),
            r#"{"active":null,"position":0,"total":0}"#
        );
    }
}
