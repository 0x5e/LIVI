/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GnssInfo } from './Gnss'
//
//  HOW TO PUSH DATA
//  ════════════════
//
//    Socket.IO  ws://<livi-host>:4000   event: "telemetry:push"
//                 io('ws://livi.local:4000').emit('telemetry:push', { speedKph: 73 })
//
//  A push may carry any subset of fields, LIVI merges it and passes on only what changed.
//  Nested blocks (`gps`, `can`) are merged per field, so `{ gps: { lat: 50 } }` keeps
//  the last known `lng`.
//
//
//  ROUTING OVERVIEW
//  ════════════════
//
//  ✓ = the receiver uses the field, · = not sent, TODO = not wired yet on that side.
//
//    Field                          Dash  AA-native  CP-native
//    ─────────────────────────────────────────────────────────────────
//    speedKph                        ✓     ✓          TODO
//    rpm                             ✓     ✓          TODO
//    gear                            ✓     ✓          ✓
//    reverse                         ✓     ✓ (gear)   ✓ (gear)
//    steeringDeg                     ✓     ·          TODO
//    turn (blinker)                  ✓     ✓          TODO
//    lights / highBeam / hazards     ✓     ✓          TODO
//    parkingBrake                    ✓     ✓          TODO
//    nightMode                       ✓     ✓          ✓
//    path (navigate UI)              ✓     ·          ·
//    volume (head-unit level)        ✓     ·          ·
//    fuelPct                         ✓     ✓          ✓ (range warning)
//    rangeKm                         ✓     ✓          ✓
//    rangeFuelKm / rangeElectricKm   ·     ·          ✓ (hybrid)
//    fuelRateLph / consumption*      ✓     ·          TODO
//    batteryCapacityKwh / Lvl        ·     ✓ (VEM)    ✓ (hybrid warning)
//    carType / evConnectorTypes      ✓     ✓          ✓
//    coolantC / oilC / iatC          ✓     ·          TODO
//    transmissionC                   ✓     ·          TODO
//    ambientC                        ✓     ✓          ✓
//    baroKpa                         ✓     ✓          TODO
//    mapKpa / boostKpa               ✓     ·          TODO
//    lambda / afr                    ✓     ·          TODO
//    batteryV                        ✓     ·          TODO
//    ambientLux                      ✓     ·          ·
//    dimmerPct                       ✓     ·          ·
//    odometerKm / odometerTripKm     ✓     ✓          TODO
//    drivingStatus                   ✓     ✓          ·
//    gps.lat / lng / alt / heading   ✓     ✓          ✓
//    gps.speedMs / accuracyM         ✓     ✓          ✓
//    can { id, data, bus }           ✓     ·          ·
//    gnss (receiver state)           ✓     ·          ·
//
//
//  ADDING NEW FIELDS
//  ═════════════════
//
//  1. Add the field to `TelemetryPayload` with its unit in the doc comment.
//  2. Use it where the receiver lives in core, e.g.
//     `native/livi-helperd/bin/livi-core/src/cp_telemetry.rs` for CarPlay.
//  3. Update the routing overview.
//

/** Send the whole block on every fix, or only the fields the sensor delivers. */
export type GpsPayload = {
  /** Decimal degrees (WGS84). AA and CP need it. */
  lat?: number
  /** Decimal degrees (WGS84). AA and CP need it. */
  lng?: number
  /** Meters above sea level. */
  alt?: number
  /** Degrees, 0 = north, clockwise. */
  heading?: number
  /** AA prefers this over `speedKph`. */
  speedMs?: number
  accuracyM?: number
  satellites?: number
  /** Unix ms, defaults to ingest time. */
  fixTs?: number
}

/** No receiver uses it, it is for tooling and diagnostics. */
export type CanFrame = {
  id: number
  data: number[]
  bus?: number
}

export type TelemetryPayload = {
  /** Unix ms. LIVI fills it on ingest if absent. */
  ts?: number

  speedKph?: number
  rpm?: number
  /** Number for manual/DSG: -1=R, 0=N, 1..10=M1..M10.
   *  String for automatic: 'P' | 'R' | 'N' | 'D' | 'S' | 'M1'..'M10'. */
  gear?: number | string
  /** Negative = left. */
  steeringDeg?: number

  /** AA derives this from `gear` if the gear flag is sent. */
  reverse?: boolean
  /** Low beam. */
  lights?: boolean
  /** When `true`, AA head-light state goes to HIGH regardless of `lights`. */
  highBeam?: boolean
  hazards?: boolean
  turn?: 'none' | 'left' | 'right'
  parkingBrake?: boolean

  coolantC?: number
  oilC?: number
  /** Automatic-transmission oil. */
  transmissionC?: number
  /** Intake air. */
  iatC?: number
  /** AA also forwards this on its env channel. */
  ambientC?: number

  /** 12V battery. */
  batteryV?: number

  /** 0..100. For EVs the state of charge. */
  fuelPct?: number
  rangeKm?: number
  /** Hybrids only, the range on the tank. */
  rangeFuelKm?: number
  /** Hybrids only, the range on the battery. */
  rangeElectricKm?: number
  fuelRateLph?: number
  consumptionLPer100Km?: number
  consumptionAvgLPer100Km?: number

  /** Gross capacity. Turns on EV routing in AA, whatever `carType` says. */
  batteryCapacityKwh?: number
  /** Derived from `fuelPct × capacity` if absent. */
  batteryLevelKwh?: number
  /** A `CarType` name such as `'HybridDiesel'`. Written into the settings when it differs. */
  carType?: string
  /** `EvConnectorType` names such as `'Combo2'`. Written into the settings when they differ. */
  evConnectorTypes?: string[]

  /** Manifold absolute pressure. */
  mapKpa?: number
  /** AA forwards this on its env channel. */
  baroKpa?: number
  boostKpa?: number
  /** 1.0 = stoichiometric. */
  lambda?: number
  /** Air-fuel ratio. */
  afr?: number

  /** AA receives this with 0.1 km resolution. */
  odometerKm?: number
  odometerTripKm?: number
  /** AA driving-status restriction bitmask, passed through as is. 0 = unrestricted. */
  drivingStatus?: number

  ambientLux?: number

  /** Panel-illumination dimmer, 0-100. */
  dimmerPct?: number

  /** Wins over the ambient sensor for LIVI UI, AA and CP. */
  nightMode?: boolean

  /** A router path such as `/media` or `/settings/devices`. */
  path?: string

  /** Head-unit level, 0.0 to 1.0. Sets `huVolume`, which drives the amplifier and,
   *  when the link is on, the system mixer. */
  volume?: number

  gps?: GpsPayload

  /** A push replaces it whole. */
  gnss?: GnssInfo

  can?: CanFrame

  [key: string]: unknown
}
