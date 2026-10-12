//! Vehicle state over CarPlay. The car describes accessories made of services and their
//! characteristics, the phone reads that description, follows values and writes the ones it owns.
//! Every message is OPACK on one of two data streams, one of them for high priority values.

use std::collections::{BTreeMap, BTreeSet};

use crate::bplist;
use crate::opack::{self, Value, dict};

pub const FEATURE: &str = "vehicleStateProtocol";
pub const HIGH_PRIORITY_DATASTREAM_UUID: &str = "FF4A6720-F2BE-4F56-A3E1-DB3B4E37D634";
pub const DATASTREAM_UUID: &str = "3E2F3C61-AAD0-42CB-A8AA-BF22186DA62E";

const PROTOCOL_VERSION: &str = "1.0";
const PLUGIN: &str = "LIVI";
const PLUGIN_ID: i64 = 0;
const ACCESSORY_VERSION: &str = "1.0";
const HIGH_PRIORITY: i64 = 1;
const MAX_LENGTH: i64 = 65535;
/// The answer for a value the car does not hold, or one the phone may not write.
const NO_VALUE: i64 = -6727;
const WRITTEN: i64 = 0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lane {
    High,
    Normal,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Format {
    Bool = 0,
    Uint8 = 1,
    Uint32 = 3,
    String = 10,
    Dict = 12,
    Array = 13,
}

/// The phone writes route data, the car states its own facts.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Owner {
    Phone,
    Car,
}

struct Characteristic {
    iid: i64,
    kind: i64,
    name: &'static str,
    format: Format,
    owner: Owner,
    mutable: bool,
    max: i64,
    initial: Option<Value>,
}

fn phone(iid: i64, kind: i64, name: &'static str, format: Format) -> Characteristic {
    let max = if format == Format::Uint32 { i64::from(u32::MAX) } else { 0 };
    Characteristic {
        iid,
        kind,
        name,
        format,
        owner: Owner::Phone,
        mutable: true,
        max,
        initial: None,
    }
}

fn car(iid: i64, kind: i64, name: &'static str, format: Format, initial: Value) -> Characteristic {
    Characteristic {
        iid,
        kind,
        name,
        format,
        owner: Owner::Car,
        mutable: true,
        max: 0,
        initial: Some(initial),
    }
}

impl Characteristic {
    fn up_to(self, max: i64) -> Self {
        Self { max, ..self }
    }

    fn fixed(self) -> Self {
        Self { mutable: false, ..self }
    }

    fn describe(&self) -> Value {
        let mut d = vec![
            ("iid", Value::Int(self.iid)),
            ("type", Value::Int(self.kind)),
            ("format", Value::Int(self.format as i64)),
            ("mutable", Value::Bool(self.mutable)),
            ("writable", Value::Bool(self.owner == Owner::Phone)),
            ("oemWritable", Value::Bool(self.owner == Owner::Car)),
            ("priority", Value::Int(HIGH_PRIORITY)),
        ];
        match self.format {
            Format::Uint8 | Format::Uint32 => d.extend([
                ("minimumValue", Value::Int(0)),
                ("maximumValue", Value::Int(self.max)),
                ("stepValue", Value::Int(1)),
            ]),
            Format::String | Format::Dict | Format::Array => {
                d.push(("maximumLength", Value::Int(MAX_LENGTH)));
            }
            Format::Bool => {}
        }
        // The phone can clear what it wrote, except for its enumerations.
        if self.owner == Owner::Phone && self.format != Format::Uint8 {
            d.push(("supportsInvalid", Value::Bool(true)));
        }
        if let Some(v) = &self.initial {
            d.push(("initialValue", v.clone()));
        }
        Value::Dict(d.into_iter().map(|(k, v)| (Value::str(k), v)).collect())
    }
}

struct Service {
    iid: i64,
    kind: i64,
    characteristics: Vec<Characteristic>,
}

struct Accessory {
    iid: i64,
    kind: i64,
    services: Vec<Service>,
}

/// Route sharing: the phone hands the car its route, the car says where navigation runs.
fn navigation() -> Accessory {
    use Format::*;
    Accessory {
        iid: 256,
        kind: 0x0E00_0002,
        services: vec![
            Service {
                iid: 257,
                kind: 0x1E00_0104,
                characteristics: vec![
                    phone(258, 0x4500_0103, "applicationEnabled", Bool),
                    phone(259, 0x4500_0112, "currentLegIndex", Uint32),
                    phone(260, 0x4500_0109, "legs", Array),
                    phone(261, 0x4500_010D, "sharingState", Uint8).up_to(4),
                    phone(262, 0x4500_0104, "userEnabled", Bool),
                    car(263, 0x4500_010E, "userVisibleReason", String, Value::str("LIVI")).fixed(),
                    car(264, 0x4500_0105, "vehicleEnabled", Bool, Value::Bool(true)),
                ],
            },
            Service {
                iid: 265,
                kind: 0x1E00_0102,
                characteristics: vec![
                    phone(266, 0x4500_0108, "destination", Dict),
                    phone(267, 0x4500_0106, "geodeticSystem", Uint8).up_to(2),
                    phone(268, 0x4500_0107, "origin", Dict),
                    phone(269, 0x4500_0110, "rerouteReason", Uint8).up_to(6),
                    phone(270, 0x4500_0101, "routeState", Uint8).up_to(255),
                    phone(271, 0x4500_0102, "userVisibleApplicationName", String),
                ],
            },
            Service {
                iid: 272,
                kind: 0x1E00_0103,
                characteristics: vec![
                    car(273, 0x4500_010C, "routeSource", Uint8, Value::Int(0)).up_to(5),
                    car(
                        274,
                        0x4500_010A,
                        "userVisibleNavigationSystemName",
                        String,
                        Value::str("LIVI"),
                    )
                    .fixed(),
                    car(275, 0x4500_0111, "userVisibleVehicleBrand", String, Value::str("LIVI"))
                        .fixed(),
                ],
            },
        ],
    }
}

pub struct VehicleState {
    accessories: Vec<Accessory>,
    values: BTreeMap<i64, Value>,
    followed: BTreeSet<i64>,
    debug: bool,
}

impl VehicleState {
    pub fn new(debug: bool) -> Self {
        let accessories = vec![navigation()];
        let values = accessories
            .iter()
            .flat_map(|a| &a.services)
            .flat_map(|s| &s.characteristics)
            .filter_map(|c| Some((c.iid, c.initial.clone()?)))
            .collect();
        Self { accessories, values, followed: BTreeSet::new(), debug }
    }

    fn characteristic(&self, iid: i64) -> Option<&Characteristic> {
        self.accessories
            .iter()
            .flat_map(|a| &a.services)
            .flat_map(|s| &s.characteristics)
            .find(|c| c.iid == iid)
    }

    fn accessory_list(&self) -> Value {
        Value::Array(
            self.accessories
                .iter()
                .map(|a| {
                    let services = a.services.iter().map(|s| {
                        let characteristics =
                            s.characteristics.iter().map(Characteristic::describe);
                        dict([
                            ("iid", Value::Int(s.iid)),
                            ("type", Value::Int(s.kind)),
                            ("characteristics", Value::Array(characteristics.collect())),
                        ])
                    });
                    dict([
                        ("iid", Value::Int(a.iid)),
                        ("type", Value::Int(a.kind)),
                        ("version", Value::str(ACCESSORY_VERSION)),
                        ("services", Value::Array(services.collect())),
                    ])
                })
                .collect(),
        )
    }

    /// The /info entry that tells the phone the car speaks the protocol and what it describes.
    pub fn info_entry(&self) -> (String, bplist::Value) {
        let plugin = dict([
            ("name", Value::str(PLUGIN)),
            ("pluginID", Value::Int(PLUGIN_ID)),
            ("accessories", self.accessory_list()),
        ]);
        let info = dict([
            ("protocolVersion", Value::str(PROTOCOL_VERSION)),
            ("pluginCount", Value::Int(1)),
            ("pluginMapping", Value::Dict(vec![(Value::str(PLUGIN), Value::Int(PLUGIN_ID))])),
            ("pluginConfigs", Value::Array(vec![plugin])),
        ]);
        ("vehicleStateProtocolInfo".into(), to_plist(&info))
    }

    /// One message from the phone, and what goes back on which stream.
    pub fn handle(&mut self, lane: Lane, message: &[u8]) -> Vec<(Lane, Vec<u8>)> {
        let Some(outer) = opack::decode(message) else {
            println!("[cpVehicle] a {} B message is not OPACK", message.len());
            return Vec::new();
        };
        let plugin = outer.get("pluginID").and_then(Value::as_int);
        let request = outer.get("pluginData").and_then(Value::as_data).and_then(opack::decode);
        let Some(request) = request.filter(|_| plugin == Some(PLUGIN_ID)) else {
            println!("[cpVehicle] message for plugin {plugin:?} without readable data, dropped");
            return Vec::new();
        };
        let transaction = request.get("transactionID").cloned().unwrap_or(Value::Null);
        let values = request.get("values");
        match request.get("command").and_then(Value::as_str).unwrap_or("") {
            "configRequest" => {
                println!("[cpVehicle] phone reads the vehicle description");
                let answer = dict([
                    ("command", Value::str("configResponse")),
                    ("transactionID", transaction),
                    ("values", dict([("accessories", self.accessory_list())])),
                ]);
                vec![(lane, wrap(&answer))]
            }
            "registerRequest" => {
                let iids = values.and_then(Value::as_array).unwrap_or(&[]);
                vec![(lane, wrap(&self.follow(iids, transaction)))]
            }
            "writeRequest" => {
                let written = values.and_then(Value::as_dict).unwrap_or(&[]);
                self.write(lane, written, transaction)
            }
            other => {
                println!("[cpVehicle] phone sent {other:?}, not handled");
                Vec::new()
            }
        }
    }

    fn follow(&mut self, iids: &[Value], transaction: Value) -> Value {
        let mut held = Vec::new();
        let mut missing = Vec::new();
        for iid in iids.iter().filter_map(Value::as_int) {
            self.followed.insert(iid);
            match self.values.get(&iid) {
                Some(v) => held.push((Value::Int(iid), v.clone())),
                None => missing.push((Value::Int(iid), Value::Int(NO_VALUE))),
            }
        }
        println!("[cpVehicle] phone follows {} values, {} of them set", iids.len(), held.len());
        let mut answer = vec![
            (Value::str("command"), Value::str("registerResponse")),
            (Value::str("transactionID"), transaction),
            (Value::str("values"), Value::Dict(held)),
        ];
        if !missing.is_empty() {
            answer.push((Value::str("errors"), Value::Dict(missing)));
        }
        Value::Dict(answer)
    }

    fn write(
        &mut self,
        lane: Lane,
        written: &[(Value, Value)],
        transaction: Value,
    ) -> Vec<(Lane, Vec<u8>)> {
        let mut results = Vec::new();
        let mut changed = Vec::new();
        for (key, v) in written {
            let Some(iid) = key.as_int() else { continue };
            let name = match self.characteristic(iid) {
                Some(c) if c.owner == Owner::Phone => c.name,
                _ => {
                    println!("[cpVehicle] phone may not write value {iid}");
                    results.push((Value::Int(iid), Value::Int(NO_VALUE)));
                    continue;
                }
            };
            if self.debug {
                println!("[cpVehicle] phone wrote {name}: {v:?}");
            } else {
                println!("[cpVehicle] phone wrote {name}");
            }
            results.push((Value::Int(iid), Value::Int(WRITTEN)));
            let before = self.values.insert(iid, v.clone());
            if before.as_ref() != Some(v) && self.followed.contains(&iid) {
                changed.push((Value::Int(iid), v.clone()));
            }
        }
        let answer = dict([
            ("command", Value::str("writeResponse")),
            ("transactionID", transaction),
            ("errors", Value::Dict(results)),
        ]);
        let mut out = vec![(lane, wrap(&answer))];
        if !changed.is_empty() {
            let update =
                dict([("command", Value::str("updateNotify")), ("values", Value::Dict(changed))]);
            out.push((Lane::High, wrap(&update)));
        }
        out
    }
}

fn wrap(inner: &Value) -> Vec<u8> {
    opack::encode(&dict([
        ("pluginID", Value::Int(PLUGIN_ID)),
        ("pluginData", Value::Data(opack::encode(inner))),
    ]))
}

/// The description holds no negative numbers and no empty values, so it converts one to one.
fn to_plist(v: &Value) -> bplist::Value {
    match v {
        Value::Null => bplist::Value::Data(Vec::new()),
        Value::Bool(b) => bplist::Value::Bool(*b),
        Value::Int(n) => bplist::Value::Int(u64::try_from(*n).unwrap_or(0)),
        Value::Real(f) => bplist::Value::Real(*f),
        Value::String(s) => bplist::Value::String(s.clone()),
        Value::Data(d) => bplist::Value::Data(d.clone()),
        Value::Uuid(u) => bplist::Value::Data(u.to_vec()),
        Value::Array(items) => bplist::Value::Array(items.iter().map(to_plist).collect()),
        Value::Dict(entries) => bplist::Value::Dict(
            entries
                .iter()
                .map(|(k, v)| {
                    let key = match k {
                        Value::String(s) => s.clone(),
                        Value::Int(n) => n.to_string(),
                        other => format!("{other:?}"),
                    };
                    (key, to_plist(v))
                })
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        let s: std::string::String = s.split_whitespace().collect();
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    fn opened(answer: &[u8]) -> Value {
        let outer = opack::decode(answer).unwrap();
        assert_eq!(outer.get("pluginID").and_then(Value::as_int), Some(PLUGIN_ID));
        opack::decode(outer.get("pluginData").and_then(Value::as_data).unwrap()).unwrap()
    }

    fn by_iid(entries: &[(i64, Value)]) -> Value {
        Value::Dict(entries.iter().map(|(k, v)| (Value::Int(*k), v.clone())).collect())
    }

    fn command(name: &str, values: Value) -> Vec<u8> {
        wrap(&dict([
            ("command", Value::str(name)),
            ("transactionID", Value::Int(8)),
            ("values", values),
        ]))
    }

    #[test]
    fn info_describes_route_sharing_for_one_plugin() {
        let (key, info) = VehicleState::new(false).info_entry();
        assert_eq!(key, "vehicleStateProtocolInfo");
        assert_eq!(info.get("protocolVersion").and_then(bplist::Value::as_str), Some("1.0"));
        let mapping = info.get("pluginMapping").and_then(|m| m.get(PLUGIN));
        assert_eq!(mapping.and_then(bplist::Value::as_int), Some(0));
        let plugin = &info.get("pluginConfigs").and_then(bplist::Value::as_array).unwrap()[0];
        let accessory = &plugin.get("accessories").and_then(bplist::Value::as_array).unwrap()[0];
        assert_eq!(accessory.get("type").and_then(bplist::Value::as_int), Some(0x0E00_0002));
        let services = accessory.get("services").and_then(bplist::Value::as_array).unwrap();
        let characteristics: Vec<&bplist::Value> = services
            .iter()
            .flat_map(|s| s.get("characteristics").and_then(bplist::Value::as_array).unwrap())
            .collect();
        assert_eq!(characteristics.len(), 16);
        let find = |iid: u64| {
            *characteristics
                .iter()
                .find(|c| c.get("iid").and_then(bplist::Value::as_int) == Some(iid))
                .unwrap()
        };
        let flag = |c: &bplist::Value, k: &str| c.get(k).and_then(bplist::Value::as_bool);
        let number = |c: &bplist::Value, k: &str| c.get(k).and_then(bplist::Value::as_int);

        let destination = find(266);
        assert_eq!(flag(destination, "writable"), Some(true));
        assert_eq!(flag(destination, "oemWritable"), Some(false));
        assert_eq!(flag(destination, "supportsInvalid"), Some(true));
        assert_eq!(number(destination, "maximumLength"), Some(65535));
        assert!(destination.get("initialValue").is_none());

        let sharing = find(261);
        assert_eq!(number(sharing, "maximumValue"), Some(4));
        assert_eq!(number(sharing, "stepValue"), Some(1));
        assert!(sharing.get("supportsInvalid").is_none());
        assert_eq!(number(find(259), "maximumValue"), Some(u64::from(u32::MAX)));

        let brand = find(275);
        assert_eq!(flag(brand, "writable"), Some(false));
        assert_eq!(flag(brand, "oemWritable"), Some(true));
        assert_eq!(flag(brand, "mutable"), Some(false));
        assert_eq!(brand.get("initialValue").and_then(bplist::Value::as_str), Some("LIVI"));
    }

    #[test]
    fn the_phone_reads_follows_and_writes() {
        let mut state = VehicleState::new(false);
        // A configRequest as an iPhone sends it.
        let ask =
            hex("e248706c7567696e4944084a706c7567696e44617461912ee247636f6d6d616e644d636f6e666967
             526571756573744d7472616e73616374696f6e494433b960c362b52ed4f2");
        let answers = state.handle(Lane::High, &ask);
        assert_eq!(answers.len(), 1);
        assert_eq!(answers[0].0, Lane::High);
        let description = opened(&answers[0].1);
        assert_eq!(description.get("command").and_then(Value::as_str), Some("configResponse"));
        assert_eq!(
            description.get("transactionID").and_then(Value::as_int),
            Some(-949_082_264_887_402_311)
        );
        let accessories = description.get("values").and_then(|v| v.get("accessories"));
        assert_eq!(accessories, Some(&state.accessory_list()));

        let iids = [262, 264, 273, 999].map(Value::Int).to_vec();
        let answers = state.handle(Lane::Normal, &command("registerRequest", Value::Array(iids)));
        assert_eq!(answers.len(), 1);
        assert_eq!(answers[0].0, Lane::Normal);
        let followed = opened(&answers[0].1);
        assert_eq!(followed.get("command").and_then(Value::as_str), Some("registerResponse"));
        let held = by_iid(&[(264, Value::Bool(true)), (273, Value::Int(0))]);
        assert_eq!(followed.get("values"), Some(&held));
        let missing = by_iid(&[(262, Value::Int(NO_VALUE)), (999, Value::Int(NO_VALUE))]);
        assert_eq!(followed.get("errors"), Some(&missing));

        let written = by_iid(&[(262, Value::Bool(true)), (264, Value::Bool(false))]);
        let answers = state.handle(Lane::Normal, &command("writeRequest", written));
        assert_eq!(answers.len(), 2);
        assert_eq!(answers[0].0, Lane::Normal);
        let response = opened(&answers[0].1);
        assert_eq!(response.get("command").and_then(Value::as_str), Some("writeResponse"));
        let results = by_iid(&[(262, Value::Int(WRITTEN)), (264, Value::Int(NO_VALUE))]);
        assert_eq!(response.get("errors"), Some(&results));
        assert_eq!(answers[1].0, Lane::High, "updates ride the high priority stream");
        let update = opened(&answers[1].1);
        assert_eq!(update.get("command").and_then(Value::as_str), Some("updateNotify"));
        assert_eq!(update.get("values"), Some(&by_iid(&[(262, Value::Bool(true))])));
        assert!(update.get("transactionID").is_none());
        assert_eq!(state.values.get(&264), Some(&Value::Bool(true)), "the car keeps its own value");

        let same = by_iid(&[(262, Value::Bool(true))]);
        assert_eq!(state.handle(Lane::High, &command("writeRequest", same)).len(), 1);
        let unfollowed = by_iid(&[(266, Value::Dict(Vec::new()))]);
        assert_eq!(state.handle(Lane::High, &command("writeRequest", unfollowed)).len(), 1);
        assert_eq!(state.values.get(&266), Some(&Value::Dict(Vec::new())));
    }

    #[test]
    fn what_cannot_be_read_gets_no_answer() {
        let mut state = VehicleState::new(true);
        assert!(state.handle(Lane::High, b"\xA0").is_empty());
        let inner = opack::encode(&dict([("command", Value::str("configRequest"))]));
        let elsewhere =
            opack::encode(&dict([("pluginID", Value::Int(3)), ("pluginData", Value::Data(inner))]));
        assert!(state.handle(Lane::High, &elsewhere).is_empty());
        assert!(state.handle(Lane::High, &command("unregisterRequest", Value::Null)).is_empty());
        let written = by_iid(&[(270, Value::Int(2))]);
        assert_eq!(state.handle(Lane::High, &command("writeRequest", written)).len(), 1);
    }
}
