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
const CELSIUS: i64 = 1082;
const KILOMETERS: i64 = 151;
const MILES: i64 = 164;
const KILOPASCALS: i64 = 932;
const PERCENT: i64 = 1205;
const MILLILITERS_PER_100_KM: i64 = 674;
const REVOLUTIONS_PER_MINUTE: i64 = 981;
const KILOWATTS: i64 = 884;
/// The answer for a value the car does not hold, or one the phone may not write.
const NO_VALUE: i64 = -6727;
const WRITTEN: i64 = 0;
/// The answer for a command the car does not offer.
const NO_SUCH_COMMAND: i64 = -6735;
const SENT_BY_PHONE: i64 = 0;
/// Lists and pictures go over the large value path.
const LARGE_LENGTH: i64 = 2_147_483_647;

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
    Uint64 = 4,
    Int32 = 7,
    Float = 9,
    String = 10,
    Data = 11,
    Dict = 12,
    Array = 13,
}

/// The phone writes route data, the car states its own facts, and climate settings are asked for
/// by the phone and held by the car.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Owner {
    Phone,
    Car,
    Shared,
}

struct Characteristic {
    iid: i64,
    kind: i64,
    name: &'static str,
    format: Format,
    owner: Owner,
    mutable: bool,
    range: Option<(f64, f64, f64)>,
    units: Option<i64>,
    /// Said out loud, Siri leaves a value alone otherwise.
    enabled: bool,
    large: bool,
    initial: Option<Value>,
}

fn characteristic(
    iid: i64,
    kind: i64,
    name: &'static str,
    format: Format,
    owner: Owner,
    initial: Option<Value>,
) -> Characteristic {
    // The phone ignores a count whose description carries no bounds.
    let counts = matches!(format, Format::Uint32 | Format::Uint64);
    let range = counts.then_some((0.0, f64::from(u32::MAX), 1.0));
    Characteristic {
        iid,
        kind,
        name,
        format,
        owner,
        mutable: true,
        range,
        units: None,
        enabled: false,
        large: false,
        initial,
    }
}

fn phone(iid: i64, kind: i64, name: &'static str, format: Format) -> Characteristic {
    characteristic(iid, kind, name, format, Owner::Phone, None)
}

fn car(iid: i64, kind: i64, name: &'static str, format: Format, initial: Value) -> Characteristic {
    characteristic(iid, kind, name, format, Owner::Car, Some(initial))
}

fn shared(
    iid: i64,
    kind: i64,
    name: &'static str,
    format: Format,
    initial: Value,
) -> Characteristic {
    characteristic(iid, kind, name, format, Owner::Shared, Some(initial))
}

impl Characteristic {
    fn up_to(self, max: u32) -> Self {
        self.between(0.0, f64::from(max), 1.0)
    }

    fn between(self, min: f64, max: f64, step: f64) -> Self {
        Self { range: Some((min, max, step)), ..self }
    }

    fn enabled(self) -> Self {
        Self { enabled: true, ..self }
    }

    fn in_units(self, units: i64) -> Self {
        Self { units: Some(units), ..self }
    }

    fn fixed(self) -> Self {
        Self { mutable: false, ..self }
    }

    fn large(self) -> Self {
        Self { large: true, ..self }
    }

    /// A value from outside the phone, held to the range and steps the phone was told.
    fn take(&self, v: &serde_json::Value) -> Option<Value> {
        if self.format == Format::Bool {
            return v.as_bool().map(Value::Bool);
        }
        let mut n = v.as_f64().filter(|n| n.is_finite())?;
        if let Some((min, max, step)) = self.range {
            n = (min + ((n - min) / step).round() * step).clamp(min, max);
        }
        match self.format {
            Format::Float => Some(Value::Real(n)),
            Format::Uint8 | Format::Uint32 | Format::Uint64 | Format::Int32 => {
                Some(Value::Int(n.round() as i64))
            }
            _ => None,
        }
    }

    fn describe(&self) -> Value {
        let mut d = vec![
            ("iid", Value::Int(self.iid)),
            ("type", Value::Int(self.kind)),
            ("format", Value::Int(self.format as i64)),
            ("mutable", Value::Bool(self.mutable)),
            ("writable", Value::Bool(self.owner != Owner::Car)),
            ("oemWritable", Value::Bool(self.owner != Owner::Phone)),
            ("priority", Value::Int(HIGH_PRIORITY)),
        ];
        let number = |n: f64| match self.format {
            Format::Float => Value::Real(n),
            _ => Value::Int(n as i64),
        };
        if let Some((min, max, step)) = self.range {
            d.extend([
                ("minimumValue", number(min)),
                ("maximumValue", number(max)),
                ("stepValue", number(step)),
            ]);
        }
        if matches!(self.format, Format::String | Format::Data | Format::Dict | Format::Array) {
            let length = if self.large { LARGE_LENGTH } else { MAX_LENGTH };
            d.push(("maximumLength", Value::Int(length)));
        }
        if self.large {
            d.push(("largePayload", Value::Bool(true)));
        }
        if self.enabled {
            d.push(("disabled", Value::Bool(false)));
        }
        if let Some(units) = self.units {
            d.push(("units", Value::Int(units)));
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
    name: &'static str,
    iid: i64,
    kind: i64,
    services: Vec<Service>,
}

/// A command the phone sends the car, with the name and format of each value it carries.
struct Control {
    iid: i64,
    kind: i64,
    name: &'static str,
    parameters: Vec<(&'static str, Format)>,
}

impl Control {
    fn describe(&self) -> Value {
        let mut d = vec![
            ("iid", Value::Int(self.iid)),
            ("type", Value::Int(self.kind)),
            ("sender", Value::Int(SENT_BY_PHONE)),
            ("hasResponse", Value::Bool(true)),
        ];
        if !self.parameters.is_empty() {
            let parameters = self.parameters.iter().map(|(name, format)| {
                dict([("name", Value::str(name)), ("format", Value::Int(*format as i64))])
            });
            d.push(("requestParameters", Value::Array(parameters.collect())));
        }
        Value::Dict(d.into_iter().map(|(k, v)| (Value::str(k), v)).collect())
    }
}

/// LIVI's own radio as the phone's Radio app shows it.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Radio {
    /// False while no receiver is plugged in.
    pub available: bool,
    pub stations: Vec<RadioStation>,
    /// Identifier of the tuned station.
    pub current: Option<String>,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// JPEG or PNG, empty for none.
    pub artwork: Vec<u8>,
    pub playing: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RadioStation {
    pub id: String,
    pub name: String,
    pub short_name: String,
    pub ensemble: String,
    /// JPEG or PNG the station sent.
    pub image: Option<Vec<u8>>,
}

/// What the Radio app asks the car's radio to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RadioCommand {
    Tune(String),
    Play,
    Pause,
    Next,
    Previous,
}

const RADIO_SOURCE: &str = "DAB";
const DAB_SOURCE: i64 = 6;
const RADIO_SOURCE_SERVICE: i64 = 4097;
const RADIO_DISABLED: i64 = 4100;
const RADIO_CURRENT_ITEM: i64 = 4102;
const RADIO_ITEMS: i64 = 4103;
const RADIO_ITEM_IMAGES: i64 = 4104;
const NOW_PLAYING_SERVICE: i64 = 4353;
const NOW_PLAYING_SOURCE: i64 = 4354;
const NOW_PLAYING_TITLE: i64 = 4355;
const NOW_PLAYING_ARTIST: i64 = 4356;
const NOW_PLAYING_ALBUM: i64 = 4357;
const NOW_PLAYING_ARTWORK: i64 = 4358;
const PLAYBACK_STATE: i64 = 4359;
const PAUSED: i64 = 0;
const PLAYING: i64 = 1;

/// The car's own sources for the phone's Radio app, one DAB+ source.
fn media() -> Accessory {
    use Format::*;
    Accessory {
        name: "media",
        iid: 4096,
        kind: 0x0300_0001,
        services: vec![Service {
            iid: RADIO_SOURCE_SERVICE,
            kind: 0x1400_0006,
            characteristics: vec![
                car(4098, 0x3000_0019, "mediaSourceIdentifier", String, Value::str(RADIO_SOURCE))
                    .fixed(),
                car(4099, 0x3200_0025, "mediaSourceSemanticType", Uint8, Value::Int(DAB_SOURCE))
                    .fixed(),
                car(RADIO_DISABLED, 0x3200_0011, "mediaSourceDisabled", Bool, Value::Bool(true)),
                car(4101, 0x3000_0001, "mediaSourceLabel", String, Value::str("DAB+")),
                car(RADIO_CURRENT_ITEM, 0x3200_0026, "currentMediaItem", String, Value::str("")),
                car(RADIO_ITEMS, 0x3200_0012, "mediaItems", Array, Value::Array(Vec::new()))
                    .large(),
                car(
                    RADIO_ITEM_IMAGES,
                    0x3200_0031,
                    "mediaItemImages",
                    Array,
                    Value::Array(Vec::new()),
                )
                .large(),
            ],
        }],
    }
}

/// What the Radio app shows as playing.
fn now_playing() -> Accessory {
    use Format::*;
    Accessory {
        name: "nowPlaying",
        iid: 4352,
        kind: 0x0F00_0001,
        services: vec![Service {
            iid: NOW_PLAYING_SERVICE,
            kind: 0x1400_0001,
            characteristics: vec![
                car(
                    NOW_PLAYING_SOURCE,
                    0x3200_0023,
                    "currentMediaSource",
                    String,
                    Value::str(RADIO_SOURCE),
                ),
                car(NOW_PLAYING_TITLE, 0x3200_0003, "title", String, Value::str("")),
                car(NOW_PLAYING_ARTIST, 0x3200_0004, "artist", String, Value::str("")),
                car(NOW_PLAYING_ALBUM, 0x3200_0005, "album", String, Value::str("")),
                car(NOW_PLAYING_ARTWORK, 0x3200_0020, "artwork", Data, Value::Data(Vec::new()))
                    .large(),
                car(PLAYBACK_STATE, 0x3200_0034, "playbackState", Uint8, Value::Int(PAUSED)),
            ],
        }],
    }
}

/// The Radio app's commands to the car, all on the now playing service.
fn radio_controls() -> Vec<(i64, Control)> {
    use Format::*;
    let command = |iid, kind, name, parameters| {
        (NOW_PLAYING_SERVICE, Control { iid, kind, name, parameters })
    };
    vec![
        command(4360, 0x0F00_0032, "play", Vec::new()),
        command(4361, 0x0F00_0033, "pause", Vec::new()),
        command(4362, 0x0F00_0035, "nextItem", Vec::new()),
        command(4363, 0x0F00_0036, "previousItem", Vec::new()),
        command(
            4364,
            0x0F00_004B,
            "tuneToIdentifier",
            vec![("identifier", String), ("sourceIdentifier", String)],
        ),
        command(
            4365,
            0x0F00_004C,
            "tuneToFrequency",
            vec![("frequency", Uint32), ("sourceIdentifier", String)],
        ),
        command(4366, 0x0F00_004D, "changeMediaSource", vec![("identifier", String)]),
    ]
}

fn radio_item(s: &RadioStation) -> Value {
    let mut d = vec![
        ("identifier", Value::str(&s.id)),
        ("mediaItemName", Value::str(&s.name)),
        ("mediaItemShortName", Value::str(&s.short_name)),
        ("mediaItemType", Value::str("dab")),
        ("ensemble", Value::str(&s.ensemble)),
        ("mediaItemCategory", Value::Int(0)),
    ];
    if s.image.is_some() {
        d.push(("mediaItemImageIdentifier", Value::str(&s.id)));
    }
    Value::Dict(d.into_iter().map(|(k, v)| (Value::str(k), v)).collect())
}

/// Route sharing: the phone hands the car its route, the car says where navigation runs.
fn navigation() -> Accessory {
    use Format::*;
    Accessory {
        name: "navigation",
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

const INTERIOR_STYLE: i64 = 770;
const EXTERIOR_STYLE: i64 = 771;
const VEHICLE_LAYOUT: i64 = 772;

/// Names the interior picture in the car maker's theme, without one the climate page shows a placeholder.
fn vehicle_resources() -> Accessory {
    use Format::*;
    Accessory {
        name: "vehicle resources",
        iid: 768,
        kind: 0x0120_0002,
        services: vec![Service {
            iid: 769,
            kind: 0x2000_0001,
            characteristics: vec![
                car(INTERIOR_STYLE, 0x4800_0004, "interiorStyle", String, Value::str("5Seater"))
                    .fixed(),
            ],
        }],
    }
}

/// Climate: the phone and Siri ask for settings, the car holds them and reports back.
fn climate() -> Accessory {
    use Format::*;
    let on = |iid, name, initial| shared(iid, 0x3000_0002, name, Bool, Value::Bool(initial));
    let seat =
        |iid, key| car(iid, 0x3600_0065, "vehicleLayoutKey", String, Value::str(key)).fixed();
    let zone = |iid, names: [&'static str; 3], key| Service {
        iid,
        kind: 0x1100_0002,
        characteristics: vec![
            on(iid + 1, names[0], true),
            shared(iid + 2, 0x3100_0017, names[1], Float, Value::Real(21.0))
                .between(TEMPERATURE_LO, TEMPERATURE_HI, 0.5)
                .in_units(CELSIUS),
            car(iid + 3, 0x3100_0019, names[2], Float, Value::Real(21.0))
                .between(-40.0, 85.0, 0.5)
                .in_units(CELSIUS),
            seat(iid + 4, key),
        ],
    };
    Accessory {
        name: "climate",
        iid: 512,
        kind: 0x0100_0001,
        services: vec![
            Service {
                iid: 513,
                kind: 0x1100_0001,
                characteristics: vec![
                    shared(HVAC_ON, 0x3100_0002, "hvacOn", Bool, Value::Bool(true)),
                    shared(COMPRESSOR, 0x3100_0003, "compressorOn", Bool, Value::Bool(true)),
                    shared(MAX_AC, 0x3100_0022, "maxACOn", Bool, Value::Bool(false)),
                    shared(MAX_DEFROST, 0x3100_0029, "maxDefrostOn", Bool, Value::Bool(false)),
                ],
            },
            zone(
                518,
                ["driverTemperatureOn", "driverTargetTemperature", "driverCurrentTemperature"],
                "seat_front_left",
            ),
            zone(
                532,
                [
                    "passengerTemperatureOn",
                    "passengerTargetTemperature",
                    "passengerCurrentTemperature",
                ],
                "seat_front_right",
            ),
            Service {
                iid: 523,
                kind: 0x1100_0007,
                characteristics: vec![
                    on(524, "fanOn", true),
                    shared(525, 0x3100_0012, "fanLevel", Uint8, Value::Int(3)).up_to(7),
                    shared(FAN_AUTO, 0x3000_005F, "fanAutoMode", Bool, Value::Bool(true)),
                    seat(531, "seat_front"),
                ],
            },
            Service {
                iid: 527,
                kind: 0x1100_0011,
                characteristics: vec![on(RECIRCULATION, "recirculationOn", false)],
            },
            Service {
                iid: 529,
                kind: 0x1100_0008,
                characteristics: vec![on(AUTO_CLIMATE, "autoClimateOn", true)],
            },
            Service {
                iid: 537,
                kind: 0x1100_0012,
                characteristics: vec![
                    on(ZONES_SYNCED, "zonesSynced", false),
                    seat(539, "seat_front"),
                ],
            },
            window_heating(WINDOWS[0], "frontWindowHeatingLevel", "windshield_front"),
            window_heating(WINDOWS[1], "rearWindowHeatingLevel", "windshield_rear"),
            vent(VENTS[0], ["upperVentOn", "upperVentAutoMode"], UPPER, false),
            vent(VENTS[1], ["middleVentOn", "middleVentAutoMode"], MIDDLE, true),
            vent(VENTS[2], ["lowerVentOn", "lowerVentAutoMode"], LOWER, false),
        ],
    }
}

/// One vent with its own button, the climate app shows each as one.
fn vent(iid: i64, names: [&'static str; 2], direction: i64, on: bool) -> Service {
    use Format::*;
    Service {
        iid,
        kind: 0x1100_0006,
        characteristics: vec![
            shared(iid + 1, 0x3000_0002, names[0], Bool, Value::Bool(on)),
            shared(iid + 2, 0x3000_005F, names[1], Bool, Value::Bool(true)),
            car(
                iid + 3,
                0x3100_0025,
                "ventCombinations",
                Array,
                Value::Array(vec![Value::Int(direction)]),
            )
            .fixed(),
            car(iid + 4, 0x3600_0065, "vehicleLayoutKey", String, Value::str("seat_front")).fixed(),
        ],
    }
}

const UPPER: i64 = 2;
const LOWER: i64 = 4;
const MIDDLE: i64 = 16;
/// Top, middle and bottom vent, on and automatic of each at the next two iids.
const VENTS: [i64; 3] = [548, 553, 558];
const AUTO_CLIMATE: i64 = 530;
const FAN_AUTO: i64 = 526;
const HVAC_ON: i64 = 514;
const COMPRESSOR: i64 = 515;
const MAX_AC: i64 = 516;
const MAX_DEFROST: i64 = 517;
const RECIRCULATION: i64 = 528;
/// Front and rear window, the heating level of each at the next iid.
const WINDOWS: [i64; 2] = [540, 544];
/// Shown as LO and HI at the ends of the scale.
const TEMPERATURE_LO: f64 = 16.0;
const TEMPERATURE_HI: f64 = 28.0;

/// A heated window, wires in the glass, on or off.
fn window_heating(iid: i64, name: &'static str, key: &'static str) -> Service {
    use Format::*;
    const FILAMENT: i64 = 2;
    Service {
        iid,
        kind: 0x1100_0005,
        characteristics: vec![
            shared(iid + 1, 0x3000_0004, name, Uint8, Value::Int(0)).up_to(1),
            car(iid + 2, 0x3100_0014, "defrostTypes", Uint8, Value::Int(FILAMENT)).up_to(7).fixed(),
            car(iid + 3, 0x3600_0065, "vehicleLayoutKey", String, Value::str(key)).fixed(),
        ],
    }
}

const LIVI_SECTION: &str = "LIVI";

/// One read only line in the LIVI section of the vehicle app's menu, seven iids from `iid` on.
fn info_line(iid: i64, id: &str, label: &str, value: &str, symbol: &str, order: i64) -> Service {
    use Format::*;
    let value = if value.is_empty() { "?" } else { value };
    Service {
        iid,
        kind: 0x1600_0015,
        characteristics: vec![
            car(iid + 1, 0x3000_0019, "settingIdentifier", String, Value::str(id)).fixed(),
            car(iid + 2, 0x3000_0001, "settingLabel", String, Value::str(label)).fixed(),
            car(iid + 3, 0x3000_0017, "settingValue", String, Value::str(value)).fixed(),
            car(iid + 4, 0x3600_0006, "settingsCategory", Uint8, Value::Int(0)).up_to(15).fixed(),
            car(iid + 5, 0x3000_005E, "settingSymbol", String, Value::str(symbol)).fixed(),
            car(iid + 6, 0x3000_0003, "settingSortOrder", Uint8, Value::Int(order))
                .up_to(100)
                .fixed(),
            car(iid + 7, 0x3600_0028, "settingSection", String, Value::str(LIVI_SECTION)).fixed(),
        ],
    }
}

/// The vehicle app's menu: a LIVI section with the version and when it was built. The phone
/// orders the lines by their labels, so the build line's label starts with the version's.
fn automaker_settings(app_version: &str, build_date: &str) -> Accessory {
    use Format::*;
    Accessory {
        name: "automaker settings",
        iid: 1280,
        kind: 0x0500_0001,
        services: vec![
            info_line(1281, "LiviVersion", "Version", app_version, "info.circle", 0),
            info_line(1289, "LiviVersionBuildDate", "Version Build", build_date, "hammer", 1),
            Service {
                iid: 1297,
                kind: 0x1600_0020,
                characteristics: vec![
                    car(1298, 0x3000_0019, "sectionIdentifier", String, Value::str(LIVI_SECTION))
                        .fixed(),
                    car(1299, 0x3000_0003, "sectionSortOrder", Uint8, Value::Int(0))
                        .up_to(100)
                        .fixed(),
                    car(1300, 0x3600_0004, "sectionName", String, Value::str(LIVI_SECTION)).fixed(),
                ],
            },
        ],
    }
}

/// Heating only, the description cannot carry the negative levels of cooling.
fn seats() -> Accessory {
    use Format::*;
    let heating = |iid, names: [&'static str; 2], key| Service {
        iid,
        kind: 0x2200_0001,
        characteristics: vec![
            shared(iid + 1, 0x3100_0021, names[0], Int32, Value::Int(0)).up_to(2),
            shared(iid + 2, 0x3000_0002, names[1], Bool, Value::Bool(false)),
            car(iid + 3, 0x3600_0065, "vehicleLayoutKey", String, Value::str(key)).fixed(),
        ],
    };
    Accessory {
        name: "seats",
        iid: 1024,
        kind: 0x0150_0001,
        services: vec![
            heating(1025, ["driverSeatHeatingLevel", "driverSeatHeatingOn"], "seat_front_left"),
            heating(
                1029,
                ["passengerSeatHeatingLevel", "passengerSeatHeatingOn"],
                "seat_front_right",
            ),
        ],
    }
}

/// A distance the car shows in either unit, the miles sit one iid above the kilometres.
#[derive(Clone, Copy)]
struct Distance {
    km: i64,
    hidden: Option<i64>,
    /// Kilometres, miles, hidden.
    names: [&'static str; 3],
}

const FUEL_LEVEL: i64 = 1538;
const FUEL_RANGE: Distance = Distance {
    km: 1541,
    hidden: Some(1543),
    names: ["fuelRangeKm", "fuelRangeMiles", "fuelRangeHidden"],
};
const FUEL_EFFICIENCY: i64 = 1545;
const AVERAGE_FUEL_EFFICIENCY: i64 = 1546;
const REMAINING_RANGE: Distance = Distance {
    km: 1794,
    hidden: Some(1796),
    names: ["remainingRangeKm", "remainingRangeMiles", "remainingRangeHidden"],
};
const ODOMETER: Distance =
    Distance { km: 1798, hidden: None, names: ["odometerKm", "odometerMiles", ""] };
const LOW_FUEL_PCT: i64 = 10;
const KM_PER_MILE: f64 = 1.609_344;

fn distance(iid: i64, kind: i64, d: Distance) -> Service {
    use Format::*;
    let mut characteristics = vec![
        car(d.km, 0x3000_004A, d.names[0], Uint64, Value::Int(0)).in_units(KILOMETERS),
        car(d.km + 1, 0x3000_004B, d.names[1], Uint64, Value::Int(0)).in_units(MILES),
    ];
    if let Some(hidden) = d.hidden {
        characteristics.push(car(hidden, 0x3600_0023, d.names[2], Bool, Value::Bool(true)));
    }
    Service { iid, kind, characteristics }
}

/// Tank, range and consumption for the cluster and the vehicle app, all read only.
fn fuel() -> Accessory {
    use Format::*;
    Accessory {
        name: "fuel",
        iid: 1536,
        kind: 0x0900_0006,
        services: vec![
            Service {
                iid: 1537,
                kind: 0x1A00_0005,
                characteristics: vec![
                    car(FUEL_LEVEL, 0x4100_0002, "fuelLevel", Uint8, Value::Int(0))
                        .up_to(100)
                        .in_units(PERCENT),
                    car(1539, 0x4100_001A, "fuelLevelMarkerLow", Uint8, Value::Int(LOW_FUEL_PCT))
                        .up_to(100)
                        .in_units(PERCENT)
                        .fixed(),
                ],
            },
            distance(1540, 0x1A00_0015, FUEL_RANGE),
            Service {
                iid: 1544,
                kind: 0x1A00_0014,
                characteristics: vec![
                    car(FUEL_EFFICIENCY, 0x3500_0013, "fuelEfficiency", Uint32, Value::Int(0))
                        .in_units(MILLILITERS_PER_100_KM),
                    car(
                        AVERAGE_FUEL_EFFICIENCY,
                        0x3500_0018,
                        "averageFuelEfficiency",
                        Uint32,
                        Value::Int(0),
                    )
                    .in_units(MILLILITERS_PER_100_KM),
                    car(1547, 0x4100_0025, "fuelEfficiencyMax", Uint32, Value::Int(50_000))
                        .in_units(MILLILITERS_PER_100_KM)
                        .fixed(),
                ],
            },
        ],
    }
}

fn trip_computer() -> Accessory {
    Accessory {
        name: "trip computer",
        iid: 1792,
        kind: 0x0400_0001,
        services: vec![
            distance(1793, 0x1A00_000B, REMAINING_RANGE),
            distance(1797, 0x1A00_000A, ODOMETER),
        ],
    }
}

/// Telemetry name and layout key of each wheel, its service sits at `TIRES + 1 + 5 * n`.
const WHEELS: [(&str, &str); 4] = [
    ("frontLeftKpa", "tire_front_left"),
    ("frontRightKpa", "tire_front_right"),
    ("rearLeftKpa", "tire_rear_left"),
    ("rearRightKpa", "tire_rear_right"),
];
const TIRES: i64 = 2048;
/// LIVI knows no target pressure, so it never judges one.
const PRESSURE_UNDEFINED: i64 = 0;
const SENSOR_ACTIVE: i64 = 1;
const SENSOR_WAITING: i64 = 3;

/// The wheel's pressure, followed by its layout key, pressure state and sensor state.
fn tire_pressure_iid(wheel: usize) -> i64 {
    TIRES + 2 + 5 * wheel as i64
}

/// One pressure in kPa per wheel with its states, read only. The sensor waits until a pressure
/// arrives.
fn tires() -> Accessory {
    use Format::*;
    let wheel = |n: usize, key: &'static str| {
        let iid = tire_pressure_iid(n);
        Service {
            iid: iid - 1,
            kind: 0x1B00_0001,
            characteristics: vec![
                car(iid, 0x3000_001B, "tirePressureKpa", Uint32, Value::Int(0))
                    .between(0.0, 1000.0, 1.0)
                    .in_units(KILOPASCALS),
                car(iid + 1, 0x3600_0065, "vehicleLayoutKey", String, Value::str(key)).fixed(),
                car(
                    iid + 2,
                    0x3000_001C,
                    "tirePressureState",
                    Uint8,
                    Value::Int(PRESSURE_UNDEFINED),
                )
                .up_to(5),
                car(iid + 3, 0x3000_001A, "tireSensorState", Uint8, Value::Int(SENSOR_WAITING))
                    .up_to(4),
            ],
        }
    };
    Accessory {
        name: "tires",
        iid: TIRES,
        kind: 0x0A00_0001,
        services: WHEELS.iter().enumerate().map(|(n, (_, key))| wheel(n, key)).collect(),
    }
}

const VOLUME: i64 = 2306;
const MUTE: i64 = 2309;
const NAV_VOLUME: i64 = 2311;
const CALL_VOLUME: i64 = 2314;
const MUSIC_VOLUME: i64 = 2317;
const SIRI_VOLUME: i64 = 2321;

/// Each volume the vehicle app shows: LIVI's name for it, its iid, and the phone's volume type.
/// `volume` is the head unit in the telemetry, the others are settings.
/// Media, navigation, call, speech, ringtone, navigation speech, other, vehicle notification.
const LAST_VOLUME_TYPE: u32 = 7;
pub const VOLUMES: [(&str, i64); 5] = [
    ("volume", VOLUME),
    ("navVolume", NAV_VOLUME),
    ("callVolume", CALL_VOLUME),
    ("audioVolume", MUSIC_VOLUME),
    ("voiceAssistantVolume", SIRI_VOLUME),
];
/// The phone's volume type of each volume it lists under its own name.
/// The phone has no type for music, "other" carries LIVI's own label.
const VOLUME_TYPES: [(i64, i64, Option<&str>); 5] = [
    (VOLUME, 0, Some("LIVI")),
    (NAV_VOLUME, 1, None),
    (CALL_VOLUME, 2, None),
    (SIRI_VOLUME, 3, None),
    (MUSIC_VOLUME, 6, Some("Musik")),
];

/// LIVI's volumes in percent, the phone and Siri may set them. The head unit's volume shows as
/// media, the phone names each by its type.
/// The car's engines, the phone tells combustion, electric and plug-in hybrid cars apart by them.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Engines {
    pub combustion: Option<Rpm>,
    pub electric: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rpm {
    pub max: u32,
    pub redline: u32,
}

const ENGINE_RPM: i64 = 2562;
const ENGINE_POWER: i64 = 2818;

fn combustion_engine(rpm: Rpm) -> Accessory {
    use Format::*;
    let max = rpm.max.max(1);
    let speed = |iid, kind, name, initial: u32| {
        car(iid, kind, name, Uint32, Value::Int(initial.min(max).into()))
            .up_to(max)
            .in_units(REVOLUTIONS_PER_MINUTE)
    };
    Accessory {
        name: "combustion engine",
        iid: 2560,
        kind: 0x0900_0005,
        services: vec![Service {
            iid: 2561,
            kind: 0x1A00_000F,
            characteristics: vec![
                speed(ENGINE_RPM, 0x3000_0024, "rotationalSpeed", 0),
                speed(2563, 0x3000_004E, "rotationalSpeedMax", max).fixed(),
                speed(2564, 0x3000_004F, "rotationalSpeedMarkerRedline", rpm.redline).fixed(),
            ],
        }],
    }
}

fn electric_engine() -> Accessory {
    use Format::*;
    Accessory {
        name: "electric engine",
        iid: 2816,
        kind: 0x0900_0004,
        services: vec![Service {
            iid: 2817,
            kind: 0x1A00_000D,
            characteristics: vec![
                car(ENGINE_POWER, 0x3000_0028, "power", Float, Value::Real(0.0))
                    .between(-1000.0, 1000.0, 0.1)
                    .in_units(KILOWATTS),
            ],
        }],
    }
}

/// What a car maker's theme shows in a zone of a display, asked for by the car.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClusterContent {
    pub panel: String,
    /// The content URL for zone 1 (centre) and zone 2 (right), empty for none.
    pub zones: [String; 2],
}

const ZONES: [&str; 2] = ["zone1", "zone2"];

fn zone_service(
    iid: i64,
    kind: i64,
    url_kind: i64,
    url: &str,
    on: Option<bool>,
    panel: &str,
    zone: &str,
) -> Service {
    use Format::*;
    let mut characteristics = vec![car(iid + 1, url_kind, "contentURL", String, Value::str(url))];
    let mut next = iid + 2;
    if let Some(on) = on {
        characteristics.push(shared(next, 0x3000_0002, "on", Bool, Value::Bool(on)));
        next += 1;
    }
    if kind != REQUEST_TEMPORARY_CONTENT {
        characteristics
            .push(car(next, 0x3600_0063, "userDismissible", Bool, Value::Bool(true)).fixed());
        next += 1;
    }
    characteristics.extend([
        car(next, 0x3700_0007, "displayPanelIdentifier", String, Value::str(panel)).fixed(),
        car(next + 1, 0x3700_000B, "displayZoneIdentifier", String, Value::str(zone)).fixed(),
    ]);
    Service { iid, kind, characteristics }
}

const REQUEST_CONTENT: i64 = 0x1700_0004;
const REQUEST_TEMPORARY_CONTENT: i64 = 0x1700_000C;
const DYNAMIC_CONTENT_ELEMENT: i64 = 0x1700_000B;

/// The car asks the phone for widgets, temporary content and dynamic elements per zone.
fn cluster_content(content: &ClusterContent) -> [Accessory; 2] {
    let panel = content.panel.as_str();
    let mut requests = Vec::new();
    for (n, zone) in ZONES.iter().enumerate() {
        let url = content.zones[n].as_str();
        let base = 3073 + 6 * n as i64;
        requests.push(zone_service(
            base,
            REQUEST_CONTENT,
            0x3000_0007,
            url,
            Some(!url.is_empty()),
            panel,
            zone,
        ));
    }
    for (n, zone) in ZONES.iter().enumerate() {
        let base = 3085 + 6 * n as i64;
        requests.push(zone_service(
            base,
            REQUEST_TEMPORARY_CONTENT,
            0x3600_0069,
            "",
            Some(false),
            panel,
            zone,
        ));
    }
    let elements = ZONES
        .iter()
        .enumerate()
        .map(|(n, zone)| {
            let base = 3329 + 6 * n as i64;
            zone_service(base, DYNAMIC_CONTENT_ELEMENT, 0x3700_0013, "", None, panel, zone)
        })
        .collect();
    [
        Accessory { name: "cluster content", iid: 3072, kind: 0x0120_0001, services: requests },
        Accessory {
            name: "cluster notifications",
            iid: 3328,
            kind: 0x0600_0001,
            services: elements,
        },
    ]
}

fn audio() -> Accessory {
    use Format::*;
    let volume = |iid: i64, kind: i64, label: Option<&str>| {
        let mut characteristics = vec![
            shared(iid, 0x3300_0006, "volume", Uint8, Value::Int(50)).up_to(100).enabled(),
            car(iid + 1, 0x3300_0005, "volumeType", Uint8, Value::Int(kind))
                .up_to(LAST_VOLUME_TYPE)
                .fixed(),
        ];
        if let Some(label) = label {
            characteristics
                .push(car(iid + 2, 0x3000_0001, "volumeLabel", String, Value::str(label)).fixed());
        }
        if iid == VOLUME {
            characteristics.push(shared(MUTE, 0x3300_0009, "mute", Bool, Value::Bool(false)));
        }
        Service { iid: iid - 1, kind: 0x1300_0002, characteristics }
    };
    Accessory {
        name: "audio",
        iid: 2304,
        kind: 0x0200_0001,
        services: VOLUME_TYPES
            .iter()
            .map(|(iid, kind, label)| volume(*iid, *kind, *label))
            .collect(),
    }
}

/// The readings in LIVI's telemetry the cluster shows, metric, by their telemetry names.
pub type Gauges = serde_json::Map<String, serde_json::Value>;
pub const GAUGE_KEYS: [&str; 8] = [
    "rpm",
    "fuelPct",
    "rangeKm",
    "consumptionLPer100Km",
    "consumptionAvgLPer100Km",
    "odometerKm",
    "tirePressure",
    "volume",
];

const DRIVER_TARGET_TEMPERATURE: i64 = 520;
const PASSENGER_TARGET_TEMPERATURE: i64 = 534;
const ZONES_SYNCED: i64 = 538;
/// Level and on of each front seat's heating.
const SEAT_HEATING: [(i64, i64); 2] = [(1026, 1027), (1030, 1031)];
const FAN: (i64, i64) = (525, 524);
/// Level and on of what runs at its level and stops at 0.
const LEVELLED: [(i64, i64); 3] = [SEAT_HEATING[0], SEAT_HEATING[1], FAN];

/// The climate block in LIVI's telemetry, metric, each key with the value it stands for.
pub type Climate = serde_json::Map<String, serde_json::Value>;
const CLIMATE_KEYS: [(&str, i64); 20] = [
    ("on", HVAC_ON),
    ("auto", AUTO_CLIMATE),
    ("ac", COMPRESSOR),
    ("maxAc", MAX_AC),
    ("maxDefrost", MAX_DEFROST),
    ("recirculation", RECIRCULATION),
    ("zonesSynced", ZONES_SYNCED),
    ("driverTargetC", DRIVER_TARGET_TEMPERATURE),
    ("passengerTargetC", PASSENGER_TARGET_TEMPERATURE),
    ("driverCabinC", DRIVER_TARGET_TEMPERATURE + 1),
    ("passengerCabinC", PASSENGER_TARGET_TEMPERATURE + 1),
    ("fanLevel", FAN.0),
    ("fanAuto", FAN_AUTO),
    ("frontWindowHeating", WINDOWS[0] + 1),
    ("rearWindowHeating", WINDOWS[1] + 1),
    ("ventUpper", VENTS[0] + 1),
    ("ventMiddle", VENTS[1] + 1),
    ("ventLower", VENTS[2] + 1),
    ("driverSeatHeating", SEAT_HEATING[0].0),
    ("passengerSeatHeating", SEAT_HEATING[1].0),
];
/// One switch for the automatic of all three vents.
const VENTS_AUTO: &str = "ventsAuto";

/// The climate LIVI starts with, AUTO at 21 °C.
pub fn default_climate() -> Climate {
    VehicleState::new(false, "", "").climate().unwrap_or_default()
}

fn to_json(v: &Value) -> Option<serde_json::Value> {
    match v {
        Value::Bool(b) => Some((*b).into()),
        Value::Int(n) => Some((*n).into()),
        Value::Real(f) => serde_json::Number::from_f64(*f).map(serde_json::Value::Number),
        _ => None,
    }
}

pub struct VehicleState {
    accessories: Vec<Accessory>,
    values: BTreeMap<i64, Value>,
    followed: BTreeSet<i64>,
    /// The level each switched off one comes back on with.
    resume: BTreeMap<i64, Value>,
    /// What Max AC took over, given back when it ends.
    before_max_ac: Option<Vec<(i64, Value)>>,
    /// Each command with the iid of the service it belongs to.
    controls: Vec<(i64, Control)>,
    radio_commands: Vec<RadioCommand>,
    debug: bool,
}

impl VehicleState {
    pub fn new(debug: bool, app_version: &str, build_date: &str) -> Self {
        let accessories = vec![
            navigation(),
            automaker_settings(app_version, build_date),
            climate(),
            seats(),
            vehicle_resources(),
            fuel(),
            trip_computer(),
            tires(),
            audio(),
            media(),
            now_playing(),
        ];
        let values = accessories
            .iter()
            .flat_map(|a| &a.services)
            .flat_map(|s| &s.characteristics)
            .filter_map(|c| Some((c.iid, c.initial.clone()?)))
            .collect();
        Self {
            accessories,
            values,
            followed: BTreeSet::new(),
            resume: BTreeMap::new(),
            before_max_ac: None,
            controls: radio_controls(),
            radio_commands: Vec::new(),
            debug,
        }
    }

    /// The theme's model name for the car, it picks the car pictures in the climate, vehicle and
    /// tyre views. Left and right hand drive come with it.
    pub fn with_variant(mut self, model: &str) -> Self {
        if model.is_empty() {
            return self;
        }
        let named = Value::str(model);
        let variant = self
            .accessories
            .iter_mut()
            .flat_map(|a| &mut a.services)
            .find(|s| s.characteristics.iter().any(|c| c.iid == INTERIOR_STYLE));
        if let Some(service) = variant {
            let style =
                |iid, kind, name| car(iid, kind, name, Format::String, named.clone()).fixed();
            service.characteristics = vec![
                style(EXTERIOR_STYLE, 0x4800_0003, "exteriorStyle"),
                style(INTERIOR_STYLE, 0x4800_0004, "interiorStyle"),
                style(VEHICLE_LAYOUT, 0x4800_0005, "vehicleLayout"),
            ];
        }
        for iid in [EXTERIOR_STYLE, INTERIOR_STYLE, VEHICLE_LAYOUT] {
            self.values.insert(iid, named.clone());
        }
        self
    }

    pub fn with_cluster_content(mut self, content: Option<&ClusterContent>) -> Self {
        let Some(content) = content else { return self };
        let added = cluster_content(content);
        for c in added.iter().flat_map(|a| &a.services).flat_map(|s| &s.characteristics) {
            if let Some(v) = &c.initial {
                self.values.insert(c.iid, v.clone());
            }
        }
        self.accessories.extend(added);
        self
    }

    /// Asks the theme to show `url` in a cluster zone (0 centre, 1 right), off when empty.
    pub fn show_in_zone(&mut self, zone: usize, url: &str) -> Vec<(Lane, Vec<u8>)> {
        let base = 3073 + 6 * zone as i64;
        if self.characteristic(base + 1).is_none() {
            return Vec::new();
        }
        let mut changed = Vec::new();
        self.car_sets(base + 1, Value::str(url), &mut changed);
        self.car_sets(base + 2, Value::Bool(!url.is_empty()), &mut changed);
        update_notify(changed).into_iter().collect()
    }

    pub fn with_engines(mut self, engines: Engines) -> Self {
        let added: Vec<Accessory> = engines
            .combustion
            .map(combustion_engine)
            .into_iter()
            .chain(engines.electric.then(electric_engine))
            .collect();
        for c in added.iter().flat_map(|a| &a.services).flat_map(|s| &s.characteristics) {
            if let Some(v) = &c.initial {
                self.values.insert(c.iid, v.clone());
            }
        }
        self.accessories.extend(added);
        self
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
                        let mut d = vec![
                            (Value::str("iid"), Value::Int(s.iid)),
                            (Value::str("type"), Value::Int(s.kind)),
                            (
                                Value::str("characteristics"),
                                Value::Array(characteristics.collect()),
                            ),
                        ];
                        let controls: Vec<Value> = self
                            .controls
                            .iter()
                            .filter(|(service, _)| *service == s.iid)
                            .map(|(_, c)| c.describe())
                            .collect();
                        if !controls.is_empty() {
                            d.push((Value::str("controls"), Value::Array(controls)));
                        }
                        Value::Dict(d)
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
            "controlRequest" => {
                let commands = values.and_then(Value::as_dict).unwrap_or(&[]);
                vec![(lane, wrap(&self.control(commands, transaction)))]
            }
            other => {
                println!("[cpVehicle] phone sent {other:?}, not handled");
                Vec::new()
            }
        }
    }

    /// The phone's commands. Each is answered at once, LIVI's radio acts on it and its new state
    /// comes back through `set_radio`.
    fn control(&mut self, commands: &[(Value, Value)], transaction: Value) -> Value {
        let mut answered = Vec::new();
        let mut refused = Vec::new();
        for (key, parameters) in commands {
            let name = key
                .as_int()
                .and_then(|iid| self.controls.iter().find(|(_, c)| c.iid == iid))
                .map(|(_, c)| c.name);
            let Some(name) = name else {
                println!("[cpVehicle] phone sent command {}, the car has none such", shown(key));
                refused.push((key.clone(), Value::Int(NO_SUCH_COMMAND)));
                continue;
            };
            println!("[cpVehicle] phone pressed {name} {}", shown(parameters));
            let text = |k| parameters.get(k).and_then(Value::as_str);
            let ours = |k| text(k).is_none_or(|s| s == RADIO_SOURCE);
            let command = match name {
                "play" => Some(RadioCommand::Play),
                "pause" => Some(RadioCommand::Pause),
                "nextItem" => Some(RadioCommand::Next),
                "previousItem" => Some(RadioCommand::Previous),
                "tuneToIdentifier" if ours("sourceIdentifier") => {
                    text("identifier").map(|id| RadioCommand::Tune(id.to_string()))
                }
                "changeMediaSource" if text("identifier") == Some(RADIO_SOURCE) => {
                    Some(RadioCommand::Play)
                }
                _ => None,
            };
            self.radio_commands.extend(command);
            answered.push((key.clone(), Value::Null));
        }
        let mut answer = vec![
            (Value::str("command"), Value::str("controlResponse")),
            (Value::str("transactionID"), transaction),
        ];
        if !answered.is_empty() {
            answer.push((Value::str("values"), Value::Dict(answered)));
        }
        if !refused.is_empty() {
            answer.push((Value::str("errors"), Value::Dict(refused)));
        }
        Value::Dict(answer)
    }

    /// What the Radio app asked for since the last call.
    pub fn take_radio_commands(&mut self) -> Vec<RadioCommand> {
        std::mem::take(&mut self.radio_commands)
    }

    /// LIVI's radio as it is now, the phone hears what it follows that changed.
    pub fn set_radio(&mut self, radio: &Radio) -> Vec<(Lane, Vec<u8>)> {
        let items = Value::Array(radio.stations.iter().map(radio_item).collect());
        let images = Value::Array(
            radio
                .stations
                .iter()
                .filter_map(|s| {
                    let image = s.image.clone()?;
                    Some(dict([
                        ("identifier", Value::str(&s.id)),
                        ("imageData", Value::Data(image)),
                    ]))
                })
                .collect(),
        );
        let disabled = !radio.available || radio.stations.is_empty();
        let state = if radio.playing { PLAYING } else { PAUSED };
        let mut changed = Vec::new();
        self.car_sets(RADIO_DISABLED, Value::Bool(disabled), &mut changed);
        self.car_sets(RADIO_ITEMS, items, &mut changed);
        self.car_sets(RADIO_ITEM_IMAGES, images, &mut changed);
        let current = radio.current.clone().unwrap_or_default();
        self.car_sets(RADIO_CURRENT_ITEM, Value::String(current), &mut changed);
        self.car_sets(NOW_PLAYING_TITLE, Value::str(&radio.title), &mut changed);
        self.car_sets(NOW_PLAYING_ARTIST, Value::str(&radio.artist), &mut changed);
        self.car_sets(NOW_PLAYING_ALBUM, Value::str(&radio.album), &mut changed);
        self.car_sets(NOW_PLAYING_ARTWORK, Value::Data(radio.artwork.clone()), &mut changed);
        self.car_sets(PLAYBACK_STATE, Value::Int(state), &mut changed);
        update_notify(changed).into_iter().collect()
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
        let by_accessory: Vec<String> = self
            .accessories
            .iter()
            .filter_map(|a| {
                let names: Vec<&str> = a
                    .services
                    .iter()
                    .flat_map(|s| &s.characteristics)
                    .filter(|c| iids.iter().any(|i| i.as_int() == Some(c.iid)))
                    .map(|c| c.name)
                    .collect();
                (!names.is_empty()).then(|| format!("{}: {}", a.name, names.join(" ")))
            })
            .collect();
        println!(
            "[cpVehicle] phone follows {} values ({}), {} of them set",
            iids.len(),
            by_accessory.join(", "),
            held.len()
        );
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
            let (name, owner) = match self.characteristic(iid) {
                Some(c) if c.owner != Owner::Car => (c.name, c.owner),
                _ => {
                    println!("[cpVehicle] phone may not write value {iid}");
                    results.push((Value::Int(iid), Value::Int(NO_VALUE)));
                    continue;
                }
            };
            // Route data stays out of the normal log, the settings it asks the car for do not.
            if self.debug || owner == Owner::Shared {
                println!("[cpVehicle] phone set {name} to {}", shown(v));
            } else {
                println!("[cpVehicle] phone wrote {name}");
            }
            results.push((Value::Int(iid), Value::Int(WRITTEN)));
            let before = self.values.insert(iid, v.clone());
            if before.as_ref() != Some(v) && self.followed.contains(&iid) {
                changed.push((Value::Int(iid), v.clone()));
            }
        }
        self.settle(written, &mut changed);
        let answer = dict([
            ("command", Value::str("writeResponse")),
            ("transactionID", transaction),
            ("errors", Value::Dict(results)),
        ]);
        let mut out = vec![(lane, wrap(&answer))];
        out.extend(update_notify(changed));
        out
    }

    /// 0 to 1, as LIVI's telemetry counts it.
    pub fn volume(&self) -> Option<f64> {
        self.level(VOLUME)
    }

    /// Every volume by LIVI's name for it, 0 to 1.
    pub fn volumes(&self) -> Vec<(&'static str, f64)> {
        VOLUMES.iter().filter_map(|(name, iid)| Some((*name, self.level(*iid)?))).collect()
    }

    fn level(&self, iid: i64) -> Option<f64> {
        Some(self.values.get(&iid)?.as_int()? as f64 / 100.0)
    }

    /// The climate as LIVI's telemetry holds it, None when the description names no climate.
    pub fn climate(&self) -> Option<Climate> {
        self.characteristic(AUTO_CLIMATE)?;
        let mut block: Climate = CLIMATE_KEYS
            .iter()
            .filter_map(|(key, iid)| Some(((*key).to_string(), to_json(self.values.get(iid)?)?)))
            .collect();
        let auto =
            VENTS.iter().all(|vent| self.values.get(&(vent + 2)) == Some(&Value::Bool(true)));
        block.insert(VENTS_AUTO.into(), auto.into());
        Some(block)
    }

    /// Climate set from outside the phone, by the car or in LIVI. What was named stands, the car
    /// settles the rest, and the phone hears whatever it follows that changed.
    pub fn set_climate(&mut self, climate: &Climate) -> Vec<(Lane, Vec<u8>)> {
        if self.characteristic(AUTO_CLIMATE).is_none() {
            return Vec::new();
        }
        let mut given = Vec::new();
        for (key, v) in climate {
            if key == VENTS_AUTO {
                given.extend(
                    v.as_bool()
                        .into_iter()
                        .flat_map(|auto| VENTS.map(|vent| (vent + 2, Value::Bool(auto)))),
                );
            } else if let Some((_, iid)) = CLIMATE_KEYS.iter().find(|(k, _)| k == key)
                && let Some(v) = self.characteristic(*iid).and_then(|c| c.take(v))
            {
                given.push((*iid, v));
            }
        }
        let new: Vec<_> = given.iter().filter(|(iid, v)| self.values.get(iid) != Some(v)).collect();
        if new.is_empty() {
            return Vec::new();
        }
        let before = self.values.clone();
        for (iid, v) in &new {
            if let Some(c) = self.characteristic(*iid) {
                println!("[cpVehicle] LIVI set {} to {}", c.name, shown(v));
            }
            self.values.insert(*iid, v.clone());
        }
        let written: Vec<_> = new.iter().map(|(iid, v)| (Value::Int(*iid), v.clone())).collect();
        self.settle(&written, &mut Vec::new());
        for (iid, v) in given {
            self.values.insert(iid, v);
        }
        let changed = self
            .followed
            .iter()
            .filter_map(|iid| Some((*iid, self.values.get(iid)?)))
            .filter(|(iid, v)| before.get(iid) != Some(*v))
            .map(|(iid, v)| (Value::Int(iid), v.clone()))
            .collect();
        update_notify(changed).into_iter().collect()
    }

    /// Readings from the car, the phone hears whatever it follows that changed.
    pub fn set_gauges(&mut self, gauges: &Gauges) -> Vec<(Lane, Vec<u8>)> {
        let num =
            |key| gauges.get(key).and_then(serde_json::Value::as_f64).filter(|n| n.is_finite());
        let mut given: Vec<(i64, serde_json::Value)> = Vec::new();
        for (name, iid) in VOLUMES {
            if let Some(level) = num(name) {
                given.push((iid, (level.clamp(0.0, 1.0) * 100.0).into()));
            }
        }
        if let Some(pct) = num("fuelPct") {
            given.push((FUEL_LEVEL, pct.into()));
        }
        if let Some(rpm) = num("rpm") {
            given.push((ENGINE_RPM, rpm.into()));
        }
        let ranges: [(&str, &[Distance]); 2] =
            [("rangeKm", &[FUEL_RANGE, REMAINING_RANGE]), ("odometerKm", &[ODOMETER])];
        for (key, distances) in ranges {
            let Some(km) = num(key).map(|km| km.max(0.0)) else { continue };
            for d in distances {
                given.push((d.km, km.into()));
                given.push((d.km + 1, (km / KM_PER_MILE).into()));
                if let Some(hidden) = d.hidden {
                    given.push((hidden, false.into()));
                }
            }
        }
        if let Some(tires) = gauges.get("tirePressure").and_then(serde_json::Value::as_object) {
            for (n, (name, _)) in WHEELS.iter().enumerate() {
                if let Some(kpa) = tires.get(*name).and_then(serde_json::Value::as_f64) {
                    let iid = tire_pressure_iid(n);
                    given.push((iid, kpa.max(0.0).into()));
                    given.push((iid + 3, SENSOR_ACTIVE.into()));
                }
            }
        }
        // Millilitres per 100 km.
        let efficiencies = [
            ("consumptionLPer100Km", FUEL_EFFICIENCY),
            ("consumptionAvgLPer100Km", AVERAGE_FUEL_EFFICIENCY),
        ];
        for (key, iid) in efficiencies {
            if let Some(l) = num(key) {
                given.push((iid, (l.max(0.0) * 1000.0).into()));
            }
        }
        let mut changed = Vec::new();
        for (iid, v) in given {
            if let Some(v) = self.characteristic(iid).and_then(|c| c.take(&v)) {
                self.car_sets(iid, v, &mut changed);
            }
        }
        if self.values.get(&VOLUME).and_then(Value::as_int).is_some_and(|v| v > 0) {
            self.car_sets(MUTE, Value::Bool(false), &mut changed);
        }
        update_notify(changed).into_iter().collect()
    }

    /// What a car does on its own after a setting changed.
    fn settle(&mut self, written: &[(Value, Value)], changed: &mut Vec<(Value, Value)>) {
        self.keep_zones_synced(written, changed);
        self.switch_by_level(written, changed);
        self.follow_auto(written, changed);
        self.run_max_ac(written, changed);
        self.mute_by_volume(written, changed);
    }

    /// Mute drops the volume to 0 and unmuting brings back the last level, turning the volume up
    /// ends the mute.
    fn mute_by_volume(&mut self, written: &[(Value, Value)], changed: &mut Vec<(Value, Value)>) {
        let find = |iid| written.iter().find(|(k, _)| k.as_int() == Some(iid)).map(|(_, v)| v);
        let level = self.values.get(&VOLUME).and_then(Value::as_int).unwrap_or(0);
        match (find(MUTE), find(VOLUME)) {
            (Some(Value::Bool(true)), _) if level > 0 => {
                self.resume.insert(VOLUME, Value::Int(level));
                self.car_sets(VOLUME, Value::Int(0), changed);
            }
            (Some(Value::Bool(false)), _) if level == 0 => {
                let back = self.resume.get(&VOLUME).cloned().unwrap_or(Value::Int(50));
                self.car_sets(VOLUME, back, changed);
            }
            (None, Some(Value::Int(v))) if *v > 0 => {
                self.car_sets(MUTE, Value::Bool(false), changed)
            }
            _ => {}
        }
    }

    /// Synced, the passenger side takes the driver's temperature, and setting the passenger side
    /// on its own ends the sync, as a car does.
    fn keep_zones_synced(&mut self, written: &[(Value, Value)], changed: &mut Vec<(Value, Value)>) {
        if self.values.get(&ZONES_SYNCED) != Some(&Value::Bool(true)) {
            return;
        }
        let wrote = |iid| written.iter().any(|(k, _)| k.as_int() == Some(iid));
        if wrote(PASSENGER_TARGET_TEMPERATURE) && !wrote(ZONES_SYNCED) {
            self.car_sets(ZONES_SYNCED, Value::Bool(false), changed);
        } else if let Some(driver) = self.values.get(&DRIVER_TARGET_TEMPERATURE).cloned() {
            self.car_sets(PASSENGER_TARGET_TEMPERATURE, driver, changed);
        }
    }

    /// Level 0 is off: a level above 0 switches on, switching off drops to 0 and switching on
    /// brings back the last level.
    fn switch_by_level(&mut self, written: &[(Value, Value)], changed: &mut Vec<(Value, Value)>) {
        let find = |iid| written.iter().find(|(k, _)| k.as_int() == Some(iid)).map(|(_, v)| v);
        for (level_iid, on_iid) in LEVELLED {
            if let Some(Value::Int(level)) = find(level_iid) {
                self.car_sets(on_iid, Value::Bool(*level > 0), changed);
            } else if let Some(Value::Bool(on)) = find(on_iid) {
                let level = self.values.get(&level_iid).cloned();
                if !on && level != Some(Value::Int(0)) {
                    if let Some(level) = level {
                        self.resume.insert(level_iid, level);
                    }
                    self.car_sets(level_iid, Value::Int(0), changed);
                } else if *on && level == Some(Value::Int(0)) {
                    let back = self.resume.get(&level_iid).cloned().unwrap_or(Value::Int(1));
                    self.car_sets(level_iid, back, changed);
                }
            }
        }
    }

    /// AUTO runs the fan and picks the vents. Setting either by hand takes it out of
    /// automatic and switches AUTO off.
    fn follow_auto(&mut self, written: &[(Value, Value)], changed: &mut Vec<(Value, Value)>) {
        let find = |iid| written.iter().find(|(k, _)| k.as_int() == Some(iid)).map(|(_, v)| v);
        let vents_auto = VENTS.map(|vent| vent + 2);
        if let Some(Value::Bool(auto)) = find(AUTO_CLIMATE) {
            for iid in std::iter::once(FAN_AUTO).chain(vents_auto) {
                self.car_sets(iid, Value::Bool(*auto), changed);
            }
            return;
        }
        let (fan_level, fan_on) = FAN;
        let fan_by_hand = find(fan_level).or(find(fan_on)).is_some();
        let vents_by_hand = VENTS.iter().any(|vent| find(vent + 1).is_some());
        if fan_by_hand {
            self.car_sets(FAN_AUTO, Value::Bool(false), changed);
        }
        if vents_by_hand {
            for iid in vents_auto {
                self.car_sets(iid, Value::Bool(false), changed);
            }
        }
        if fan_by_hand || vents_by_hand {
            self.car_sets(AUTO_CLIMATE, Value::Bool(false), changed);
        }
    }

    /// Max AC cools with everything: both zones at LO, compressor and recirculation on, the fan
    /// at its top level, AUTO off. Ending it gives the settings back, setting one of them by hand
    /// ends it and keeps what was set.
    fn run_max_ac(&mut self, written: &[(Value, Value)], changed: &mut Vec<(Value, Value)>) {
        let (fan_level, fan_on) = FAN;
        let lo = Value::Real(TEMPERATURE_LO);
        let takes = [
            (DRIVER_TARGET_TEMPERATURE, lo.clone()),
            (PASSENGER_TARGET_TEMPERATURE, lo),
            (COMPRESSOR, Value::Bool(true)),
            (RECIRCULATION, Value::Bool(true)),
            (fan_level, Value::Int(7)),
            (fan_on, Value::Bool(true)),
            (FAN_AUTO, Value::Bool(false)),
            (AUTO_CLIMATE, Value::Bool(false)),
        ];
        let find = |iid| written.iter().find(|(k, _)| k.as_int() == Some(iid)).map(|(_, v)| v);
        match find(MAX_AC) {
            Some(Value::Bool(true)) if self.before_max_ac.is_none() => {
                let before =
                    takes.iter().filter_map(|(iid, _)| Some((*iid, self.values.get(iid)?.clone())));
                self.before_max_ac = Some(before.collect());
                for (iid, v) in takes {
                    self.car_sets(iid, v, changed);
                }
            }
            Some(Value::Bool(false)) => {
                for (iid, v) in self.before_max_ac.take().unwrap_or_default() {
                    self.car_sets(iid, v, changed);
                }
            }
            _ if self.before_max_ac.is_some()
                && takes.iter().any(|(iid, _)| find(*iid).is_some()) =>
            {
                self.before_max_ac = None;
                self.car_sets(MAX_AC, Value::Bool(false), changed);
            }
            _ => {}
        }
    }

    fn car_sets(&mut self, iid: i64, v: Value, changed: &mut Vec<(Value, Value)>) {
        if self.values.get(&iid) == Some(&v) {
            return;
        }
        if let Some(c) = self.characteristic(iid) {
            println!("[cpVehicle] car set {} to {}", c.name, shown(&v));
        }
        self.values.insert(iid, v.clone());
        if self.followed.contains(&iid) {
            changed.push((Value::Int(iid), v));
        }
    }
}

fn shown(v: &Value) -> std::string::String {
    match v {
        Value::Bool(b) => b.to_string(),
        Value::Int(n) => n.to_string(),
        Value::Real(f) => f.to_string(),
        Value::String(s) => s.clone(),
        Value::Data(d) => format!("{} B", d.len()),
        Value::Array(items) if items.len() > 4 => format!("{} items", items.len()),
        other => format!("{other:?}"),
    }
}

fn update_notify(changed: Vec<(Value, Value)>) -> Option<(Lane, Vec<u8>)> {
    (!changed.is_empty()).then(|| {
        let update =
            dict([("command", Value::str("updateNotify")), ("values", Value::Dict(changed))]);
        (Lane::High, wrap(&update))
    })
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
        let (key, info) = VehicleState::new(false, "9.5.0", "2026-10-15 14:30").info_entry();
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
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
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
    fn the_vehicle_app_shows_the_livi_version_and_build_date() {
        let lines = |version: &str, built: &str| {
            let (_, info) = VehicleState::new(false, version, built).info_entry();
            let plugin = &info.get("pluginConfigs").and_then(bplist::Value::as_array).unwrap()[0];
            let settings = plugin
                .get("accessories")
                .and_then(bplist::Value::as_array)
                .unwrap()
                .iter()
                .find(|a| a.get("type").and_then(bplist::Value::as_int) == Some(0x0500_0001))
                .unwrap()
                .clone();
            settings.get("services").and_then(bplist::Value::as_array).unwrap().to_vec()
        };
        let initial = |line: &bplist::Value, kind| {
            line.get("characteristics")
                .and_then(bplist::Value::as_array)
                .unwrap()
                .iter()
                .find(|c| c.get("type").and_then(bplist::Value::as_int) == Some(kind))
                .and_then(|c| c.get("initialValue"))
                .cloned()
        };
        let text = |s: &str| Some(bplist::Value::String(s.into()));

        let kind = |l: &bplist::Value| l.get("type").and_then(bplist::Value::as_int);
        let known = lines("9.5.0", "2026-10-15 14:30");
        assert_eq!(
            known.iter().map(kind).collect::<Vec<_>>(),
            [0x1600_0015, 0x1600_0015, 0x1600_0020].map(Some)
        );
        let section = &known[2];
        assert_eq!(initial(section, 0x3000_0019), text("LIVI"));
        assert_eq!(initial(section, 0x3600_0004), text("LIVI"));
        for line in &known[..2] {
            assert_eq!(initial(line, 0x3600_0028), text("LIVI"), "both lines sit in the section");
            assert_eq!(initial(line, 0x3600_0006), Some(bplist::Value::Int(0)));
        }
        assert_eq!(initial(&known[0], 0x3000_0001), text("Version"));
        assert_eq!(initial(&known[0], 0x3000_0017), text("9.5.0"));
        assert_eq!(initial(&known[1], 0x3000_0001), text("Version Build"));
        let label = |line| match initial(line, 0x3000_0001) {
            Some(bplist::Value::String(s)) => s,
            other => panic!("no label: {other:?}"),
        };
        assert!(label(&known[0]) < label(&known[1]), "the phone puts the version line first");
        assert_eq!(initial(&known[1], 0x3000_0017), text("2026-10-15 14:30"));
        let sort_order = |line: &bplist::Value| {
            line.get("characteristics")
                .and_then(bplist::Value::as_array)
                .unwrap()
                .iter()
                .find(|c| c.get("type").and_then(bplist::Value::as_int) == Some(0x3000_0003))
                .cloned()
                .unwrap()
        };
        let (version, build) = (sort_order(&known[0]), sort_order(&known[1]));
        let number = |c: &bplist::Value, k: &str| c.get(k).and_then(bplist::Value::as_int);
        assert_eq!(number(&version, "initialValue"), Some(0), "the version line comes first");
        assert_eq!(number(&build, "initialValue"), Some(1));
        assert_eq!(
            number(&version, "maximumValue"),
            Some(100),
            "the phone drops a number without bounds"
        );

        let unknown = lines("", "");
        assert_eq!(initial(&unknown[0], 0x3000_0017), text("?"), "an unknown version shows as ?");
        assert_eq!(initial(&unknown[1], 0x3000_0017), text("?"));
    }

    #[test]
    fn both_front_seats_heat_in_two_steps() {
        let (_, info) = VehicleState::new(false, "9.5.0", "2026-10-15 14:30").info_entry();
        let plugin = &info.get("pluginConfigs").and_then(bplist::Value::as_array).unwrap()[0];
        let seats = plugin
            .get("accessories")
            .and_then(bplist::Value::as_array)
            .unwrap()
            .iter()
            .find(|a| a.get("type").and_then(bplist::Value::as_int) == Some(0x0150_0001))
            .unwrap();
        let services = seats.get("services").and_then(bplist::Value::as_array).unwrap();
        assert_eq!(services.len(), 2);
        for service in services {
            assert_eq!(service.get("type").and_then(bplist::Value::as_int), Some(0x2200_0001));
            let level = service
                .get("characteristics")
                .and_then(bplist::Value::as_array)
                .unwrap()
                .iter()
                .find(|c| c.get("type").and_then(bplist::Value::as_int) == Some(0x3100_0021))
                .unwrap();
            assert_eq!(level.get("format").and_then(bplist::Value::as_int), Some(7));
            assert_eq!(level.get("minimumValue").and_then(bplist::Value::as_int), Some(0));
            assert_eq!(level.get("maximumValue").and_then(bplist::Value::as_int), Some(2));
            assert_eq!(level.get("writable").and_then(bplist::Value::as_bool), Some(true));
        }
    }

    #[test]
    fn a_seat_heats_while_its_level_is_above_zero() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let [(level, on), _] = SEAT_HEATING;
        state.handle(
            Lane::High,
            &command("registerRequest", Value::Array(vec![Value::Int(level), Value::Int(on)])),
        );
        let update = |state: &mut VehicleState, to: i64| {
            let answers = state
                .handle(Lane::High, &command("writeRequest", by_iid(&[(level, Value::Int(to))])));
            opened(&answers[1].1).get("values").cloned()
        };
        assert_eq!(
            update(&mut state, 2),
            Some(by_iid(&[(level, Value::Int(2)), (on, Value::Bool(true))]))
        );
        assert_eq!(update(&mut state, 1), Some(by_iid(&[(level, Value::Int(1))])));
        assert_eq!(
            update(&mut state, 0),
            Some(by_iid(&[(level, Value::Int(0)), (on, Value::Bool(false))]))
        );
    }

    #[test]
    fn front_and_rear_windows_heat_through_their_wires() {
        let (_, info) = VehicleState::new(false, "9.5.0", "2026-10-15 14:30").info_entry();
        let plugin = &info.get("pluginConfigs").and_then(bplist::Value::as_array).unwrap()[0];
        let climate = plugin
            .get("accessories")
            .and_then(bplist::Value::as_array)
            .unwrap()
            .iter()
            .find(|a| a.get("type").and_then(bplist::Value::as_int) == Some(0x0100_0001))
            .unwrap();
        let windows: Vec<(String, Option<u64>)> = climate
            .get("services")
            .and_then(bplist::Value::as_array)
            .unwrap()
            .iter()
            .filter(|s| s.get("type").and_then(bplist::Value::as_int) == Some(0x1100_0005))
            .map(|s| {
                let chars = s.get("characteristics").and_then(bplist::Value::as_array).unwrap();
                let of = |kind| {
                    chars
                        .iter()
                        .find(|c| c.get("type").and_then(bplist::Value::as_int) == Some(kind))
                        .and_then(|c| c.get("initialValue"))
                };
                let key = of(0x3600_0065).and_then(bplist::Value::as_str).unwrap().to_string();
                (key, of(0x3100_0014).and_then(bplist::Value::as_int))
            })
            .collect();
        assert_eq!(
            windows,
            [("windshield_front".to_string(), Some(2)), ("windshield_rear".to_string(), Some(2))]
        );
    }

    #[test]
    fn each_vent_has_its_button_and_auto_takes_them_all() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let directions: Vec<_> =
            VENTS.iter().map(|vent| state.values.get(&(vent + 3)).cloned()).collect();
        let one = |d| Some(Value::Array(vec![Value::Int(d)]));
        assert_eq!(directions, [one(UPPER), one(MIDDLE), one(LOWER)]);
        let [_, middle, lower] = VENTS;
        let automatic =
            VENTS.iter().all(|v| state.values.get(&(v + 2)) == Some(&Value::Bool(true)));
        assert!(automatic, "the vents start in automatic, as AUTO does");
        let iids = [middle + 1, middle + 2, lower + 1, lower + 2].map(Value::Int).to_vec();
        state.handle(Lane::High, &command("registerRequest", Value::Array(iids)));
        let update = |state: &mut VehicleState, written: (i64, Value)| {
            let answers = state.handle(Lane::High, &command("writeRequest", by_iid(&[written])));
            opened(&answers[1].1).get("values").cloned()
        };
        assert_eq!(
            update(&mut state, (lower + 1, Value::Bool(true))),
            Some(by_iid(&[
                (lower + 1, Value::Bool(true)),
                (middle + 2, Value::Bool(false)),
                (lower + 2, Value::Bool(false))
            ])),
            "a vent set by hand takes all of them out of automatic, the middle one stays on"
        );
        assert_eq!(
            update(&mut state, (AUTO_CLIMATE, Value::Bool(true))),
            Some(by_iid(&[(middle + 2, Value::Bool(true)), (lower + 2, Value::Bool(true))]))
        );
        assert_eq!(state.values.get(&(middle + 1)), Some(&Value::Bool(true)));
    }

    #[test]
    fn max_ac_cools_with_everything_and_gives_the_settings_back() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let (level, _) = FAN;
        let iids =
            [MAX_AC, DRIVER_TARGET_TEMPERATURE, PASSENGER_TARGET_TEMPERATURE, RECIRCULATION, level];
        state.handle(
            Lane::High,
            &command("registerRequest", Value::Array(iids.map(Value::Int).to_vec())),
        );
        let update = |state: &mut VehicleState, written: (i64, Value)| {
            let answers = state.handle(Lane::High, &command("writeRequest", by_iid(&[written])));
            opened(&answers[1].1).get("values").cloned()
        };
        let lo = Value::Real(TEMPERATURE_LO);
        update(&mut state, (DRIVER_TARGET_TEMPERATURE, Value::Real(23.0)));

        assert_eq!(
            update(&mut state, (MAX_AC, Value::Bool(true))),
            Some(by_iid(&[
                (MAX_AC, Value::Bool(true)),
                (DRIVER_TARGET_TEMPERATURE, lo.clone()),
                (PASSENGER_TARGET_TEMPERATURE, lo.clone()),
                (RECIRCULATION, Value::Bool(true)),
                (level, Value::Int(7)),
            ]))
        );
        assert_eq!(
            update(&mut state, (MAX_AC, Value::Bool(false))),
            Some(by_iid(&[
                (MAX_AC, Value::Bool(false)),
                (DRIVER_TARGET_TEMPERATURE, Value::Real(23.0)),
                (PASSENGER_TARGET_TEMPERATURE, Value::Real(21.0)),
                (RECIRCULATION, Value::Bool(false)),
                (level, Value::Int(3)),
            ]))
        );

        update(&mut state, (MAX_AC, Value::Bool(true)));
        assert_eq!(
            update(&mut state, (level, Value::Int(4))),
            Some(by_iid(&[(level, Value::Int(4)), (MAX_AC, Value::Bool(false))])),
            "set by hand, Max AC ends and keeps the rest"
        );
        assert_eq!(state.values.get(&DRIVER_TARGET_TEMPERATURE), Some(&lo));
    }

    #[test]
    fn auto_runs_the_fan_until_it_is_set_by_hand() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let (level, _) = FAN;
        let iids = [AUTO_CLIMATE, FAN_AUTO, level].map(Value::Int).to_vec();
        state.handle(Lane::High, &command("registerRequest", Value::Array(iids)));
        let update = |state: &mut VehicleState, written: (i64, Value)| {
            let answers = state.handle(Lane::High, &command("writeRequest", by_iid(&[written])));
            opened(&answers[1].1).get("values").cloned()
        };
        assert_eq!(
            state.values.get(&AUTO_CLIMATE),
            Some(&Value::Bool(true)),
            "climate starts in AUTO"
        );
        assert_eq!(
            update(&mut state, (level, Value::Int(5))),
            Some(by_iid(&[
                (level, Value::Int(5)),
                (FAN_AUTO, Value::Bool(false)),
                (AUTO_CLIMATE, Value::Bool(false))
            ]))
        );
        assert_eq!(
            update(&mut state, (AUTO_CLIMATE, Value::Bool(true))),
            Some(by_iid(&[(AUTO_CLIMATE, Value::Bool(true)), (FAN_AUTO, Value::Bool(true))]))
        );
    }

    #[test]
    fn the_fan_stops_at_level_zero_and_comes_back_at_its_last_level() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let (level, on) = FAN;
        let iids = vec![Value::Int(level), Value::Int(on)];
        state.handle(Lane::High, &command("registerRequest", Value::Array(iids)));
        let update = |state: &mut VehicleState, written: (i64, Value)| {
            let answers = state.handle(Lane::High, &command("writeRequest", by_iid(&[written])));
            opened(&answers[1].1).get("values").cloned()
        };
        assert_eq!(
            update(&mut state, (on, Value::Bool(false))),
            Some(by_iid(&[(on, Value::Bool(false)), (level, Value::Int(0))]))
        );
        assert_eq!(
            update(&mut state, (on, Value::Bool(true))),
            Some(by_iid(&[(on, Value::Bool(true)), (level, Value::Int(3))]))
        );
        assert_eq!(
            update(&mut state, (level, Value::Int(0))),
            Some(by_iid(&[(level, Value::Int(0)), (on, Value::Bool(false))]))
        );
        assert_eq!(
            update(&mut state, (level, Value::Int(7))),
            Some(by_iid(&[(level, Value::Int(7)), (on, Value::Bool(true))]))
        );
    }

    #[test]
    fn synced_zones_follow_the_driver_until_the_passenger_is_set() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let iids = [DRIVER_TARGET_TEMPERATURE, PASSENGER_TARGET_TEMPERATURE, ZONES_SYNCED];
        state.handle(
            Lane::High,
            &command("registerRequest", Value::Array(iids.map(Value::Int).to_vec())),
        );
        let update = |state: &mut VehicleState, written: &[(i64, Value)]| {
            let answers = state.handle(Lane::High, &command("writeRequest", by_iid(written)));
            opened(&answers[1].1).get("values").cloned()
        };

        assert_eq!(
            update(&mut state, &[(DRIVER_TARGET_TEMPERATURE, Value::Real(23.0))]),
            Some(by_iid(&[(DRIVER_TARGET_TEMPERATURE, Value::Real(23.0))])),
            "not synced, the passenger side stays"
        );
        assert_eq!(
            update(&mut state, &[(ZONES_SYNCED, Value::Bool(true))]),
            Some(by_iid(&[
                (ZONES_SYNCED, Value::Bool(true)),
                (PASSENGER_TARGET_TEMPERATURE, Value::Real(23.0))
            ]))
        );
        assert_eq!(
            update(&mut state, &[(DRIVER_TARGET_TEMPERATURE, Value::Real(24.5))]),
            Some(by_iid(&[
                (DRIVER_TARGET_TEMPERATURE, Value::Real(24.5)),
                (PASSENGER_TARGET_TEMPERATURE, Value::Real(24.5))
            ]))
        );
        assert_eq!(
            update(&mut state, &[(PASSENGER_TARGET_TEMPERATURE, Value::Real(20.0))]),
            Some(by_iid(&[
                (PASSENGER_TARGET_TEMPERATURE, Value::Real(20.0)),
                (ZONES_SYNCED, Value::Bool(false))
            ]))
        );
        assert_eq!(state.values.get(&DRIVER_TARGET_TEMPERATURE), Some(&Value::Real(24.5)));
    }

    #[test]
    fn both_front_seats_have_their_own_temperature() {
        let (_, info) = VehicleState::new(false, "9.5.0", "2026-10-15 14:30").info_entry();
        let plugin = &info.get("pluginConfigs").and_then(bplist::Value::as_array).unwrap()[0];
        let climate = plugin
            .get("accessories")
            .and_then(bplist::Value::as_array)
            .unwrap()
            .iter()
            .find(|a| a.get("type").and_then(bplist::Value::as_int) == Some(0x0100_0001))
            .unwrap();
        let seats: Vec<String> = climate
            .get("services")
            .and_then(bplist::Value::as_array)
            .unwrap()
            .iter()
            .filter(|s| s.get("type").and_then(bplist::Value::as_int) == Some(0x1100_0002))
            .flat_map(|s| s.get("characteristics").and_then(bplist::Value::as_array).unwrap())
            .filter(|c| c.get("type").and_then(bplist::Value::as_int) == Some(0x3600_0065))
            .filter_map(|c| c.get("initialValue").and_then(bplist::Value::as_str))
            .map(str::to_string)
            .collect();
        assert_eq!(seats, ["seat_front_left", "seat_front_right"]);
    }

    #[test]
    fn climate_is_described_and_set_from_the_phone() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let (_, info) = state.info_entry();
        let plugin = &info.get("pluginConfigs").and_then(bplist::Value::as_array).unwrap()[0];
        let accessories = plugin.get("accessories").and_then(bplist::Value::as_array).unwrap();
        fn of_type(list: &[bplist::Value], kind: u64) -> &bplist::Value {
            list.iter()
                .find(|x| x.get("type").and_then(bplist::Value::as_int) == Some(kind))
                .unwrap()
        }
        let climate = of_type(accessories, 0x0100_0001);
        let services = climate.get("services").and_then(bplist::Value::as_array).unwrap();
        let characteristics = |kind| {
            of_type(services, kind)
                .get("characteristics")
                .and_then(bplist::Value::as_array)
                .unwrap()
        };
        let target = of_type(characteristics(0x1100_0002), 0x3100_0017);
        assert_eq!(target.get("format").and_then(bplist::Value::as_int), Some(9));
        assert_eq!(target.get("units").and_then(bplist::Value::as_int), Some(1082));
        assert_eq!(target.get("writable").and_then(bplist::Value::as_bool), Some(true));
        assert_eq!(target.get("oemWritable").and_then(bplist::Value::as_bool), Some(true));
        assert_eq!(target.get("minimumValue"), Some(&bplist::Value::Real(16.0)));
        assert_eq!(target.get("initialValue"), Some(&bplist::Value::Real(21.0)));
        let level = of_type(characteristics(0x1100_0007), 0x3100_0012);
        assert_eq!(level.get("maximumValue").and_then(bplist::Value::as_int), Some(7));
        let resources = of_type(accessories, 0x0120_0002);
        let variant = of_type(
            resources.get("services").and_then(bplist::Value::as_array).unwrap(),
            0x2000_0001,
        );
        let style = of_type(
            variant.get("characteristics").and_then(bplist::Value::as_array).unwrap(),
            0x4800_0004,
        );
        assert_eq!(style.get("initialValue"), Some(&bplist::Value::String("5Seater".into())));
        let themed = VehicleState::new(false, "", "").with_variant("DB12Coupe");
        for iid in [EXTERIOR_STYLE, INTERIOR_STYLE, VEHICLE_LAYOUT] {
            let named = themed.characteristic(iid).and_then(|c| c.initial.clone());
            assert_eq!(named, Some(Value::str("DB12Coupe")), "iid {iid}");
            assert_eq!(themed.values.get(&iid), Some(&Value::str("DB12Coupe")));
        }
        let plain = VehicleState::new(false, "", "").with_variant("");
        assert_eq!(plain.values.get(&INTERIOR_STYLE), Some(&Value::str("5Seater")));
        assert!(plain.characteristic(EXTERIOR_STYLE).is_none(), "no theme, no model");

        assert!(plain.characteristic(ENGINE_RPM).is_none(), "no car type, no engine");
        let rpm = Rpm { max: 6000, redline: 5500 };
        let mut hybrid = VehicleState::new(false, "", "")
            .with_engines(Engines { combustion: Some(rpm), electric: true });
        assert_eq!(hybrid.values.get(&2564), Some(&Value::Int(5500)));
        assert_eq!(hybrid.values.get(&ENGINE_POWER), Some(&Value::Real(0.0)));
        hybrid.set_gauges(&serde_json::from_str(r#"{"rpm":2512.4}"#).unwrap());
        assert_eq!(hybrid.values.get(&ENGINE_RPM), Some(&Value::Int(2512)));
        hybrid.set_gauges(&serde_json::from_str(r#"{"rpm":9000}"#).unwrap());
        assert_eq!(hybrid.values.get(&ENGINE_RPM), Some(&Value::Int(6000)), "held at the max");

        let content = ClusterContent {
            panel: "Cluster_Display".into(),
            zones: ["widget://?identifier=com.apple.tires".into(), String::new()],
        };
        let shown = VehicleState::new(false, "", "").with_cluster_content(Some(&content));
        assert_eq!(
            shown.values.get(&3074),
            Some(&Value::str("widget://?identifier=com.apple.tires"))
        );
        assert_eq!(shown.values.get(&3075), Some(&Value::Bool(true)));
        assert_eq!(shown.values.get(&3081), Some(&Value::Bool(false)), "an empty zone is off");
        assert_eq!(shown.values.get(&3084), Some(&Value::str("zone2")));
        assert_eq!(
            shown.characteristic(3333).and_then(|c| c.initial.clone()),
            Some(Value::str("zone1"))
        );
        let mut shown = shown;
        shown.show_in_zone(0, "");
        assert_eq!(shown.values.get(&3075), Some(&Value::Bool(false)));
        shown.show_in_zone(1, "picker://");
        assert_eq!(shown.values.get(&3080), Some(&Value::str("picker://")));
        assert_eq!(shown.values.get(&3081), Some(&Value::Bool(true)));

        let iids = [520, 525].map(Value::Int).to_vec();
        state.handle(Lane::High, &command("registerRequest", Value::Array(iids)));
        let written = by_iid(&[(520, Value::Real(22.5)), (521, Value::Real(30.0))]);
        let answers = state.handle(Lane::High, &command("writeRequest", written));
        let results = by_iid(&[(520, Value::Int(WRITTEN)), (521, Value::Int(NO_VALUE))]);
        assert_eq!(opened(&answers[0].1).get("errors"), Some(&results));
        let update = opened(&answers[1].1);
        assert_eq!(update.get("values"), Some(&by_iid(&[(520, Value::Real(22.5))])));
        assert_eq!(
            state.values.get(&521),
            Some(&Value::Real(21.0)),
            "the car measures, not the phone"
        );
    }

    #[test]
    fn climate_reads_as_the_telemetry_block() {
        let climate = serde_json::Value::Object(default_climate());
        assert_eq!(
            climate,
            serde_json::json!({
                "on": true, "auto": true, "ac": true, "maxAc": false, "maxDefrost": false,
                "recirculation": false, "zonesSynced": false,
                "driverTargetC": 21.0, "passengerTargetC": 21.0,
                "driverCabinC": 21.0, "passengerCabinC": 21.0,
                "fanLevel": 3, "fanAuto": true,
                "frontWindowHeating": 0, "rearWindowHeating": 0,
                "ventUpper": false, "ventMiddle": true, "ventLower": false, "ventsAuto": true,
                "driverSeatHeating": 0, "passengerSeatHeating": 0
            })
        );
    }

    #[test]
    fn livi_sets_climate_and_the_phone_hears_what_changed() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let (level, on) = FAN;
        let iids = [AUTO_CLIMATE, FAN_AUTO, level, on, DRIVER_TARGET_TEMPERATURE];
        state.handle(
            Lane::High,
            &command("registerRequest", Value::Array(iids.map(Value::Int).to_vec())),
        );
        let set = |state: &mut VehicleState, climate: serde_json::Value| {
            let answers = state.set_climate(climate.as_object().unwrap());
            assert!(answers.len() <= 1);
            answers.first().map(|(lane, message)| {
                assert_eq!(*lane, Lane::High);
                opened(message).get("values").cloned().unwrap()
            })
        };

        assert_eq!(
            set(&mut state, serde_json::json!({ "fanLevel": 5 })),
            Some(by_iid(&[
                (level, Value::Int(5)),
                (FAN_AUTO, Value::Bool(false)),
                (AUTO_CLIMATE, Value::Bool(false))
            ])),
            "the fan set by hand ends AUTO, as on the phone"
        );
        assert_eq!(set(&mut state, serde_json::json!({ "fanLevel": 5 })), None);
        assert_eq!(
            set(&mut state, serde_json::json!({ "auto": true, "fanAuto": false })),
            Some(by_iid(&[(AUTO_CLIMATE, Value::Bool(true))])),
            "what was named stands against the rules"
        );
        assert_eq!(
            set(&mut state, serde_json::json!({ "driverTargetC": 21.3, "fanLevel": 0 })),
            Some(by_iid(&[
                (DRIVER_TARGET_TEMPERATURE, Value::Real(21.5)),
                (on, Value::Bool(false)),
                (level, Value::Int(0)),
                (AUTO_CLIMATE, Value::Bool(false))
            ]))
        );
        set(
            &mut state,
            serde_json::json!({
                "driverTargetC": 40, "driverSeatHeating": 5, "ventsAuto": false,
                "fanLevel": "high", "rear": 1
            }),
        );
        let climate = state.climate().unwrap();
        assert_eq!(climate["driverTargetC"], 28.0);
        assert_eq!(climate["driverSeatHeating"], 2);
        assert_eq!(climate["fanLevel"], 0);
        assert_eq!(climate["ventsAuto"], false);
        assert!(VENTS.iter().all(|v| state.values.get(&(v + 2)) == Some(&Value::Bool(false))));
    }

    #[test]
    fn fuel_and_trip_computer_are_read_only_with_bounded_numbers() {
        let state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let accessories = state.accessory_list();
        let kinds: Vec<i64> = accessories
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|a| a.get("type").and_then(Value::as_int))
            .collect();
        assert!(kinds.contains(&0x0900_0006) && kinds.contains(&0x0400_0001));
        let flag = |iid, key| state.characteristic(iid).unwrap().describe().get(key).cloned();
        for iid in [FUEL_LEVEL, FUEL_RANGE.km, FUEL_RANGE.km + 1, ODOMETER.km, FUEL_EFFICIENCY] {
            assert_eq!(flag(iid, "writable"), Some(Value::Bool(false)), "{iid} is the car's");
            assert!(flag(iid, "minimumValue").is_some(), "{iid} carries its bounds");
            assert!(flag(iid, "maximumValue").is_some() && flag(iid, "stepValue").is_some());
        }
        assert_eq!(flag(FUEL_LEVEL, "maximumValue"), Some(Value::Int(100)));
        assert_eq!(flag(ODOMETER.km, "format"), Some(Value::Int(Format::Uint64 as i64)));
        // Without a unit the phone cannot say the value.
        let units = |iid| flag(iid, "units");
        assert_eq!(units(FUEL_LEVEL), Some(Value::Int(PERCENT)));
        assert_eq!(units(FUEL_RANGE.km), Some(Value::Int(KILOMETERS)));
        assert_eq!(units(FUEL_RANGE.km + 1), Some(Value::Int(MILES)));
        assert_eq!(units(FUEL_EFFICIENCY), Some(Value::Int(MILLILITERS_PER_100_KM)));
        assert_eq!(state.values.get(&FUEL_RANGE.hidden.unwrap()), Some(&Value::Bool(true)));
        assert_eq!(state.values.get(&REMAINING_RANGE.hidden.unwrap()), Some(&Value::Bool(true)));
    }

    #[test]
    fn gauges_reach_the_phone_in_both_units() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let gauges = |v: serde_json::Value| v.as_object().cloned().unwrap();
        let quiet = state.set_gauges(&gauges(serde_json::json!({ "fuelPct": 42 })));
        assert!(quiet.is_empty(), "nothing goes out before the phone follows");
        assert_eq!(state.values.get(&FUEL_LEVEL), Some(&Value::Int(42)));

        let iids = [FUEL_LEVEL, FUEL_RANGE.km, FUEL_RANGE.km + 1, 1543, ODOMETER.km, 1546];
        state.handle(
            Lane::High,
            &command("registerRequest", Value::Array(iids.map(Value::Int).to_vec())),
        );
        let answers = state.set_gauges(&gauges(serde_json::json!({
            "fuelPct": 120,
            "rangeKm": 380.4,
            "odometerKm": 123456,
            "consumptionAvgLPer100Km": 8.1,
            "speedKph": 50,
            "rangeFuelKm": "far"
        })));
        assert_eq!(answers.len(), 1);
        assert_eq!(answers[0].0, Lane::High);
        assert_eq!(
            opened(&answers[0].1).get("values"),
            Some(&by_iid(&[
                (FUEL_LEVEL, Value::Int(100)),
                (FUEL_RANGE.km, Value::Int(380)),
                (FUEL_RANGE.km + 1, Value::Int(236)),
                (1543, Value::Bool(false)),
                (ODOMETER.km, Value::Int(123_456)),
                (1546, Value::Int(8100)),
            ]))
        );
        assert_eq!(state.values.get(&REMAINING_RANGE.km), Some(&Value::Int(380)));
        assert_eq!(state.values.get(&(REMAINING_RANGE.km + 1)), Some(&Value::Int(236)));

        let again = state.set_gauges(&gauges(serde_json::json!({ "rangeKm": 380 })));
        assert!(again.is_empty(), "an unchanged reading stays home");
        state.set_gauges(&gauges(serde_json::json!({ "rangeKm": -5, "consumptionLPer100Km": -1 })));
        assert_eq!(state.values.get(&FUEL_RANGE.km), Some(&Value::Int(0)));
        assert_eq!(state.values.get(&FUEL_EFFICIENCY), Some(&Value::Int(0)));
    }

    #[test]
    fn each_wheel_has_its_pressure_and_place() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let tires = state.accessories.iter().find(|a| a.kind == 0x0A00_0001).unwrap();
        assert_eq!(tires.services.len(), 4);
        for (n, service) in tires.services.iter().enumerate() {
            assert_eq!(service.kind, 0x1B00_0001);
            let pressure = &service.characteristics[0];
            assert_eq!((pressure.iid, pressure.kind), (tire_pressure_iid(n), 0x3000_001B));
            assert_eq!(pressure.range, Some((0.0, 1000.0, 1.0)));
            assert_eq!(pressure.units, Some(KILOPASCALS));
            let place = service.characteristics[1].initial.clone();
            assert_eq!(place, Some(Value::str(WHEELS[n].1)));
            let (pressure_state, sensor_state) =
                (&service.characteristics[2], &service.characteristics[3]);
            assert_eq!((pressure_state.kind, sensor_state.kind), (0x3000_001C, 0x3000_001A));
            assert_eq!(
                pressure_state.range,
                Some((0.0, 5.0, 1.0)),
                "the phone drops a number without bounds"
            );
            assert_eq!(pressure_state.initial, Some(Value::Int(PRESSURE_UNDEFINED)));
            assert_eq!(sensor_state.initial, Some(Value::Int(SENSOR_WAITING)));
        }

        let iids = (0..4).map(|n| Value::Int(tire_pressure_iid(n))).collect();
        state.handle(Lane::High, &command("registerRequest", Value::Array(iids)));
        let gauges = serde_json::json!({ "tirePressure": {
            "frontLeftKpa": 240.4, "rearRightKpa": 1500, "rearLeftKpa": "flat"
        } });
        let answers = state.set_gauges(gauges.as_object().unwrap());
        assert_eq!(
            opened(&answers[0].1).get("values"),
            Some(&by_iid(&[
                (tire_pressure_iid(0), Value::Int(240)),
                (tire_pressure_iid(3), Value::Int(1000))
            ])),
            "a wheel pushed alone goes out alone, held to the bounds"
        );
        let states = |n| {
            let iid = tire_pressure_iid(n);
            (state.values.get(&(iid + 2)).cloned(), state.values.get(&(iid + 3)).cloned())
        };
        let measured = (Some(Value::Int(PRESSURE_UNDEFINED)), Some(Value::Int(SENSOR_ACTIVE)));
        assert_eq!(states(0), measured, "a measured wheel has an active sensor");
        assert_eq!(
            states(1),
            (Some(Value::Int(PRESSURE_UNDEFINED)), Some(Value::Int(SENSOR_WAITING)))
        );
    }

    #[test]
    fn the_volume_goes_both_ways_in_percent() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let volume = state.characteristic(VOLUME).unwrap().describe();
        assert_eq!(volume.get("writable"), Some(&Value::Bool(true)), "Siri may set it");
        assert_eq!(volume.get("maximumValue"), Some(&Value::Int(100)));
        assert_eq!(volume.get("disabled"), Some(&Value::Bool(false)));
        let fan = state.characteristic(FAN.0).unwrap().describe();
        assert!(fan.get("disabled").is_none(), "only where it is said");
        assert_eq!(state.volume(), Some(0.5));

        state.handle(
            Lane::High,
            &command("registerRequest", Value::Array(vec![Value::Int(VOLUME)])),
        );
        let answers = state.set_gauges(serde_json::json!({ "volume": 0.304 }).as_object().unwrap());
        assert_eq!(opened(&answers[0].1).get("values"), Some(&by_iid(&[(VOLUME, Value::Int(30))])));
        state.set_gauges(serde_json::json!({ "volume": 2.0 }).as_object().unwrap());
        assert_eq!(state.volume(), Some(1.0), "the head unit's level is held to 0 to 1");

        let written = by_iid(&[(VOLUME, Value::Int(42))]);
        state.handle(Lane::Normal, &command("writeRequest", written));
        assert_eq!(state.volume(), Some(0.42));

        let mute = |on| by_iid(&[(MUTE, Value::Bool(on))]);
        state.handle(Lane::Normal, &command("writeRequest", mute(true)));
        assert_eq!(state.volume(), Some(0.0), "mute silences");
        state.handle(Lane::Normal, &command("writeRequest", mute(false)));
        assert_eq!(state.volume(), Some(0.42), "unmute brings the last level back");

        state.handle(Lane::Normal, &command("writeRequest", mute(true)));
        state.handle(Lane::Normal, &command("writeRequest", by_iid(&[(VOLUME, Value::Int(10))])));
        assert_eq!(state.values.get(&MUTE), Some(&Value::Bool(false)), "turning up ends the mute");
        state.handle(Lane::Normal, &command("writeRequest", mute(true)));
        state.set_gauges(serde_json::json!({ "volume": 0.2 }).as_object().unwrap());
        assert_eq!(state.values.get(&MUTE), Some(&Value::Bool(false)), "so does the head unit");

        let audio = state.accessories.iter().find(|a| a.kind == 0x0200_0001).unwrap();
        let types: Vec<_> =
            audio.services.iter().map(|s| s.characteristics[1].initial.clone()).collect();
        assert_eq!(
            types,
            [0, 1, 2, 3, 6].map(|t| Some(Value::Int(t))),
            "media, navigation, call, other"
        );
        let kind = audio.services[1].characteristics[1].describe();
        assert_eq!(kind.get("maximumValue"), Some(&Value::Int(7)), "media to vehicle notification");
        let label = audio.services[4].characteristics[2].initial.clone();
        assert_eq!(label, Some(Value::str("Musik")), "the other volume names itself");
        let levels = serde_json::json!({ "navVolume": 0.3, "callVolume": 0.9 });
        state.set_gauges(levels.as_object().unwrap());
        let volumes = state.volumes();
        assert_eq!(volumes[..3], [("volume", 0.2), ("navVolume", 0.3), ("callVolume", 0.9)]);

        let music = state.characteristic(MUSIC_VOLUME).unwrap().describe();
        assert_eq!(music.get("writable"), Some(&Value::Bool(true)));
        assert_eq!(music.get("maximumValue"), Some(&Value::Int(100)));
        state.set_gauges(serde_json::json!({ "audioVolume": 0.65 }).as_object().unwrap());
        assert_eq!(state.volumes()[3], ("audioVolume", 0.65));
        state.handle(
            Lane::Normal,
            &command("writeRequest", by_iid(&[(MUSIC_VOLUME, Value::Int(30))])),
        );
        assert_eq!(state.volumes()[3], ("audioVolume", 0.3), "the phone sets the music too");
    }

    #[test]
    fn what_cannot_be_read_gets_no_answer() {
        let mut state = VehicleState::new(true, "9.5.0", "2026-10-15 14:30");
        assert!(state.handle(Lane::High, b"\xA0").is_empty());
        let inner = opack::encode(&dict([("command", Value::str("configRequest"))]));
        let elsewhere =
            opack::encode(&dict([("pluginID", Value::Int(3)), ("pluginData", Value::Data(inner))]));
        assert!(state.handle(Lane::High, &elsewhere).is_empty());
        assert!(state.handle(Lane::High, &command("unregisterRequest", Value::Null)).is_empty());
        let written = by_iid(&[(270, Value::Int(2))]);
        assert_eq!(state.handle(Lane::High, &command("writeRequest", written)).len(), 1);
    }

    fn service_of(state: &VehicleState, iid: i64) -> Value {
        let list = state.accessory_list();
        let service = list
            .as_array()
            .unwrap()
            .iter()
            .flat_map(|a| a.get("services").and_then(Value::as_array).unwrap())
            .find(|s| s.get("iid").and_then(Value::as_int) == Some(iid))
            .cloned();
        service.unwrap()
    }

    #[test]
    fn the_radio_app_finds_one_dab_source_and_its_commands() {
        let state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let source = service_of(&state, RADIO_SOURCE_SERVICE);
        assert_eq!(source.get("type").and_then(Value::as_int), Some(0x1400_0006));
        assert!(source.get("controls").is_none());
        assert_eq!(state.values.get(&4098), Some(&Value::str("DAB")));
        assert_eq!(state.values.get(&4099), Some(&Value::Int(DAB_SOURCE)));
        assert_eq!(state.values.get(&RADIO_DISABLED), Some(&Value::Bool(true)));
        let items = state.characteristic(RADIO_ITEMS).unwrap().describe();
        assert_eq!(items.get("largePayload"), Some(&Value::Bool(true)));
        assert_eq!(items.get("maximumLength").and_then(Value::as_int), Some(LARGE_LENGTH));
        let artwork = state.characteristic(NOW_PLAYING_ARTWORK).unwrap().describe();
        assert_eq!(artwork.get("format").and_then(Value::as_int), Some(Format::Data as i64));

        let playing = service_of(&state, NOW_PLAYING_SERVICE);
        let controls = playing.get("controls").and_then(Value::as_array).unwrap();
        assert_eq!(controls.len(), 7);
        let tune = controls
            .iter()
            .find(|c| c.get("type").and_then(Value::as_int) == Some(0x0F00_004B))
            .unwrap();
        assert_eq!(tune.get("sender").and_then(Value::as_int), Some(SENT_BY_PHONE));
        assert_eq!(tune.get("hasResponse"), Some(&Value::Bool(true)));
        let names: Vec<&str> = tune
            .get("requestParameters")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .filter_map(|p| p.get("name").and_then(Value::as_str))
            .collect();
        assert_eq!(names, ["identifier", "sourceIdentifier"]);
        let play = controls.iter().find(|c| c.get("iid").and_then(Value::as_int) == Some(4360));
        assert!(play.unwrap().get("requestParameters").is_none());
    }

    #[test]
    fn radio_app_commands_are_answered_and_handed_on() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let tune =
            dict([("identifier", Value::str("d220")), ("sourceIdentifier", Value::str("DAB"))]);
        let elsewhere =
            dict([("identifier", Value::str("x")), ("sourceIdentifier", Value::str("FM"))]);
        let pressed = by_iid(&[
            (4364, tune),
            (4360, Value::Null),
            (4361, Value::Null),
            (4362, Value::Null),
            (4363, Value::Null),
            (4366, dict([("identifier", Value::str("DAB"))])),
            (4365, dict([("frequency", Value::Int(94_800))])),
            (4364, elsewhere),
            (9999, Value::Null),
        ]);
        let answers = state.handle(Lane::Normal, &command("controlRequest", pressed));
        assert_eq!(answers.len(), 1);
        assert_eq!(answers[0].0, Lane::Normal);
        let answer = opened(&answers[0].1);
        assert_eq!(answer.get("command").and_then(Value::as_str), Some("controlResponse"));
        assert_eq!(answer.get("transactionID").and_then(Value::as_int), Some(8));
        assert_eq!(answer.get("values").and_then(Value::as_dict).map(<[_]>::len), Some(8));
        assert_eq!(answer.get("errors"), Some(&by_iid(&[(9999, Value::Int(NO_SUCH_COMMAND))])));
        assert_eq!(
            state.take_radio_commands(),
            vec![
                RadioCommand::Tune("d220".into()),
                RadioCommand::Play,
                RadioCommand::Pause,
                RadioCommand::Next,
                RadioCommand::Previous,
                RadioCommand::Play,
            ]
        );
        assert!(state.take_radio_commands().is_empty());
    }

    #[test]
    fn the_radio_reaches_the_phone_as_updates() {
        let mut state = VehicleState::new(false, "9.5.0", "2026-10-15 14:30");
        let followed =
            [RADIO_DISABLED, RADIO_ITEMS, RADIO_ITEM_IMAGES, NOW_PLAYING_TITLE, PLAYBACK_STATE];
        let iids = followed.iter().map(|i| Value::Int(*i)).collect();
        state.handle(Lane::High, &command("registerRequest", Value::Array(iids)));
        let radio = Radio {
            available: true,
            stations: vec![
                RadioStation {
                    id: "d220".into(),
                    name: "Dlf Kultur".into(),
                    short_name: "Kultur".into(),
                    ensemble: "DR Deutschland".into(),
                    image: Some(vec![0xff, 0xd8]),
                },
                RadioStation {
                    id: "d210".into(),
                    name: "Dlf".into(),
                    short_name: "Dlf".into(),
                    ensemble: "DR Deutschland".into(),
                    image: None,
                },
            ],
            current: Some("d220".into()),
            title: "Lesart".into(),
            artist: "Dlf Kultur".into(),
            album: "DR Deutschland".into(),
            artwork: vec![1, 2],
            playing: true,
        };
        let answers = state.set_radio(&radio);
        assert_eq!(answers.len(), 1);
        let update = opened(&answers[0].1);
        let values = update.get("values").and_then(Value::as_dict).unwrap();
        let value = |iid| values.iter().find(|(k, _)| k.as_int() == Some(iid)).map(|(_, v)| v);
        assert_eq!(value(RADIO_DISABLED), Some(&Value::Bool(false)));
        assert_eq!(value(NOW_PLAYING_TITLE), Some(&Value::str("Lesart")));
        assert_eq!(value(PLAYBACK_STATE), Some(&Value::Int(PLAYING)));
        let items = value(RADIO_ITEMS).and_then(Value::as_array).unwrap();
        assert_eq!(items[0].get("identifier").and_then(Value::as_str), Some("d220"));
        assert_eq!(items[0].get("mediaItemType").and_then(Value::as_str), Some("dab"));
        assert_eq!(items[0].get("mediaItemImageIdentifier").and_then(Value::as_str), Some("d220"));
        assert!(items[1].get("mediaItemImageIdentifier").is_none());
        let images = value(RADIO_ITEM_IMAGES).and_then(Value::as_array).unwrap();
        assert_eq!(images.len(), 1);
        assert_eq!(images[0].get("imageData").and_then(Value::as_data), Some(&[0xff, 0xd8][..]));
        assert_eq!(state.values.get(&NOW_PLAYING_ARTWORK), Some(&Value::Data(vec![1, 2])));

        assert!(state.set_radio(&radio).is_empty(), "nothing changed, nothing sent");
        assert_eq!(shown(&Value::Data(vec![0; 3])), "3 B");
        assert_eq!(shown(&Value::Array(vec![Value::Null; 5])), "5 items");
    }
}
