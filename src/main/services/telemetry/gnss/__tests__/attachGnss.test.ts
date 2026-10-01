import { EventEmitter } from 'node:events'
import { configEvents } from '@main/ipc/utils'
import type { Config } from '@shared/types'
import type { GnssInfo } from '@shared/types/Gnss'
import { EMPTY_GNSS_INFO } from '@shared/types/Gnss'
import { applyTimezone, noteGpsZone } from '../../../time/hostTimezone'
import { attachGnss } from '../attachGnss'
import type { GnssReceiver } from '../GnssReceiver'
import type { GpsFileWriter } from '../GpsFileWriter'
import type { GnssClock } from '../gnssClock'

vi.mock('../../../time/hostTimezone', async (orig) => ({
  ...(await orig<typeof import('../../../time/hostTimezone')>()),
  applyTimezone: vi.fn(),
  noteGpsZone: vi.fn()
}))

class FakeReceiver extends EventEmitter {
  start = vi.fn()
  stop = vi.fn()
}

function setup(over: Partial<Config> = {}) {
  const store = { merge: vi.fn() }
  const fileWriter = { setInfo: vi.fn(), setFix: vi.fn(), flushNow: vi.fn(), dispose: vi.fn() }
  const clock = { update: vi.fn(), release: vi.fn() }
  const created: { device: string; baudRate: number; receiver: FakeReceiver }[] = []
  let publishFix: (gps: { lat: number; lng: number }) => void = () => {}

  const handle = attachGnss({
    store: store as never,
    initialConfig: {
      gpsEnabled: true,
      gpsDevice: '/dev/ttyAMA0',
      gpsBaudRate: 38400,
      ...over
    } as Config,
    createReceiver: (device, baudRate, publish) => {
      const receiver = new FakeReceiver()
      created.push({ device, baudRate, receiver })
      publishFix = publish as typeof publishFix
      return receiver as unknown as GnssReceiver
    },
    createFileWriter: () => fileWriter as unknown as GpsFileWriter,
    createClock: () => clock as unknown as GnssClock
  })

  return { handle, store, fileWriter, clock, created, publish: () => publishFix }
}

const INFO: GnssInfo = { ...EMPTY_GNSS_INFO, connected: true, satellitesUsed: 6 }

describe('attachGnss', () => {
  beforeEach(() => vi.clearAllMocks())

  test('starts a receiver for the configured device', () => {
    const { created } = setup()
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ device: '/dev/ttyAMA0', baudRate: 38400 })
    expect(created[0].receiver.start).toHaveBeenCalled()
  })

  test('starts nothing while GPS is disabled', () => {
    const { created } = setup({ gpsEnabled: false })
    expect(created).toEqual([])
  })

  test('falls back to the default device and baud rate', () => {
    const { created } = setup({ gpsDevice: '', gpsBaudRate: 0 })
    expect(created[0]).toMatchObject({ device: '/dev/ttyAMA0', baudRate: 38400 })
  })

  test('routes a fix into the store and the json file', () => {
    const { store, fileWriter, publish } = setup()
    publish()({ lat: 48, lng: 11 })
    expect(store.merge).toHaveBeenCalledWith({ gps: { lat: 48, lng: 11 } })
    expect(fileWriter.setFix).toHaveBeenCalledWith({ lat: 48, lng: 11 })
  })

  test('routes receiver state into the store, the file and the clock', () => {
    const { store, fileWriter, clock, created } = setup()
    created[0].receiver.emit('info', INFO)
    expect(store.merge).toHaveBeenCalledWith({ gnss: INFO })
    expect(fileWriter.setInfo).toHaveBeenCalledWith(INFO)
    expect(clock.update).toHaveBeenCalledWith(INFO)
  })

  test('exposes the last info for a snapshot read', () => {
    const { handle, created } = setup()
    created[0].receiver.emit('info', INFO)
    expect(handle.info()).toEqual(INFO)
  })

  test('leaves a running receiver alone when nothing relevant changed', () => {
    const { handle, created } = setup()
    handle.applyConfig({
      gpsEnabled: true,
      gpsDevice: '/dev/ttyAMA0',
      gpsBaudRate: 38400
    } as Config)
    expect(created).toHaveLength(1)
    expect(created[0].receiver.stop).not.toHaveBeenCalled()
  })

  test('reopens on a device change', () => {
    const { handle, created } = setup()
    handle.applyConfig({
      gpsEnabled: true,
      gpsDevice: '/dev/ttyUSB0',
      gpsBaudRate: 38400
    } as Config)
    expect(created).toHaveLength(2)
    expect(created[0].receiver.stop).toHaveBeenCalled()
    expect(created[1].device).toBe('/dev/ttyUSB0')
  })

  test('reopens on a baud rate change', () => {
    const { handle, created } = setup()
    handle.applyConfig({ gpsEnabled: true, gpsDevice: '/dev/ttyAMA0', gpsBaudRate: 9600 } as Config)
    expect(created).toHaveLength(2)
    expect(created[1].baudRate).toBe(9600)
  })

  test('turning GPS off stops the receiver and releases the clock', () => {
    const { handle, created, clock, store } = setup()
    handle.applyConfig({ gpsEnabled: false } as Config)
    expect(created[0].receiver.stop).toHaveBeenCalled()
    expect(clock.release).toHaveBeenCalled()
    expect(store.merge).toHaveBeenLastCalledWith({
      gnss: expect.objectContaining({ connected: false })
    })
  })

  test('turning GPS off twice does not stop twice', () => {
    const { handle, created } = setup()
    handle.applyConfig({ gpsEnabled: false } as Config)
    handle.applyConfig({ gpsEnabled: false } as Config)
    expect(created[0].receiver.stop).toHaveBeenCalledTimes(1)
  })

  test('a stopped receiver no longer reaches the store', () => {
    const { handle, created, store } = setup()
    handle.applyConfig({ gpsEnabled: false } as Config)
    store.merge.mockClear()
    created[0].receiver.emit('info', INFO)
    expect(store.merge).not.toHaveBeenCalled()
  })

  test('dispose stops the receiver and flushes the file', () => {
    const { handle, created, fileWriter } = setup()
    handle.dispose()
    expect(created[0].receiver.stop).toHaveBeenCalled()
    expect(fileWriter.flushNow).toHaveBeenCalled()
    expect(fileWriter.dispose).toHaveBeenCalled()
  })

  test('works without an initial config', () => {
    const store = { merge: vi.fn() }
    const handle = attachGnss({
      store: store as never,
      createFileWriter: () =>
        ({ setInfo: vi.fn(), setFix: vi.fn(), flushNow: vi.fn(), dispose: vi.fn() }) as never,
      createClock: () => ({ update: vi.fn(), release: vi.fn() }) as never
    })
    expect(handle.info()).toEqual(EMPTY_GNSS_INFO)
    handle.dispose()
  })
})

describe('attachGnss — timezone from position', () => {
  beforeEach(() => vi.clearAllMocks())

  test('derives the zone from the fix and puts it in the receiver state', () => {
    const { store, created, publish } = setup()
    publish()({ lat: 53.3536, lng: 10.5633 })
    created[0].receiver.emit('info', INFO)
    expect(store.merge).toHaveBeenLastCalledWith({
      gnss: expect.objectContaining({ timezone: 'Europe/Berlin' })
    })
  })

  test('follows the receiver across a zone boundary', () => {
    const { store, created, publish } = setup()
    publish()({ lat: 53.3536, lng: 10.5633 })
    publish()({ lat: 22.5726, lng: 88.3639 })
    created[0].receiver.emit('info', INFO)
    expect(store.merge).toHaveBeenLastCalledWith({
      gnss: expect.objectContaining({ timezone: 'Asia/Kolkata' })
    })
  })

  test('reports no zone before a fix arrives', () => {
    const { store, created } = setup()
    created[0].receiver.emit('info', INFO)
    expect(store.merge).toHaveBeenLastCalledWith({ gnss: INFO })
  })
})

describe('attachGnss — timezone edge cases', () => {
  beforeEach(() => vi.clearAllMocks())

  test('a fix without a position leaves the zone alone', () => {
    const { store, created, publish } = setup()
    publish()({ lat: 53.3536, lng: 10.5633 })
    publish()({ alt: 12 } as never)
    created[0].receiver.emit('info', INFO)
    expect(store.merge).toHaveBeenLastCalledWith({
      gnss: expect.objectContaining({ timezone: 'Europe/Berlin' })
    })
  })

  test('a position that barely moved is not resolved again', () => {
    const { created, publish } = setup()
    publish()({ lat: 53.3536, lng: 10.5633 })
    publish()({ lat: 53.3537, lng: 10.5634 })
    created[0].receiver.emit('info', INFO)
    // Same rounded key, so the second fix reused the first result
    expect(created).toHaveLength(1)
  })

  test('builds a real receiver when none is injected', () => {
    const store = { merge: vi.fn() }
    const handle = attachGnss({
      store: store as never,
      initialConfig: { gpsEnabled: true, gpsDevice: '/dev/null', gpsBaudRate: 9600 } as Config,
      createFileWriter: () =>
        ({ setInfo: vi.fn(), setFix: vi.fn(), flushNow: vi.fn(), dispose: vi.fn() }) as never,
      createClock: () => ({ update: vi.fn(), release: vi.fn() }) as never
    })
    expect(handle.info()).toBeTruthy()
    handle.dispose()
  })

  test('leaves the zone unset for a position outside the map', () => {
    const { store, created, publish } = setup()
    publish()({ lat: 999, lng: 999 })
    created[0].receiver.emit('info', INFO)
    expect(store.merge).toHaveBeenLastCalledWith({ gnss: INFO })
  })

  test('applies the resolved zone to the host and claims it over the phone', () => {
    const { publish } = setup()
    publish()({ lat: 53.3536, lng: 10.5633 })
    expect(applyTimezone).toHaveBeenCalledWith('Europe/Berlin')
    expect(noteGpsZone).toHaveBeenCalledWith('Europe/Berlin')
  })

  test('applies the zone on every fix that moved, so a zone the phone set gives way', () => {
    const { publish } = setup({ timezone: 'Europe/Berlin' } as never)
    vi.mocked(applyTimezone).mockClear()
    publish()({ lat: 53.3536, lng: 10.5633 })
    publish()({ lat: 52.52, lng: 13.405 })
    expect(applyTimezone).toHaveBeenCalledTimes(2)
    expect(applyTimezone).toHaveBeenLastCalledWith('Europe/Berlin')
  })

  test('saves again only when the zone actually changes', () => {
    const save = vi.fn()
    configEvents.on('requestSave', save)
    const { publish } = setup()
    publish()({ lat: 53.3536, lng: 10.5633 })
    publish()({ lat: 52.52, lng: 13.405 })
    expect(save).toHaveBeenCalledTimes(1)
    publish()({ lat: 22.5726, lng: 88.3639 })
    expect(save).toHaveBeenLastCalledWith({ timezone: 'Asia/Kolkata' })
    configEvents.off('requestSave', save)
  })

  test('does not apply anything for a position outside the map', () => {
    const { publish } = setup()
    publish()({ lat: 999, lng: 999 })
    expect(applyTimezone).not.toHaveBeenCalled()
    expect(noteGpsZone).not.toHaveBeenCalled()
  })

  test('applies the stored zone at startup, before any fix', () => {
    setup({ timezone: 'Asia/Kolkata' } as never)
    expect(applyTimezone).toHaveBeenCalledWith('Asia/Kolkata')
  })

  test('remembers a newly resolved zone in the config', () => {
    const save = vi.fn()
    configEvents.on('requestSave', save)
    const { publish } = setup()
    publish()({ lat: 53.3536, lng: 10.5633 })
    expect(save).toHaveBeenCalledWith({ timezone: 'Europe/Berlin' })
    configEvents.off('requestSave', save)
  })

  test('does not rewrite the config when the zone is unchanged', () => {
    const save = vi.fn()
    configEvents.on('requestSave', save)
    const { publish } = setup({ timezone: 'Europe/Berlin' } as never)
    publish()({ lat: 53.3536, lng: 10.5633 })
    expect(save).not.toHaveBeenCalled()
    configEvents.off('requestSave', save)
  })

  test('keeps the stored zone when a position resolves to nothing', () => {
    const { store, created, publish } = setup({ timezone: 'Europe/Berlin' } as never)
    publish()({ lat: 999, lng: 999 })
    created[0].receiver.emit('info', INFO)
    expect(store.merge).toHaveBeenLastCalledWith({
      gnss: expect.objectContaining({ timezone: 'Europe/Berlin' })
    })
  })
})
