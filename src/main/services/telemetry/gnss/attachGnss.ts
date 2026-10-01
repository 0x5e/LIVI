// Owns the GNSS receiver lifecycle and routes fix, receiver state, file and clock.

import { configEvents } from '@main/ipc/utils'
import type { Config } from '@shared/types'
import type { GnssInfo } from '@shared/types/Gnss'
import { EMPTY_GNSS_INFO } from '@shared/types/Gnss'
import type { GpsPayload } from '@shared/types/Telemetry'
import { applyTimezone, noteGpsZone, zoneForPosition } from '../../time/hostTimezone'
import type { TelemetryStore } from '../TelemetryStore'
import { GnssReceiver } from './GnssReceiver'
import { GpsFileWriter } from './GpsFileWriter'
import { GnssClock } from './gnssClock'

export type AttachGnssDeps = {
  store: TelemetryStore
  initialConfig?: Config
  createReceiver?: (
    device: string,
    baudRate: number,
    publishFix: (gps: GpsPayload) => void
  ) => GnssReceiver
  createFileWriter?: () => GpsFileWriter
  createClock?: () => GnssClock
}

export type GnssHandle = {
  info: () => GnssInfo
  applyConfig: (config: Config) => void
  dispose: () => void
}

export function attachGnss({
  store,
  initialConfig,
  createReceiver,
  createFileWriter,
  createClock
}: AttachGnssDeps): GnssHandle {
  const fileWriter = createFileWriter ? createFileWriter() : new GpsFileWriter()
  const clock = createClock ? createClock() : new GnssClock()

  let receiver: GnssReceiver | null = null
  let lastInfo: GnssInfo = EMPTY_GNSS_INFO
  let device = ''
  let baudRate = 0
  let timezone: string | undefined
  let zoneKey = ''

  const publishFix = (gps: GpsPayload): void => {
    // Re-resolve only when the position moved far enough to change zone
    if (gps.lat !== undefined && gps.lng !== undefined) {
      const key = `${gps.lat.toFixed(2)},${gps.lng.toFixed(2)}`
      if (key !== zoneKey) {
        zoneKey = key
        const zone = zoneForPosition(gps.lat, gps.lng)
        if (zone) {
          noteGpsZone(zone)
          applyTimezone(zone)
          if (zone !== timezone) {
            timezone = zone
            // Remembered so the next boot reads right before a fix comes back
            configEvents.emit('requestSave', { timezone: zone } satisfies Partial<Config>)
          }
        }
      }
    }
    store.merge({ gps })
    fileWriter.setFix(gps)
  }

  const onInfo = (raw: GnssInfo): void => {
    const info = timezone ? { ...raw, timezone } : raw
    lastInfo = info
    store.merge({ gnss: info })
    fileWriter.setInfo(info)
    clock.update(info)
  }

  const stopReceiver = (): void => {
    if (!receiver) return
    receiver.off('info', onInfo)
    receiver.stop()
    receiver = null
    clock.release()
    onInfo({ ...EMPTY_GNSS_INFO, device, baudRate })
  }

  const applyConfig = (config: Config): void => {
    if (config.gpsEnabled !== true) {
      stopReceiver()
      return
    }
    const nextDevice = config.gpsDevice || '/dev/ttyAMA0'
    const nextBaud = Number(config.gpsBaudRate) || 38400
    if (receiver && nextDevice === device && nextBaud === baudRate) return

    stopReceiver()
    device = nextDevice
    baudRate = nextBaud
    receiver = createReceiver
      ? createReceiver(device, baudRate, publishFix)
      : new GnssReceiver({ device, baudRate, publishFix })
    receiver.on('info', onInfo)
    receiver.start()
  }

  if (initialConfig) {
    // The stored zone stands until GPS proves otherwise
    if (initialConfig.timezone) {
      timezone = initialConfig.timezone
      applyTimezone(initialConfig.timezone)
    }
    applyConfig(initialConfig)
  }

  return {
    info: () => lastInfo,
    applyConfig,
    dispose: () => {
      stopReceiver()
      fileWriter.flushNow()
      fileWriter.dispose()
    }
  }
}
