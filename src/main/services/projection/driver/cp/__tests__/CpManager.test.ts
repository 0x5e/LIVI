import { EventEmitter } from 'node:events'
import type net from 'node:net'
import { applyPhoneUtcOffset } from '@main/services/time/hostTimezone'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CpManager } from '../CpManager'

const { createServerMock, createConnectionMock } = vi.hoisted(() => ({
  createServerMock: vi.fn(),
  createConnectionMock: vi.fn()
}))

vi.mock('@main/services/time/hostTimezone', () => ({ applyPhoneUtcOffset: vi.fn() }))

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>()
  return {
    ...actual,
    default: actual,
    createServer: createServerMock,
    createConnection: createConnectionMock
  }
})

type SessionLike = {
  getBtMac: () => string
  getControllerId: () => string | null
  close: () => Promise<void>
  on: (event: string, listener: (arg: Record<string, unknown>) => void) => void
  emit: (event: string, arg?: Record<string, unknown>) => boolean
}

type Priv = {
  _onHelperEvent: (ev: Record<string, unknown>) => void
  _sessions: Set<SessionLike>
  _helper: {
    subscribeEvents: (
      onEvent: (ev: Record<string, unknown>) => void,
      onConnect?: () => void
    ) => {
      close: () => void
    }
    sendLocation: (nmea: string) => Promise<void>
    sendVehicleStatus: (s: unknown) => Promise<void>
    setAaWireless: (b: boolean) => Promise<void>
    setCpWireless: (b: boolean) => Promise<void>
    dropIap2: () => Promise<void>
    startWired: (usbUdid: string) => Promise<void>
  }
  _spawn: (sock: unknown) => void
  _liveSession: SessionLike | null
  start: () => void
  close: () => Promise<void>
  dropSessions: () => void
  setHevcSupported: (b: boolean) => void
  setInitialNightMode: (b: boolean | undefined) => void
  setClusterStreamActive: (b: boolean) => void
  sendNightMode: (b: boolean) => void
  sendLocation: (nmea: string) => void
  sendVehicleStatus: (s: unknown) => void
  setAaWireless: (b: boolean) => void
  setCpWireless: (b: boolean) => void
}

type FakeServer = EventEmitter & {
  listen: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  address: ReturnType<typeof vi.fn>
}

function fakeServer(): FakeServer {
  const s = new EventEmitter() as FakeServer
  s.listen = vi.fn((_opts: unknown, cb?: () => void) => {
    cb?.()
    return s
  })
  s.close = vi.fn()
  s.address = vi.fn(() => ({ port: 51234 }))
  return s
}

function fakeControlSocket(): EventEmitter & Record<string, unknown> {
  const s = new EventEmitter() as EventEmitter & Record<string, unknown>
  s.setKeepAlive = vi.fn()
  s.write = vi.fn()
  s.destroy = vi.fn()
  s.remoteAddress = 'fe80::1'
  s.remotePort = 5000
  return s
}

let spawned: SessionLike[]
let presence: Record<string, unknown>[]

function makeManager(opts?: { onHelperConnect?: () => void }): { mgr: Priv; raw: CpManager } {
  spawned = []
  presence = []
  const raw = new CpManager({
    getConfig: () => ({}) as never,
    onSpawn: (s) => spawned.push(s as unknown as SessionLike),
    onHelperPresence: (p) => presence.push(p),
    onHelperConnect: opts?.onHelperConnect
  })
  return { mgr: raw as unknown as Priv, raw }
}

function sessionsFor(mgr: Priv, phoneId: string): SessionLike[] {
  const lower = phoneId.toLowerCase()
  return [...mgr._sessions].filter((s) => s.getBtMac().toLowerCase() === lower)
}

beforeEach(() => {
  createServerMock.mockReset()
  createConnectionMock.mockReset()
  createConnectionMock.mockImplementation(() => fakeControlSocket() as unknown as net.Socket)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('CpManager device time', () => {
  it('hands the phone UTC offset to the host zone without birthing a session', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'deviceTime', utcOffsetMinutes: 120, phoneId: '0C:6A' })
    expect(applyPhoneUtcOffset).toHaveBeenCalledWith(120)
    expect(mgr._sessions.size).toBe(0)
  })

  it('ignores a device time without an offset', () => {
    const { mgr } = makeManager()
    vi.mocked(applyPhoneUtcOffset).mockClear()
    mgr._onHelperEvent({ type: 'deviceTime' })
    expect(applyPhoneUtcOffset).not.toHaveBeenCalled()
  })
})

describe('CpManager session-at-identification', () => {
  it('births a session for a phoneId-tagged event that has no session yet', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: '0C:6A:C4:4E:F3:2A', title: 'X' })
    expect(sessionsFor(mgr, '0c:6a:c4:4e:f3:2a')).toHaveLength(1)
  })

  it('does not rebirth a session from the events that trail its close', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: '0c:6a', title: 'X' })
    const [s] = sessionsFor(mgr, '0c:6a')
    s.emit('disconnected')
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: '0c:6a', playing: 0 })
    expect(sessionsFor(mgr, '0c:6a')).toHaveLength(0)
    mgr._onHelperEvent({ type: 'device', btMac: '0C:6A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: '0c:6a', title: 'Y' })
    expect(sessionsFor(mgr, '0c:6a')).toHaveLength(1)
  })

  it('reuses the born session for further events of the same phone', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: '0c:6a', title: 'X' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: '0c:6a', elapsedMs: 1 })
    expect(sessionsFor(mgr, '0c:6a')).toHaveLength(1)
  })

  it('keeps different phones on different sessions', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    expect(sessionsFor(mgr, 'aa:aa')).toHaveLength(1)
    expect(sessionsFor(mgr, 'bb:bb')).toHaveLength(1)
  })

  it('drops an untagged event when several sessions exist instead of guessing', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    const ingests = [...mgr._sessions].map((s) => vi.spyOn(s, 'ingestHelperEvent'))

    mgr._onHelperEvent({ type: 'power', level: 40, charging: true })

    for (const spy of ingests) expect(spy).not.toHaveBeenCalled()
  })

  it('routes an untagged event to the sole session', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [only] = [...mgr._sessions]
    const spy = vi.spyOn(only, 'ingestHelperEvent')

    mgr._onHelperEvent({ type: 'power', level: 40 })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('adopts a carkit usbUdid onto the session born from the same phoneId', () => {
    const { mgr } = makeManager()
    const phoneId = '0c:6a:c4:4e:f3:2a'
    const serial = '00008110-000A1B2C3D4E5F00'
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'X' })
    const [session] = sessionsFor(mgr, phoneId)
    const adopted: Record<string, unknown>[] = []
    session?.on('device-presence', (p) => {
      if (p.kind === 'device') adopted.push(p)
    })
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    expect(sessionsFor(mgr, phoneId)).toHaveLength(1)
    expect(adopted.at(-1)?.usbUdid).toBe(serial)
    expect(adopted.at(-1)?.btMac).toBe(phoneId)
  })

  it('a session born while its phone is on the bus is wired and ends with the unplug', () => {
    const { mgr } = makeManager()
    const phoneId = '0c:6a:c4:4e:f3:2a'
    const serial = '00008110-000A1B2C3D4E5F00'
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'X' })
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    // The AirPlay side drops while iAP2 over USB lives on and keeps sending metadata.
    for (const old of sessionsFor(mgr, phoneId)) void old.close()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'Y' })
    const [born] = sessionsFor(mgr, phoneId)
    expect(born?.matchesIdentity({ usbUdid: serial })).toBe(true)

    mgr._onHelperEvent({ type: 'device-gone', src: 'carkit', usbUdid: serial })
    expect(sessionsFor(mgr, phoneId)).toHaveLength(0)
  })

  it('device-gone closes only the session matching that usbUdid', () => {
    const { mgr } = makeManager()
    const macA = 'aa:aa'
    const macB = 'bb:bb'
    const udidA = '00008110-000AAAAA'
    const udidB = '00008120-000BBBBB'
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: macA, title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: macB, title: 'B' })
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: macA, usbUdid: udidA })
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: macB, usbUdid: udidB })
    expect(sessionsFor(mgr, macA)).toHaveLength(1)
    expect(sessionsFor(mgr, macB)).toHaveLength(1)

    mgr._onHelperEvent({ type: 'device-gone', src: 'carkit', usbUdid: udidA })

    expect(sessionsFor(mgr, macA)).toHaveLength(0)
    expect(sessionsFor(mgr, macB)).toHaveLength(1)
  })

  it('a link that goes closes every session it carried', () => {
    const { mgr } = makeManager()
    const macA = 'aa:aa'
    const macB = 'bb:bb'
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: macA, title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: macB, title: 'B' })
    expect(sessionsFor(mgr, macA)).toHaveLength(1)
    expect(sessionsFor(mgr, macB)).toHaveLength(1)

    mgr._onHelperEvent({ type: 'link', up: true })
    expect(sessionsFor(mgr, macA)).toHaveLength(1)

    mgr._onHelperEvent({ type: 'link', up: false })

    expect(sessionsFor(mgr, macA)).toHaveLength(0)
    expect(sessionsFor(mgr, macB)).toHaveLength(0)
  })

  it('a link that goes leaves a session on the cable and what the cable reported', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: 'cc:cc', usbUdid: 'UDID-C' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'cc:cc', title: 'wired' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'wireless' })
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: 'dd:dd', usbUdid: 'UDID-D' })
    mgr._onHelperEvent({ type: 'device', src: 'bonjour', btMac: 'ee:ee', ip: '10.0.0.9' })

    mgr._onHelperEvent({ type: 'link', up: false })

    expect(sessionsFor(mgr, 'cc:cc')).toHaveLength(1)
    expect(sessionsFor(mgr, 'aa:aa')).toHaveLength(0)
    const pending = (mgr as unknown as { _pendingDevices: { usbUdid?: string }[] })._pendingDevices
    expect(pending.map((p) => p.usbUdid)).toEqual(['UDID-D'])
  })
})

describe('CpManager helper getter and seed fan-out', () => {
  it('exposes the shared helper', () => {
    const { raw } = makeManager()
    expect(raw.helper).toBeDefined()
  })

  it('fans codec / night / cluster seed out to every live session', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    const hevc = vi.spyOn(s as never, 'setHevcSupported')
    const night = vi.spyOn(s as never, 'setInitialNightMode')
    const cluster = vi.spyOn(s as never, 'setClusterStreamActive')
    const pushNight = vi.spyOn(s as never, 'sendNightMode')

    mgr.setHevcSupported(true)
    mgr.setInitialNightMode(true)
    mgr.setClusterStreamActive(false)
    mgr.sendNightMode(true)

    expect(hevc).toHaveBeenCalledWith(true)
    expect(night).toHaveBeenCalledWith(true)
    expect(cluster).toHaveBeenCalledWith(false)
    expect(pushNight).toHaveBeenCalledWith(true)
  })
})

describe('CpManager telemetry push', () => {
  it('forwards location and vehicle status to the helper, swallowing rejections', async () => {
    const { mgr } = makeManager()
    const loc = vi.spyOn(mgr._helper, 'sendLocation').mockRejectedValue(new Error('x'))
    const veh = vi.spyOn(mgr._helper, 'sendVehicleStatus').mockRejectedValue(new Error('x'))
    mgr.sendLocation('$GPGGA')
    mgr.sendVehicleStatus({ range: 100 })
    await Promise.resolve()
    expect(loc).toHaveBeenCalledWith('$GPGGA')
    expect(veh).toHaveBeenCalledWith({ range: 100 })
  })

  it('toggles the wireless profiles and warns on failure', async () => {
    const { mgr } = makeManager()
    const aa = vi.spyOn(mgr._helper, 'setAaWireless').mockRejectedValue(new Error('aa-fail'))
    const cp = vi.spyOn(mgr._helper, 'setCpWireless').mockRejectedValue(new Error('cp-fail'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mgr.setAaWireless(true)
    mgr.setCpWireless(false)
    await Promise.resolve()
    await Promise.resolve()
    expect(aa).toHaveBeenCalledWith(true)
    expect(cp).toHaveBeenCalledWith(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('setAaWireless failed'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('setCpWireless failed'))
  })

  it('resolves the happy path for the wireless toggles', async () => {
    const { mgr } = makeManager()
    vi.spyOn(mgr._helper, 'setAaWireless').mockResolvedValue(undefined)
    vi.spyOn(mgr._helper, 'setCpWireless').mockResolvedValue(undefined)
    expect(() => {
      mgr.setAaWireless(true)
      mgr.setCpWireless(true)
    }).not.toThrow()
    await Promise.resolve()
  })
})

describe('CpManager listener lifecycle', () => {
  it('starts the server and helper subscription once, on a port the system picks', async () => {
    const onHelperConnect = vi.fn()
    const { mgr } = makeManager({ onHelperConnect })
    const server = fakeServer()
    let connHandler: ((sock: net.Socket) => void) | undefined
    createServerMock.mockImplementation((handler: (sock: net.Socket) => void) => {
      connHandler = handler
      return server as unknown as net.Server
    })
    let capturedOnConnect: (() => void) | undefined
    let capturedOnEvent: ((ev: Record<string, unknown>) => void) | undefined
    const sub = { close: vi.fn() }
    vi.spyOn(mgr._helper, 'subscribeEvents').mockImplementation((onEvent, onConnect) => {
      capturedOnConnect = onConnect
      capturedOnEvent = onEvent
      return sub
    })

    const first = mgr.start()
    expect(mgr.start()).toBe(first)
    await expect(first).resolves.toBe(51234)
    expect(createServerMock).toHaveBeenCalledTimes(1)
    expect(server.listen).toHaveBeenCalledWith(
      expect.objectContaining({ port: 0, host: '::' }),
      expect.any(Function)
    )
    capturedOnConnect?.()
    capturedOnEvent?.({ type: 'wifi', mac: 'AA', ip: '1.2.3.4', event: 'joined' })
    expect(onHelperConnect).toHaveBeenCalled()
    expect(presence.at(-1)).toMatchObject({ kind: 'wifi' })
    server.emit('error', new Error('boom'))

    const sock = fakeControlSocket()
    connHandler?.(sock as unknown as net.Socket)
    expect(sock.setKeepAlive).toHaveBeenCalledWith(true, 3000)
    expect(spawned).toHaveLength(1)
  })

  it('has no port to give when the listener cannot open, and opens anew after close', async () => {
    const { mgr } = makeManager()
    const failing = fakeServer()
    failing.listen = vi.fn(() => failing)
    createServerMock.mockReturnValueOnce(failing as unknown as net.Server)
    vi.spyOn(mgr._helper, 'subscribeEvents').mockReturnValue({ close: vi.fn() })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const port = mgr.start()
    failing.emit('error', new Error('EACCES'))
    await expect(port).resolves.toBeUndefined()

    await mgr.close()
    createServerMock.mockReturnValueOnce(fakeServer() as unknown as net.Server)
    await expect(mgr.start()).resolves.toBe(51234)
  })

  it('closes the server, subscription and every session', async () => {
    const { mgr } = makeManager()
    const server = fakeServer()
    createServerMock.mockReturnValue(server as unknown as net.Server)
    const sub = { close: vi.fn() }
    let capturedOnConnect: (() => void) | undefined
    vi.spyOn(mgr._helper, 'subscribeEvents').mockImplementation((_onEvent, onConnect) => {
      capturedOnConnect = onConnect
      return sub
    })
    mgr.start()
    capturedOnConnect?.()

    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    const closeSpy = vi.spyOn(s as never, 'close').mockResolvedValue(undefined as never)

    await mgr.close()
    expect(sub.close).toHaveBeenCalled()
    expect(server.close).toHaveBeenCalled()
    expect(closeSpy).toHaveBeenCalled()
    expect(mgr._sessions.size).toBe(0)
  })

  it('warns when a session close throws and when the server close throws', async () => {
    const { mgr } = makeManager()
    const server = fakeServer()
    server.close = vi.fn(() => {
      throw new Error('already closed')
    })
    createServerMock.mockReturnValue(server as unknown as net.Server)
    vi.spyOn(mgr._helper, 'subscribeEvents').mockReturnValue({ close: vi.fn() })
    mgr.start()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    vi.spyOn(s as never, 'close').mockRejectedValue(new Error('close boom') as never)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await mgr.close()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('session close threw'))
  })

  it('close is safe before start', async () => {
    const { mgr } = makeManager()
    await expect(mgr.close()).resolves.toBeUndefined()
  })
})

describe('CpManager dropSessions', () => {
  it('closes every session while keeping the set for reconnects', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    const [a] = sessionsFor(mgr, 'aa:aa')
    const [b] = sessionsFor(mgr, 'bb:bb')
    const closeA = vi.spyOn(a as never, 'close').mockResolvedValue(undefined as never)
    const closeB = vi.spyOn(b as never, 'close').mockResolvedValue(undefined as never)
    const dropIap2 = vi.spyOn(mgr._helper, 'dropIap2').mockResolvedValue(undefined)

    mgr.dropSessions()

    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(dropIap2).toHaveBeenCalledTimes(1)
  })

  it('a helper that cannot drop the wired sessions does not break the drop', async () => {
    const { mgr } = makeManager()
    const dropIap2 = vi
      .spyOn(mgr._helper, 'dropIap2')
      .mockRejectedValue(new Error('helper is gone'))

    expect(() => mgr.dropSessions()).not.toThrow()
    await Promise.resolve()
    expect(dropIap2).toHaveBeenCalledTimes(1)
  })
})

describe('CpManager cable during a wireless session', () => {
  const phoneId = '0c:6a:c4:4e:f3:2a'
  const serial = '00008110-000A1B2C3D4E5F00'
  const cableIp = 'fe80::80a:a1ca'

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A wireless session that runs when the phone comes onto the bus, closing like the real one. */
  function plugIntoWireless(mgr: Priv): {
    wireless: SessionLike
    close: ReturnType<typeof vi.fn>
  } {
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'X' })
    const [wireless] = sessionsFor(mgr, phoneId)
    vi.spyOn(wireless as never, 'getControllerId').mockReturnValue('cid' as never)
    const close = vi.spyOn(wireless as never, 'close').mockImplementation((async () => {
      wireless?.emit('disconnected')
    }) as never) as unknown as ReturnType<typeof vi.fn>
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    return { wireless: wireless!, close }
  }

  function helperSpies(mgr: Priv): {
    startWired: ReturnType<typeof vi.fn>
    dropIap2: ReturnType<typeof vi.fn>
  } {
    return {
      startWired: vi.spyOn(mgr._helper, 'startWired').mockResolvedValue(undefined) as never,
      dropIap2: vi.spyOn(mgr._helper, 'dropIap2').mockResolvedValue(undefined) as never
    }
  }

  function cableSocket(): EventEmitter & Record<string, unknown> {
    const sock = fakeControlSocket()
    sock.localAddress = `${cableIp}%en7`
    return sock
  }

  it('ends the wireless session once the phone got the start over its cable', () => {
    const { mgr } = makeManager()
    const { close } = plugIntoWireless(mgr)
    helperSpies(mgr)
    expect(close).not.toHaveBeenCalled()

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp, phoneId })

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('starts the phone again after 500 ms, then every second', () => {
    const { mgr } = makeManager()
    plugIntoWireless(mgr)
    const { startWired, dropIap2 } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp, phoneId })
    vi.advanceTimersByTime(499)
    expect(startWired).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(startWired).toHaveBeenCalledWith(serial)
    vi.advanceTimersByTime(1000)
    expect(startWired).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000)

    expect(startWired).toHaveBeenCalledTimes(10)
    expect(dropIap2).not.toHaveBeenCalled()
  })

  it('carries on when the helper cannot start the phone again', async () => {
    const { mgr } = makeManager()
    plugIntoWireless(mgr)
    const startWired = vi.spyOn(mgr._helper, 'startWired').mockRejectedValue(new Error('gone'))

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp, phoneId })
    await vi.advanceTimersByTimeAsync(1500)

    expect(startWired).toHaveBeenCalledTimes(2)
  })

  it('stops starting once the phone connects over the cable, and counts that as wired', () => {
    const { mgr } = makeManager()
    plugIntoWireless(mgr)
    const { startWired } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp, phoneId })
    vi.advanceTimersByTime(1500)
    mgr._spawn(cableSocket())
    vi.advanceTimersByTime(10_000)

    expect(startWired).toHaveBeenCalledTimes(2)
    const wired = [...mgr._sessions].at(-1) as unknown as { isWiredMode: () => boolean }
    expect(wired.isWiredMode()).toBe(true)
  })

  it('a second wireless end starts the count afresh instead of adding a start', () => {
    const { mgr } = makeManager()
    const { wireless } = plugIntoWireless(mgr)
    const { startWired } = helperSpies(mgr)
    const priv = mgr as unknown as { _startAgain: (udid: string, attempt: number) => void }

    wireless.emit('disconnected')
    vi.advanceTimersByTime(400)
    priv._startAgain(serial, 1)
    vi.advanceTimersByTime(400)
    expect(startWired).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)

    expect(startWired).toHaveBeenCalledTimes(1)
  })

  it('forgets every pending start on close', async () => {
    const { mgr } = makeManager()
    plugIntoWireless(mgr)
    const { startWired } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp, phoneId })
    await mgr.close()
    vi.advanceTimersByTime(5000)

    expect(startWired).not.toHaveBeenCalled()
  })

  it('finds the wireless session by the cable alone and tells the air from the cable', () => {
    const { mgr } = makeManager()
    const { close } = plugIntoWireless(mgr)
    helperSpies(mgr)

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp })
    const air = fakeControlSocket()
    air.localAddress = 'fe80::99'
    mgr._spawn(air)

    expect(close).toHaveBeenCalledTimes(1)
    const over = [...mgr._sessions].at(-1) as unknown as { isWiredMode: () => boolean }
    expect(over.isWiredMode()).toBe(false)
  })

  it('has a phone whose dongle went hear the start over its cable', () => {
    const { mgr } = makeManager()
    const { close } = plugIntoWireless(mgr)
    const { startWired, dropIap2 } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'link', up: false })
    vi.advanceTimersByTime(500)

    expect(close).toHaveBeenCalled()
    expect(startWired).toHaveBeenCalledWith(serial)
    expect(dropIap2).not.toHaveBeenCalled()
  })

  it('touches no session for a start that names no cable or no address', () => {
    const { mgr } = makeManager()
    const { close } = plugIntoWireless(mgr)

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial })
    mgr._onHelperEvent({ type: 'wired-start', ip: cableIp })

    expect(close).not.toHaveBeenCalled()
  })

  it('ends nothing when the cable start comes for a phone without a wireless session', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'X' })
    const [session] = sessionsFor(mgr, phoneId)
    const close = vi.spyOn(session as never, 'close').mockResolvedValue(undefined as never)

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp, phoneId })

    expect(close).not.toHaveBeenCalled()
  })

  it('starts nothing again for a session that had no connection', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'X' })
    const [session] = sessionsFor(mgr, phoneId)
    const { startWired } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    session?.emit('disconnected')
    vi.advanceTimersByTime(5000)

    expect(startWired).not.toHaveBeenCalled()
  })

  it('starts nothing when the phone moved to the cable itself', () => {
    const { mgr } = makeManager()
    const { wireless } = plugIntoWireless(mgr)
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'Y' })
    const [wired] = sessionsFor(mgr, 'aa:aa')
    vi.spyOn(wired as never, 'getControllerId').mockReturnValue('cid' as never)
    vi.spyOn(wireless as never, 'close').mockResolvedValue(undefined as never)
    const { startWired } = helperSpies(mgr)

    wired?.emit('device-presence', { kind: 'active' })
    wireless.emit('disconnected')
    vi.advanceTimersByTime(5000)

    expect(startWired).not.toHaveBeenCalled()
  })

  it('keeps the wireless session when the cable comes out again', () => {
    const { mgr } = makeManager()
    const { wireless, close } = plugIntoWireless(mgr)
    close.mockResolvedValue(undefined)
    const { startWired } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'device-gone', src: 'carkit', usbUdid: serial })
    expect(close).not.toHaveBeenCalled()
    wireless.emit('disconnected')
    vi.advanceTimersByTime(5000)

    expect(startWired).not.toHaveBeenCalled()
  })

  it('forgets the cable address and the next start once the phone leaves the bus', () => {
    const { mgr } = makeManager()
    plugIntoWireless(mgr)
    const { startWired } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'wired-start', usbUdid: serial, ip: cableIp, phoneId })
    mgr._onHelperEvent({ type: 'device-gone', src: 'carkit', usbUdid: serial })
    vi.advanceTimersByTime(5000)
    mgr._spawn(cableSocket())

    expect(startWired).not.toHaveBeenCalled()
    const late = [...mgr._sessions].at(-1) as unknown as { isWiredMode: () => boolean }
    expect(late.isWiredMode()).toBe(false)
  })

  it('remembers no phone for a session that never learned one', () => {
    const { mgr } = makeManager()
    mgr._spawn(fakeControlSocket())
    const anon = [...mgr._sessions].at(-1)!

    anon.emit('disconnected')

    expect((mgr as unknown as { _gone: Set<string> })._gone.size).toBe(0)
    expect(mgr._sessions.has(anon)).toBe(false)
  })

  it('knows which phones are on the cable', () => {
    const { mgr, raw } = makeManager()
    expect(raw.isOnCable(phoneId)).toBe(false)

    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    expect(raw.isOnCable(phoneId.toUpperCase())).toBe(true)

    mgr._onHelperEvent({ type: 'device-gone', src: 'carkit', usbUdid: serial })
    expect(raw.isOnCable(phoneId)).toBe(false)
  })

  it('marks only the first sight of the phone on the bus', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'X' })
    const [session] = sessionsFor(mgr, phoneId)
    vi.spyOn(session as never, 'getControllerId').mockReturnValue('cid' as never)
    const { startWired } = helperSpies(mgr)

    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    session?.emit('disconnected')

    expect(startWired).not.toHaveBeenCalled()
  })
})

describe('CpManager registration lifecycle', () => {
  it('marks the connecting session live and supersedes an older connection of the same phone', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    const [keep] = sessionsFor(mgr, 'aa:aa')
    const [older] = sessionsFor(mgr, 'bb:bb')
    vi.spyOn(keep, 'getControllerId').mockReturnValue('cid-1')
    vi.spyOn(older, 'getControllerId').mockReturnValue('cid-1')
    const olderClose = vi.spyOn(older as never, 'close').mockResolvedValue(undefined as never)

    keep.emit('connected')
    expect(mgr._liveSession).toBe(keep)
    keep.emit('device-presence', { kind: 'active', ip: '10.0.0.2' })
    expect(olderClose).toHaveBeenCalled()
  })

  it('a device-presence that is not active never supersedes', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    vi.spyOn(s, 'getControllerId').mockReturnValue('cid-1')
    expect(() => s.emit('device-presence', { kind: 'device' })).not.toThrow()
  })

  it('supersede is a no-op without a controller id', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    expect(() => s.emit('device-presence', { kind: 'active' })).not.toThrow()
  })

  it('recomputes the live session when the live one disconnects', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    const [live] = sessionsFor(mgr, 'aa:aa')
    live.emit('connected')
    expect(mgr._liveSession).toBe(live)
    live.emit('disconnected')
    expect(mgr._sessions.has(live)).toBe(false)
    expect(mgr._liveSession).not.toBe(live)
  })

  it('clears the live session when the last session disconnects', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [live] = sessionsFor(mgr, 'aa:aa')
    live.emit('connected')
    live.emit('disconnected')
    expect(mgr._liveSession).toBeNull()
  })
})

describe('CpManager helper event routing', () => {
  it('maps a wifi join and leave into presence', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'wifi', mac: 'AA:11', ip: '10.0.0.5', event: 'joined' })
    mgr._onHelperEvent({ type: 'wifi', mac: 'AA:11', ip: '10.0.0.5', event: 'left' })
    expect(presence[0]).toMatchObject({ kind: 'wifi', connected: true })
    expect(presence[1]).toMatchObject({ kind: 'wifi', connected: false })
  })

  it('buffers a device seen before any session, then adopts it when the phone connects', () => {
    const { mgr } = makeManager()
    const btMac = 'aa:bb:cc'
    mgr._onHelperEvent({ type: 'device', btMac, ip: '10.0.0.9', name: 'iPhone' })
    expect(sessionsFor(mgr, btMac)).toHaveLength(0)
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: btMac, title: 'X' })
    expect(sessionsFor(mgr, btMac)).toHaveLength(1)
  })

  it('merges repeated pending device identities and ignores id-less devices', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', name: 'no ids here' })
    mgr._onHelperEvent({ type: 'device', btMac: 'aa:bb', name: 'first' })
    mgr._onHelperEvent({ type: 'device', btMac: 'AA:BB', usbUdid: 'UDID-1', name: 'second' })
    expect((mgr as unknown as { _pendingDevices: unknown[] })._pendingDevices).toHaveLength(1)
  })

  it('caps the pending device buffer at eight entries', () => {
    const { mgr } = makeManager()
    for (let i = 0; i < 12; i++) {
      mgr._onHelperEvent({ type: 'device', btMac: `mac-${i}` })
    }
    expect((mgr as unknown as { _pendingDevices: unknown[] })._pendingDevices).toHaveLength(8)
  })

  it('ignores device-gone without a usbUdid and prunes matching pending devices', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device-gone' })
    mgr._onHelperEvent({ type: 'device', btMac: 'aa:bb', usbUdid: 'UDID-9' })
    mgr._onHelperEvent({ type: 'device-gone', usbUdid: 'UDID-9' })
    expect((mgr as unknown as { _pendingDevices: unknown[] })._pendingDevices).toHaveLength(0)
  })

  it('routes a cid-tagged event to the session with that controller id', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    vi.spyOn(s, 'getControllerId').mockReturnValue('cid-7')
    const ingest = vi.spyOn(s as never, 'ingestHelperEvent')
    mgr._onHelperEvent({ type: 'nowplaying', cid: 'cid-7', title: 'By CID' })
    expect(ingest).toHaveBeenCalled()
  })

  it('routes an untagged event to the current live session', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    s.emit('connected')
    const ingest = vi.spyOn(s as never, 'ingestHelperEvent')
    mgr._onHelperEvent({ type: 'nowplaying', title: 'untagged' })
    expect(ingest).toHaveBeenCalled()
  })

  it('drops an untagged event when neither a live nor a sole session exists', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    const [a] = sessionsFor(mgr, 'aa:aa')
    const [b] = sessionsFor(mgr, 'bb:bb')
    const ia = vi.spyOn(a as never, 'ingestHelperEvent')
    const ib = vi.spyOn(b as never, 'ingestHelperEvent')
    mgr._onHelperEvent({ type: 'nowplaying', title: 'untagged' })
    expect(ia).not.toHaveBeenCalled()
    expect(ib).not.toHaveBeenCalled()
  })

  it('births a fresh session when a phoneId contradicts the fallback session', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [a] = sessionsFor(mgr, 'aa:aa')
    a.emit('connected')
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    expect(sessionsFor(mgr, 'bb:bb')).toHaveLength(1)
  })

  it('ignores an untagged event when no session exists at all', () => {
    const { mgr } = makeManager()
    expect(() => mgr._onHelperEvent({ type: 'nowplaying', title: 'orphan' })).not.toThrow()
    expect(mgr._sessions.size).toBe(0)
  })

  it('routes an untagged event to the sole session when none is live', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    const ingest = vi.spyOn(s as never, 'ingestHelperEvent')
    mgr._onHelperEvent({ type: 'nowplaying', title: 'untagged' })
    expect(ingest).toHaveBeenCalled()
  })
})

describe('CpManager branch completion', () => {
  it('supersede leaves sessions with a different controller id untouched', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'bb:bb', title: 'B' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'cc:cc', title: 'C' })
    const [keep] = sessionsFor(mgr, 'aa:aa')
    const [same] = sessionsFor(mgr, 'bb:bb')
    const [other] = sessionsFor(mgr, 'cc:cc')
    vi.spyOn(keep, 'getControllerId').mockReturnValue('cid-1')
    vi.spyOn(same, 'getControllerId').mockReturnValue('cid-1')
    vi.spyOn(other, 'getControllerId').mockReturnValue('cid-2')
    const sameClose = vi.spyOn(same as never, 'close').mockResolvedValue(undefined as never)
    const otherClose = vi.spyOn(other as never, 'close').mockResolvedValue(undefined as never)
    keep.emit('device-presence', { kind: 'active' })
    expect(sameClose).toHaveBeenCalled()
    expect(otherClose).not.toHaveBeenCalled()
  })

  it('device-gone keeps pending devices with a different usbUdid', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', btMac: 'aa:bb', usbUdid: 'UDID-KEEP' })
    mgr._onHelperEvent({ type: 'device', btMac: 'cc:dd', usbUdid: 'UDID-GONE' })
    mgr._onHelperEvent({ type: 'device-gone', usbUdid: 'UDID-GONE' })
    const pending = (mgr as unknown as { _pendingDevices: { usbUdid?: string }[] })._pendingDevices
    expect(pending).toHaveLength(1)
    expect(pending[0]?.usbUdid).toBe('UDID-KEEP')
  })

  it('merges pending devices keyed only by usbUdid', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', usbUdid: 'UDID-X', name: 'first' })
    mgr._onHelperEvent({ type: 'device', usbUdid: 'UDID-X', ip: '10.0.0.3' })
    const pending = (mgr as unknown as { _pendingDevices: unknown[] })._pendingDevices
    expect(pending).toHaveLength(1)
  })

  it('adopts only the pending devices that match the connecting session', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', btMac: 'aa:aa', usbUdid: 'UDID-A' })
    mgr._onHelperEvent({ type: 'device', btMac: 'zz:zz', usbUdid: 'UDID-Z' })
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const pending = (mgr as unknown as { _pendingDevices: { usbUdid?: string }[] })._pendingDevices
    expect(pending.map((d) => d.usbUdid)).toEqual(['UDID-Z'])
  })

  it('drains pending devices when a session announces its identity', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'nowplaying', phoneId: 'aa:aa', title: 'A' })
    const [s] = sessionsFor(mgr, 'aa:aa')
    mgr._onHelperEvent({ type: 'device', btMac: 'aa:aa', usbUdid: 'UDID-LATE' })
    const pendingBefore = (mgr as unknown as { _pendingDevices: unknown[] })._pendingDevices
    expect(pendingBefore.length).toBeGreaterThanOrEqual(0)
    s.emit('identity')
    expect((mgr as unknown as { _pendingDevices: unknown[] })._pendingDevices).toHaveLength(0)
  })
})

describe('CpManager phone leaving the access point', () => {
  const phoneId = '0c:6a:c4:4e:f3:2a'
  const wifiMac = '9a:c4:e2:44:5e:0f'
  const serial = '00008110-000A1B2C3D4E5F00'

  function onWifi(mgr: Priv): { session: SessionLike; close: ReturnType<typeof vi.fn> } {
    mgr._onHelperEvent({ type: 'nowplaying', phoneId, title: 'X' })
    const [session] = sessionsFor(mgr, phoneId)
    vi.spyOn(session as never, 'matchesIdentity').mockImplementation(
      ((ids: { btMac?: string; wifiMac?: string }) =>
        ids.wifiMac === wifiMac || ids.btMac?.toLowerCase() === phoneId) as never
    )
    const close = vi.fn(async () => {})
    vi.spyOn(session as never, 'close').mockImplementation(close as never)
    return { session: session!, close }
  }

  it('ends its session at once', () => {
    const { mgr } = makeManager()
    const { close } = onWifi(mgr)

    mgr._onHelperEvent({ type: 'wifi', mac: wifiMac, event: 'left' })

    expect(close).toHaveBeenCalled()
  })

  it('leaves the session alone when the phone joins or another one leaves', () => {
    const { mgr } = makeManager()
    const { close } = onWifi(mgr)

    mgr._onHelperEvent({ type: 'wifi', mac: wifiMac, event: 'joined' })
    mgr._onHelperEvent({ type: 'wifi', mac: 'aa:bb:cc:dd:ee:ff', event: 'left' })
    mgr._onHelperEvent({ type: 'wifi', event: 'left' })

    expect(close).not.toHaveBeenCalled()
  })

  it('keeps a session that runs over the cable', () => {
    const { mgr } = makeManager()
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })
    const { close } = onWifi(mgr)

    mgr._onHelperEvent({ type: 'wifi', mac: wifiMac, event: 'left' })

    expect(close).not.toHaveBeenCalled()
  })

  it('ends a wireless session even with the cable in', () => {
    const { mgr } = makeManager()
    const { session, close } = onWifi(mgr)
    vi.spyOn(session as never, 'getControllerId').mockReturnValue('cid' as never)
    mgr._onHelperEvent({ type: 'device', src: 'carkit', btMac: phoneId, usbUdid: serial })

    mgr._onHelperEvent({ type: 'wifi', mac: wifiMac, event: 'left' })

    expect(close).toHaveBeenCalled()
  })
})
