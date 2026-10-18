// This file is auto-generated from livi-core-proto.

export type Action = { "kind": "setConfig", patch: Partial<Config>, } | { "kind": "show", screen: Screen, front: Front, } | { "kind": "media", control: MediaControl, } | { "kind": "seek", positionMs: number, } | { "kind": "selectDevice", id: string, } | { "kind": "forgetDevice", id: string, } | { "kind": "connectDevice", id: string, } | { "kind": "nextDevice" } | { "kind": "selectClusterLayout", layout: string, } | { "kind": "stepClusterLayout", by: number, } | { "kind": "moveClusterLayout", layout: string, by: number, } | { "kind": "showClusterLayout", layout: string, on: boolean, } | { "kind": "applySettings" } | { "kind": "checkUpdate" } | { "kind": "downloadUpdate" } | { "kind": "installUpdate" } | { "kind": "abortUpdate" } | { "kind": "dabScan" } | { "kind": "dabStopScan" } | { "kind": "dabPlay", serviceId: number, } | { "kind": "dabResume" } | { "kind": "dabPause" } | { "kind": "dabStop" } | { "kind": "dabFavorite", serviceId: number, favorite: boolean, } | { "kind": "dabHide", serviceId: number, hidden: boolean, } | { "kind": "dabMove", serviceId: number, by: number, } | { "kind": "setDongleRadio", radio: Radio, on: boolean, } | { "kind": "quit" } | { "kind": "restart" };

export type AppearanceMode = "auto" | "night" | "day";

export type AppearancePreference = "automatic" | "light" | "dark";

export type ArrangedLayout = { id: string, on: boolean, };

export type AudioDevice = { id: string, name: string, isDefault: boolean, offline: boolean, };

export type CanFrame = { id: number, data: Array<number>, bus?: number, };

export enum CarType { "Unknown" = 0, "Gasoline" = 1, "DieselWinter" = 3, "Diesel" = 4, "Biodiesel" = 5, "E85" = 6, "LPG" = 7, "CNG" = 8, "LNG" = 9, "Electric" = 10, "Hydrogen" = 11, "Other" = 12, "HybridGasoline" = 101, "HybridDiesel" = 102 }

/**
 * The car's climate as CarPlay shows it. Without a running session an outside source keeps it
 * current, a new session starts from it.
 */
export type Climate = { 
/**
 * Who set it last: `carplay` the phone, `external` a push that names no source, `saved` the
 * last run, `default` LIVI's start values. Anything but `carplay` reaches the phone.
 */
source?: string, on?: boolean, auto?: boolean, ac?: boolean, maxAc?: boolean, maxDefrost?: boolean, recirculation?: boolean, 
/**
 * The passenger side follows the driver's temperature.
 */
zonesSynced?: boolean, 
/**
 * 16 to 28 in steps of 0.5, the ends show as LO and HI.
 */
driverTargetC?: number, passengerTargetC?: number, 
/**
 * Measured by the car.
 */
driverCabinC?: number, passengerCabinC?: number, 
/**
 * 0 to 7, 0 is off.
 */
fanLevel?: number, fanAuto?: boolean, 
/**
 * 0 or 1.
 */
frontWindowHeating?: number, rearWindowHeating?: number, ventUpper?: boolean, ventMiddle?: boolean, ventLower?: boolean, 
/**
 * AUTO picks the vents.
 */
ventsAuto?: boolean, 
/**
 * 0 to 2.
 */
driverSeatHeating?: number, passengerSeatHeating?: number, };

export type Cluster = { theme: Theme, layout: string, palette: string, palettes: { [key in string]: string }, shown: Array<string>, arranged: Array<ArrangedLayout>, appearance: AppearancePreference, };

export type ClusterContent = "auto" | "map" | "maneuver";

export type Config = { debugLogging: boolean, wirelessAaEnabled: boolean, wirelessCpEnabled: boolean, wifiPassword: string, btAdapter: string, wifiInterface: string, wifiDedicatedInterface: boolean, wifiType: WifiBand, wifiChannel: number, wifiChannelWidth: number, country: string, carPlaySourceVersion: string, carPlayMfiI2cBus: number, carPlayMfiPowerGpio: number, carPlayHlsVideo: boolean, carPlayDockPosition: DockPosition, carPlayClusterContent: ClusterContent, carPlayClusterCompass: boolean, carPlayClusterEta: boolean, carPlayClusterSpeedLimit: boolean, carPlayTheme: string, carPlayVehicleModel: string, clusterLayout: string, clusterPalettes: { [key in string]: string }, gpsEnabled: boolean, gpsDevice: string, gpsBaudRate: number, timezone: string, projectionWidth: number, projectionHeight: number, projectionFps: number, projectionDpi: number, projectionViewAreaTop: number, projectionViewAreaBottom: number, projectionViewAreaLeft: number, projectionViewAreaRight: number, projectionSafeAreaTop: number, projectionSafeAreaBottom: number, projectionSafeAreaLeft: number, projectionSafeAreaRight: number, projectionSafeAreaDrawOutside: boolean, clusterWidth: number, clusterHeight: number, clusterFps: number, clusterDpi: number, clusterViewAreaTop: number, clusterViewAreaBottom: number, clusterViewAreaLeft: number, clusterViewAreaRight: number, clusterSafeAreaTop: number, clusterSafeAreaBottom: number, clusterSafeAreaLeft: number, clusterSafeAreaRight: number, lastConnectedAaBtMac?: string, darkMode: boolean, overlayMessages: boolean, displayBrightness: number, displayBrightnessAuto: boolean, carName: string, oemName: string, hand: HandDriveType, carType?: CarType, evConnectorTypes?: Array<EvConnectorType>, evMaxAcPowerKw?: number, evMaxDcPowerKw?: number, maxSpeedKph: number, speedScaleStep: number, maxRpm: number, redlineRpm: number, speedUnit: SpeedUnit, temperatureUnit: TemperatureUnit, samplingFrequency: 0 | 1, disableAudioOutput: boolean, huVolume: number, huVolumeLinkSystem: boolean, audioVolume: number, navVolume: number, voiceAssistantVolume: number, callVolume: number, systemSoundsVolume?: number, audioOutputDevice?: string, audioOutputDeviceLabel?: string, audioInputDevice?: string, audioInputDeviceLabel?: string, visualAudioDelayMs: number, dabGainAuto: boolean, dabGainDb: number, dabPpm: number, autoConn: boolean, autoSwitchOnReverse: boolean, startPage: string, language: string, kiosk: PerScreen<boolean>, uiZoomPercent: number, appearanceMode: AppearanceMode, displayMode: PerScreen<string>, displayConnector: PerScreen<string>, displayGamma: number, displayContrast: number, displayColorR: number, displayColorG: number, displayColorB: number, cameraId: string, camera: PerScreen<boolean>, cameraMirror: boolean, cameraRotation: 0 | 90 | 180 | 270, media: PerScreen<boolean>, dashboard: PerScreen<boolean>, dashboardLayouts: { [key in string]: LayoutSlot }, custom: PerScreen<boolean>, customUrl: string, mainScreenBounds?: WindowBounds, clusterScreenBounds?: WindowBounds, auxScreenBounds?: WindowBounds, mainScreenWidth: number, mainScreenHeight: number, clusterScreenActive: boolean, clusterScreenWidth: number, clusterScreenHeight: number, auxScreenActive: boolean, auxScreenWidth: number, auxScreenHeight: number, primaryColorDark?: string, primaryColorLight?: string, highlightColorLight?: string, highlightColorDark?: string, backgroundColorDark?: string, backgroundColorLight?: string, carplayIcon120?: string, carplayIcon180?: string, carplayIcon256?: string, updateNightly: boolean, dismissedPackages: Array<string>, bindings: KeyBindings, };

export const DEFAULT_CONFIG: Config = {
  "debugLogging": false,
  "wirelessAaEnabled": false,
  "wirelessCpEnabled": false,
  "wifiPassword": "12345678",
  "btAdapter": "hci0",
  "wifiInterface": "wlan0",
  "wifiDedicatedInterface": false,
  "wifiType": "5ghz",
  "wifiChannel": 36,
  "wifiChannelWidth": 40,
  "country": "DE",
  "carPlaySourceVersion": "950.7.1",
  "carPlayMfiI2cBus": 2,
  "carPlayMfiPowerGpio": -1,
  "carPlayHlsVideo": true,
  "carPlayDockPosition": "bottom",
  "carPlayClusterContent": "map",
  "carPlayClusterCompass": true,
  "carPlayClusterEta": true,
  "carPlayClusterSpeedLimit": true,
  "carPlayTheme": "",
  "carPlayVehicleModel": "",
  "clusterLayout": "",
  "clusterPalettes": {},
  "gpsEnabled": false,
  "gpsDevice": "/dev/ttyAMA0",
  "gpsBaudRate": 38400,
  "timezone": "",
  "projectionWidth": 1280,
  "projectionHeight": 720,
  "projectionFps": 60,
  "projectionDpi": 0,
  "projectionViewAreaTop": 0,
  "projectionViewAreaBottom": 0,
  "projectionViewAreaLeft": 0,
  "projectionViewAreaRight": 0,
  "projectionSafeAreaTop": 0,
  "projectionSafeAreaBottom": 0,
  "projectionSafeAreaLeft": 0,
  "projectionSafeAreaRight": 0,
  "projectionSafeAreaDrawOutside": true,
  "clusterWidth": 1280,
  "clusterHeight": 720,
  "clusterFps": 60,
  "clusterDpi": 0,
  "clusterViewAreaTop": 0,
  "clusterViewAreaBottom": 0,
  "clusterViewAreaLeft": 0,
  "clusterViewAreaRight": 0,
  "clusterSafeAreaTop": 60,
  "clusterSafeAreaBottom": 10,
  "clusterSafeAreaLeft": 300,
  "clusterSafeAreaRight": 300,
  "lastConnectedAaBtMac": "",
  "darkMode": true,
  "overlayMessages": true,
  "displayBrightness": 1.0,
  "displayBrightnessAuto": true,
  "carName": "LIVI",
  "oemName": "LIVI",
  "hand": 0,
  "carType": 1,
  "evConnectorTypes": [],
  "maxSpeedKph": 200,
  "speedScaleStep": 40,
  "maxRpm": 5000,
  "redlineRpm": 4500,
  "speedUnit": "kmh",
  "temperatureUnit": "celsius",
  "samplingFrequency": 1,
  "disableAudioOutput": false,
  "huVolume": 0.95,
  "huVolumeLinkSystem": true,
  "audioVolume": 0.95,
  "navVolume": 0.95,
  "voiceAssistantVolume": 0.95,
  "callVolume": 0.95,
  "systemSoundsVolume": 0.75,
  "audioOutputDevice": "",
  "audioOutputDeviceLabel": "",
  "audioInputDevice": "",
  "audioInputDeviceLabel": "",
  "visualAudioDelayMs": 0,
  "dabGainAuto": true,
  "dabGainDb": 19.7,
  "dabPpm": 0,
  "autoConn": true,
  "autoSwitchOnReverse": true,
  "startPage": "/",
  "language": "en",
  "kiosk": {
    "main": false,
    "cluster": false,
    "aux": false
  },
  "uiZoomPercent": 100,
  "appearanceMode": "auto",
  "displayMode": {
    "main": "",
    "cluster": "",
    "aux": ""
  },
  "displayConnector": {
    "main": "",
    "cluster": "",
    "aux": ""
  },
  "displayGamma": 1.0,
  "displayContrast": 1.0,
  "displayColorR": 1.0,
  "displayColorG": 1.0,
  "displayColorB": 1.0,
  "cameraId": "",
  "camera": {
    "main": true,
    "cluster": false,
    "aux": false
  },
  "cameraMirror": false,
  "cameraRotation": 0,
  "media": {
    "main": true,
    "cluster": false,
    "aux": false
  },
  "dashboard": {
    "main": true,
    "cluster": false,
    "aux": false
  },
  "dashboardLayouts": {},
  "custom": {
    "main": false,
    "cluster": false,
    "aux": false
  },
  "customUrl": "",
  "mainScreenBounds": {
    "x": 0,
    "y": 0,
    "width": 0,
    "height": 0
  },
  "clusterScreenBounds": {
    "x": 0,
    "y": 0,
    "width": 0,
    "height": 0
  },
  "auxScreenBounds": {
    "x": 0,
    "y": 0,
    "width": 0,
    "height": 0
  },
  "mainScreenWidth": 1280,
  "mainScreenHeight": 720,
  "clusterScreenActive": false,
  "clusterScreenWidth": 1280,
  "clusterScreenHeight": 720,
  "auxScreenActive": false,
  "auxScreenWidth": 800,
  "auxScreenHeight": 480,
  "primaryColorDark": "",
  "primaryColorLight": "",
  "highlightColorLight": "",
  "highlightColorDark": "",
  "backgroundColorDark": "",
  "backgroundColorLight": "",
  "carplayIcon120": "",
  "carplayIcon180": "",
  "carplayIcon256": "",
  "updateNightly": false,
  "dismissedPackages": [],
  "bindings": {
    "up": "ArrowUp",
    "down": "ArrowDown",
    "left": "ArrowLeft",
    "right": "ArrowRight",
    "selectUp": "",
    "selectDown": "Enter",
    "back": "Backspace",
    "knobLeft": "",
    "knobRight": "",
    "knobUp": "",
    "knobDown": "",
    "home": "KeyH",
    "cycleSession": "KeyS",
    "clusterLayout": "KeyT",
    "clusterContent": "KeyZ",
    "playPause": "KeyP",
    "play": "",
    "pause": "",
    "next": "KeyN",
    "prev": "KeyB",
    "acceptPhone": "KeyA",
    "rejectPhone": "KeyR",
    "phoneKey0": "Digit0",
    "phoneKey1": "Digit1",
    "phoneKey2": "Digit2",
    "phoneKey3": "Digit3",
    "phoneKey4": "Digit4",
    "phoneKey5": "Digit5",
    "phoneKey6": "Digit6",
    "phoneKey7": "Digit7",
    "phoneKey8": "Digit8",
    "phoneKey9": "Digit9",
    "phoneKeyStar": "",
    "phoneKeyHash": "",
    "phoneKeyHookSwitch": "",
    "voiceAssistant": "KeyV",
    "voiceAssistantRelease": ""
  }
};

export type Dab = { receiver: string | null, stations: Array<DabStation>, lastStation: number | null, scan: DabScan | null, active: boolean, station: number | null, playing: boolean, text: string | null, signal: DabSignal, error: string | null, gainsDb: Array<number>, };

export type DabScan = { channel: string, done: number, total: number, found: number, };

export type DabSignal = { locked: boolean, quality: number, };

export type DabStation = { serviceId: number, label: string, shortLabel: string, ensemble: string, channel: string, frequencyHz: number, favorite: boolean, hidden: boolean, logo?: string, };

export type DeviceStatus = "active" | "available" | "offline";

export type DeviceView = { id: string, name?: string, model?: string, protocol?: Protocol, lastTransport?: string, status: DeviceStatus, batteryLevel?: number, batteryCharging?: boolean, signalStrength?: number, carrierName?: string, session?: number, };

export type Display = { connector: string, panel: string, screen: Screen | null, current: string | null, modes: Array<string>, };

export type DisplayKind = "cluster" | "center";

export type DockPosition = "auto" | "side" | "bottom";

export type DongleRadios = { wifi: boolean, bt: boolean, };

export const EMPTY_GNSS_INFO: GnssInfo = {
  "connected": false,
  "fixQuality": "none",
  "fixMode": "none",
  "satellitesUsed": 0,
  "satellitesVisible": 0,
  "satellites": [],
  "constellations": []
};

export enum EvConnectorType { "Unknown" = 0, "J1772" = 1, "Mennekes" = 2, "Chademo" = 3, "Combo1" = 4, "Combo2" = 5, "TeslaSupercharger" = 8, "Gbt" = 9, "Other" = 101 }

export type FromCore = { "type": "welcome", protocol: number, version: string, rev: number, state: State, } | { "type": "refused", reason: string, } | { "type": "patch", rev: number, ops: Array<PatchOp>, } | { "type": "reply", id: number, error?: string, } | { "type": "spectrum", bands: Array<number>, } | { "type": "openPage", path: string, };

export type Front = "livi" | "projection" | "cluster" | "camera";

export type GnssAntennaPower = "off" | "on" | "unknown";

export type GnssAntennaStatus = "init" | "unknown" | "ok" | "short" | "open";

export type GnssConstellation = "beidou" | "galileo" | "glonass" | "gps" | "qzss" | "unknown";

export type GnssFixMode = "none" | "2d" | "3d";

export type GnssFixQuality = "none" | "gps" | "dgps" | "pps" | "rtk" | "rtkFloat" | "estimated" | "manual" | "simulated";

export type GnssInfo = { connected: boolean, device?: string, baudRate?: number, fixQuality: GnssFixQuality, fixMode: GnssFixMode, satellitesUsed: number, satellitesVisible: number, satellites: Array<GnssSatellite>, constellations: Array<GnssConstellation>, version?: GnssVersion, rf?: GnssRf, error?: string, pdop?: number, hdop?: number, vdop?: number, receiverTime?: number, updatedAt?: number, timezone?: string, };

export type GnssJamming = "unknown" | "ok" | "warning" | "critical";

export type GnssRf = { jamming: GnssJamming, antennaStatus: GnssAntennaStatus, antennaPower: GnssAntennaPower, noise: number, agc: number, jammingIndicator: number, };

export type GnssSatellite = { id: number, constellation: GnssConstellation, used: boolean, elevation?: number, azimuth?: number, snr?: number, };

export type GnssVersion = { software: string, hardware: string, firmware?: string, protocol?: string, model?: string, supported?: Array<string>, };

export type GpsFix = { lat?: number, lng?: number, alt?: number, heading?: number, speedMs?: number, accuracyM?: number, satellites?: number, fixTs?: number, };

export enum HandDriveType { "LHD" = 0, "RHD" = 1 }

export type Input = { "kind": "pointer", screen: Screen, points: Array<Point>, } | { "kind": "key", code: string, down: boolean, };

export type KeyBindings = { up: string, down: string, left: string, right: string, selectUp: string, selectDown: string, back: string, knobLeft: string, knobRight: string, knobUp: string, knobDown: string, home: string, cycleSession: string, clusterLayout: string, clusterContent: string, playPause: string, play: string, pause: string, next: string, prev: string, acceptPhone: string, rejectPhone: string, phoneKey0: string, phoneKey1: string, phoneKey2: string, phoneKey3: string, phoneKey4: string, phoneKey5: string, phoneKey6: string, phoneKey7: string, phoneKey8: string, phoneKey9: string, phoneKeyStar: string, phoneKeyHash: string, phoneKeyHookSwitch: string, voiceAssistant: string, voiceAssistantRelease: string, };

export type LayoutSlot = { on: boolean, pos: number, };

export type LinkSpeed = { downMbps: number, upMbps: number, downRate: number, upRate: number, };

export const MAX_FRAME = 16777216;

export type MediaControl = "playPause" | "play" | "pause" | "next" | "prev";

export type Navigation = { active: boolean | null, orderType: number | null, roadName: string | null, afterRoadName: string | null, destinationName: string | null, timeToDestination: number | null, distanceToDestination: number | null, remainDistance: number | null, maneuverType: number | null, turnSide: number | null, junctionType: number | null, turnAngle: number | null, eta: number | null, etaText: string | null, appName: string | null, image: string | null, maneuverText: string | null, maneuverDistanceText: string | null, destinationDistanceText: string | null, timeLeftText: string | null, };

/**
 * A notification in the CarPlay cluster, for warnings such as range, temperature or frost. It
 * stays until Enter or the phone closes it, either sets `open` back to false. Each one also lands
 * in the Vehicle app's notification list, the last ten until the user clears them.
 */
export type Notification = { title?: string, text?: string, 
/**
 * An SF Symbol such as `snowflake`, or the name of a PNG in `~/.config/LIVI/carplay-images`
 * such as `livi`. A PNG shows only once the phone fetched the folder, from the next CarPlay
 * start and in practice only with a theme, else just SF Symbols work.
 */
symbol?: string, 
/**
 * True shows it, false closes it.
 */
open?: boolean, };

export type NowPlaying = { title: string | null, artist: string | null, album: string | null, app: string | null, durationMs: number | null, elapsedMs: number | null, playing: boolean | null, artwork: string | null, };

export const PROTOCOL = 8;

export type Palette = { id: string, accentDark: string, accentLight: string, };

export type PatchOp = { "op": "set", path: Array<string>, value: unknown, } | { "op": "remove", path: Array<string>, };

export type PerScreen<T> = { main: T, cluster: T, aux: T, };

export type Phase = "down" | "move" | "up" | "cancel";

export type Point = { id: number, x: number, y: number, phase: Phase, };

export type Protocol = "carplay" | "androidauto";

export type Radio = "wifi" | "bt";

export type Release = { version: string, commit: string, run: string, url: string | null, };

export type Screen = "main" | "cluster" | "aux";

export type Sessions = { active: Protocol | null, position: number, total: number, };

export type SpeedUnit = "kmh" | "mph";

export type State = { front: PerScreen<Front>, sessions: Sessions, nowPlaying: NowPlaying, navigation: Navigation, system: System, devices: Array<DeviceView>, telemetry: TelemetrySnapshot & Record<string, unknown>, update: Update, cluster: Cluster, dab: Dab, config: Config, };

export type System = { wifiInterfaces: Array<string>, btAdapters: Array<string>, interfaceModels: { [key in string]: string }, dongle: DongleRadios | null, linkSpeed: LinkSpeed | null, wifiBands: Array<WifiBand>, wifiChannels: Array<number>, wifiCountries: Array<string>, displays: Array<Display>, displaysSettable: boolean, audioSinks: Array<AudioDevice>, audioSources: Array<AudioDevice>, };

export type TelemetrySnapshot = { 
/**
 * Unix milliseconds, LIVI fills it in when a push has none.
 */
ts?: number, speedKph?: number, rpm?: number, 
/**
 * A number for a manual gearbox, -1 reverse, 0 neutral, 1 to 10. A string for an automatic,
 * P, R, N, D, S or M1 to M10.
 */
gear: number | string, 
/**
 * Negative is left.
 */
steeringDeg?: number, 
/**
 * Wins over `gear`.
 */
reverse?: boolean, 
/**
 * Low beam.
 */
lights?: boolean, 
/**
 * Android Auto shows high beam whatever `lights` says.
 */
highBeam?: boolean, hazards?: boolean, 
/**
 * Taken as `turn` too, the name it had before.
 */
turnSignal?: TurnSignal, parkingBrake?: boolean, coolantC?: number, oilC?: number, 
/**
 * Automatic transmission oil.
 */
transmissionC?: number, 
/**
 * Intake air.
 */
iatC?: number, 
/**
 * Outside, Android Auto and CarPlay get it too.
 */
ambientC?: number, 
/**
 * The 12 V battery.
 */
batteryV?: number, 
/**
 * 0 to 100, for an electric car the state of charge.
 */
fuelPct?: number, rangeKm?: number, 
/**
 * Hybrids only, the range on the tank.
 */
rangeFuelKm?: number, 
/**
 * Hybrids only, the range on the battery.
 */
rangeElectricKm?: number, fuelRateLph?: number, consumptionLPer100Km?: number, consumptionAvgLPer100Km?: number, 
/**
 * Gross capacity. Turns on electric routing in Android Auto, whatever `carType` says.
 */
batteryCapacityKwh?: number, 
/**
 * Taken from `fuelPct` and the capacity when absent.
 */
batteryLevelKwh?: number, 
/**
 * True while the battery charges.
 */
charging?: boolean, 
/**
 * The `EvConnectorType` name of the plug that charges, such as `Combo2`.
 */
activeConnector?: string, 
/**
 * The range on a full battery.
 */
rangeMaxElectricKm?: number, 
/**
 * A `CarType` name such as `HybridDiesel`, written into the settings when it differs.
 */
carType?: string, 
/**
 * `EvConnectorType` names such as `Combo2`, written into the settings when they differ.
 */
evConnectorTypes?: Array<string>, 
/**
 * The fastest AC charging the car takes, written into the settings when it differs.
 */
evMaxAcPowerKw?: number, 
/**
 * The fastest DC charging the car takes, written into the settings when it differs.
 */
evMaxDcPowerKw?: number, 
/**
 * Manifold absolute pressure.
 */
mapKpa?: number, 
/**
 * Android Auto also gets it on its environment channel.
 */
baroKpa?: number, boostKpa?: number, 
/**
 * Throttle position, 0 to 100.
 */
throttlePct?: number, 
/**
 * 1.0 is stoichiometric.
 */
lambda?: number, 
/**
 * Air to fuel ratio.
 */
afr?: number, 
/**
 * Android Auto gets it in steps of 0.1 km.
 */
odometerKm?: number, odometerTripKm?: number, 
/**
 * Android Auto's driving restrictions as they are, 0 is none.
 */
drivingStatus?: number, ambientLux?: number, 
/**
 * The dimmer of the panel lights, 0 to 100.
 */
dimmerPct?: number, 
/**
 * Day or night for Android Auto and CarPlay, LIVI's own look follows its setting.
 */
nightMode?: boolean, 
/**
 * Day or night for the CarPlay cluster, it follows `nightMode` while absent or null. A
 * change of LIVI's appearance setting sets `nightMode` and clears this one.
 */
clusterNightMode?: boolean, 
/**
 * A page such as `/media` or `/settings/devices`, LIVI's main screen opens it once each time
 * it changes. A path that names no page is ignored.
 */
path?: string, 
/**
 * The head unit's level, 0 to 1. It sets `huVolume`, which drives the amplifier and, while
 * linked, the system mixer.
 */
volume?: number, 
/**
 * Send the whole fix every time or only what the sensor delivers.
 */
gps?: GpsFix, 
/**
 * Only LIVI's own receiver sends it, a push replaces it whole.
 */
gnss?: GnssInfo, tirePressure?: TirePressure, 
/**
 * No receiver uses it, it is for tooling and diagnostics.
 */
can?: CanFrame, climate?: Climate, notification?: Notification, };

export type TemperatureUnit = "celsius" | "fahrenheit";

export type Theme = { id: string, displays: Array<ThemeDisplay>, palettes: Array<Palette>, };

export type ThemeDisplay = { id: string, kind: DisplayKind, layouts: Array<ThemeLayout>, };

export type ThemeLayout = { id: string, name: string, palettes: Array<string>, zones: Array<Zone>, };

/**
 * A sensor may push one wheel at a time.
 */
export type TirePressure = { frontLeftKpa?: number, frontRightKpa?: number, rearLeftKpa?: number, rearRightKpa?: number, };

export type ToCore = { "type": "hello", protocol: number, client: string, } | { "type": "resync" } | { "type": "input", input: Input, } | { "type": "action", id: number, action: Action, } | { "type": "path", path: string, } | { "type": "spectrum", on: boolean, } | { "type": "linkSpeed", on: boolean, } | { "type": "camera", found: boolean, };

export type TurnSignal = "none" | "left" | "right";

export type Update = { latest: Release | null, checking: boolean, checked: boolean, phase: UpdatePhase, received: number, total: number, error: string | null, };

export type UpdatePhase = "idle" | "download" | "ready" | "installing" | "relaunching" | "error";

export const WIFI_PASSWORD_MAX = 63;

export const WIFI_PASSWORD_MIN = 8;

export type WifiBand = "2.4ghz" | "5ghz" | "6ghz";

export type WindowBounds = { x: number, y: number, width: number, height: number, };

export type Zone = { id: string, component: string, };
