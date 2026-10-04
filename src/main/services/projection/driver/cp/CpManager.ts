/**
 * CpManager — shared Apple CarPlay infrastructure (singleton).
 *
 * Owns the single RTSP control listener, the shared MFi signer + BlueZ
 * control socket (CpHelperSock), and the one helper event subscription. Every
 * accepted control connection spawns ONE CpSession handed off via onSpawn. Holds
 * the codec / night-mode / cluster seed applied to each new CpSession, drives the
 * cross-connection transport handover (supersede), and routes the helper's
 * per-phone iAP2 metadata to the CpSession it belongs to.
 */

import * as net from 'node:net'
import { applyPhoneUtcOffset } from '@main/services/time/hostTimezone'
import type { Config } from '@shared/types'
import { CpHelperSock } from './CpHelperSock'
import { CpSession, type CpSessionSeed, normHost } from './CpSession'

/** When a phone whose wireless session made room hears the start over its cable again. */
const RESTART_FIRST_MS = 500
const RESTART_EVERY_MS = 1000
const RESTART_TRIES = 10

/** A registry-level identity seen on a helper wifi/device event, awaiting its session. */
interface PendingDevice {
  btMac?: string
  wifiMac?: string
  ip?: string
  usbUdid?: string
  name?: string
}

export interface CpManagerOptions {
  getConfig: () => Config
  onSpawn: (session: CpSession) => void
  onHelperPresence: (presence: Record<string, unknown>) => void
  onHelperConnect?: () => void
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export class CpManager {
  private _server: net.Server | null = null
  private _listening: Promise<number | undefined> | null = null
  private readonly _helper = new CpHelperSock()
  private _eventSub: { close: () => void } | null = null
  private readonly _sessions = new Set<CpSession>()
  /** The CarPlay session that owns the helper's single iAP2 metadata feed. */
  private _liveSession: CpSession | null = null
  /** Recent identity-bearing helper events buffered until their session connects. */
  private readonly _pendingDevices: PendingDevice[] = []
  /** btMac → usbUdid of the phones on the bus. */
  private readonly _wired = new Map<string, string>()
  /** Phones whose wireless session ended: their last events must not create a new one. */
  private readonly _gone = new Set<string>()
  /** Wireless sessions whose phone was plugged in while they ran.*/
  private readonly _cabled = new WeakSet<CpSession>()
  /** usbUdid → the address of ours the phone was told to reach over its cable. */
  private readonly _cableAddrs = new Map<string, string>()
  /** usbUdid → the next start, for a phone that has yet to connect over its cable. */
  private readonly _toCable = new Map<string, ReturnType<typeof setTimeout>>()

  private _hevcSupported = false
  private _initialNightMode: boolean | undefined = undefined
  private _clusterStreamActive = true

  private readonly _getConfig: () => Config
  private readonly _onSpawn: (session: CpSession) => void
  private readonly _onHelperPresence: (presence: Record<string, unknown>) => void
  private readonly _onHelperConnect: (() => void) | undefined

  constructor(opts: CpManagerOptions) {
    this._getConfig = opts.getConfig
    this._onSpawn = opts.onSpawn
    this._onHelperPresence = opts.onHelperPresence
    this._onHelperConnect = opts.onHelperConnect
  }

  /** The shared MFi signer + BlueZ control socket. */
  get helper(): CpHelperSock {
    return this._helper
  }

  // ── Codec / night / cluster seed (fans out to every live session) ──────────

  setHevcSupported(supported: boolean): void {
    this._hevcSupported = supported
    for (const s of this._sessions) s.setHevcSupported(supported)
  }

  setInitialNightMode(value: boolean | undefined): void {
    this._initialNightMode = value
    for (const s of this._sessions) s.setInitialNightMode(value)
  }

  setClusterStreamActive(active: boolean): void {
    this._clusterStreamActive = active
    for (const s of this._sessions) s.setClusterStreamActive(active)
  }

  /** Drop every session; the listener stays up and the phones reconnect. A wireless phone is
   *  paged again, a wired one only offers CarPlay again on a fresh iAP2 session. */
  dropSessions(): void {
    for (const s of [...this._sessions]) void s.close()
    this._helper.dropIap2().catch(() => {})
  }

  // ── Telemetry push (manager-level: shared hardware / whole subsystem) ───────

  sendNightMode(night: boolean): void {
    for (const s of this._sessions) s.sendNightMode(night)
  }

  sendLocation(nmea: string): void {
    this._helper.sendLocation(nmea).catch(() => {})
  }

  sendVehicleStatus(status: {
    range?: number
    outsideTemperature?: number
    rangeWarning?: boolean
  }): void {
    this._helper.sendVehicleStatus(status).catch(() => {})
  }

  /** Toggle the wireless AA BT profile in the running helper. */
  setAaWireless(enabled: boolean): void {
    this._helper.setAaWireless(enabled).catch((e: Error) => {
      console.warn(`[CpManager] setAaWireless failed: ${e.message}`)
    })
  }

  /** Toggle the wireless CarPlay iAP2 BT profile in the running helper. */
  setCpWireless(enabled: boolean): void {
    this._helper.setCpWireless(enabled).catch((e: Error) => {
      console.warn(`[CpManager] setCpWireless failed: ${e.message}`)
    })
  }

  private _seed(): CpSessionSeed {
    return {
      hevcSupported: this._hevcSupported,
      initialNightMode: this._initialNightMode,
      clusterStreamActive: this._clusterStreamActive
    }
  }

  // ── control listener ───────────────────────────────────────────────────────

  /**
   * Opens the control listener and resolves with its port, undefined if it could not open.
   * The phone learns the port from the helper, so the system may pick any free one: a fixed
   * port collides with whatever else wants it, such as the AirPlay receiver on macOS.
   */
  start(): Promise<number | undefined> {
    if (this._listening) return this._listening
    const server = net.createServer((sock) => this._spawn(sock))
    this._listening = new Promise((resolve) => {
      server.on('error', (err) => {
        console.warn(`[CpManager] server error: ${err.message}`)
        resolve(undefined)
      })
      // CarPlay wireless is IPv6-first (link-local); listen dual-stack so the
      // phone can reach it over IPv6 or IPv4.
      server.listen({ port: 0, host: '::', ipv6Only: false }, () => {
        const { port } = server.address() as net.AddressInfo
        console.log(`[CpManager] listening on :${port} (dual-stack)`)
        resolve(port)
      })
    })
    this._server = server
    this._eventSub = this._helper.subscribeEvents(
      (ev) => this._onHelperEvent(ev),
      () => this._onHelperConnect?.()
    )
    return this._listening
  }

  async close(): Promise<void> {
    this._eventSub?.close()
    this._eventSub = null
    this._listening = null
    if (this._server) {
      try {
        this._server.close()
      } catch {
        /* already closed */
      }
      this._server = null
    }
    const sessions = [...this._sessions]
    this._sessions.clear()
    this._liveSession = null
    this._pendingDevices.length = 0
    this._wired.clear()
    this._cableAddrs.clear()
    for (const t of this._toCable.values()) clearTimeout(t)
    this._toCable.clear()
    await Promise.all(
      sessions.map((s) =>
        s
          .close()
          .catch((e) =>
            console.warn(`[CpManager] session close threw on close: ${(e as Error).message}`)
          )
      )
    )
  }

  private _spawn(sock: net.Socket): void {
    const peer = `${sock.remoteAddress}:${sock.remotePort}`
    console.log(`[CpManager] control connection from ${peer}`)
    sock.setKeepAlive(true, 3000)
    const udid = this._cableUdid(sock.localAddress ?? '')
    if (udid) this._cameOver(udid)
    this._register(
      new CpSession({
        socket: sock,
        getConfig: this._getConfig,
        helper: this._helper,
        seed: this._seed(),
        isCable: (ip) => this._cableUdid(ip) !== undefined
      })
    )
  }

  private _cableUdid(addr: string): string | undefined {
    const ip = normHost(addr)
    for (const [udid, a] of this._cableAddrs) if (a === ip) return udid
    return undefined
  }

  /** Whether the phone runs iAP2 over the cable. */
  isOnCable(btMac: string): boolean {
    return this._wired.has(btMac.toLowerCase())
  }

  /** A session of a phone on the cable ended. The phone ignores a start that came while its
   *  wireless session ran, so it hears it again. */
  private _endedOnCable(session: CpSession, usbUdid: string): void {
    if (this._cabled.delete(session)) this._startAgain(usbUdid, 1)
  }

  /** Right after its wireless session the phone drops a start without a word, so it goes again
   *  until the phone connects over the cable. */
  private _startAgain(usbUdid: string, attempt: number): void {
    clearTimeout(this._toCable.get(usbUdid))
    this._toCable.set(
      usbUdid,
      setTimeout(
        () => {
          console.log(`[CpManager] ${usbUdid} hears the start again (${attempt}/${RESTART_TRIES})`)
          this._helper.startWired(usbUdid).catch(() => {})
          if (attempt < RESTART_TRIES) this._startAgain(usbUdid, attempt + 1)
          else this._toCable.delete(usbUdid)
        },
        attempt === 1 ? RESTART_FIRST_MS : RESTART_EVERY_MS
      )
    )
  }

  private _cameOver(usbUdid: string): void {
    clearTimeout(this._toCable.get(usbUdid))
    this._toCable.delete(usbUdid)
  }

  /** Wire a CpSession into the shared infra (identity adoption, supersede, teardown) and
   *  hand it to the driver layer. Shared by the AirPlay-socket spawn and the metadata-only
   *  session born at iAP2 identification. */
  private _register(session: CpSession): void {
    this._sessions.add(session)
    session.on('connected', () => {
      this._liveSession = session
    })
    session.on('device-presence', (p: Record<string, unknown>) => {
      // A session reaching RECORD (kind 'active') supersedes an earlier connection
      // of the SAME phone (BT → Wi-Fi handover), keyed by pair-verify controllerId.
      if (p?.kind === 'active') this._supersede(session)
    })
    session.on('identity', () => this._adoptPending(session))
    session.once('disconnected', () => {
      const mac = session.getBtMac().toLowerCase()
      const usbUdid = this._wired.get(mac)
      if (usbUdid) this._endedOnCable(session, usbUdid)
      else if (mac) this._gone.add(mac)
      this._sessions.delete(session)
      if (this._liveSession === session) {
        this._liveSession = [...this._sessions].at(-1) ?? null
      }
    })
    this._onSpawn(session)
  }

  /** Born at iAP2 identification: a socket-less CpSession so the phone's metadata has a
   *  session target from event #1. The AirPlay transport adopts it at pair-verify. */
  private _createMetaSession(phoneId: string): CpSession {
    const session = new CpSession({
      getConfig: this._getConfig,
      helper: this._helper,
      seed: this._seed()
    })
    this._register(session)
    session.adoptHelperDevice({ btMac: phoneId, usbUdid: this._wired.get(phoneId.toLowerCase()) })
    // Drain a carkit usbUdid buffered before this session existed, so a later unplug can target it.
    this._adoptPending(session)
    return session
  }

  private _supersede(keep: CpSession): void {
    const id = keep.getControllerId()
    if (!id) return
    for (const other of [...this._sessions]) {
      if (other === keep) continue
      if (other.getControllerId() === id) {
        console.log('[CpManager] transport handover: dropping the superseded connection')
        this._cabled.delete(other)
        void other.close()
      }
    }
  }

  /** A phone that left the access point ended CarPlay over Wi-Fi itself, so its session ends now
   *  rather than when the connection times out. One running over the cable stays. */
  private _leftWifi(wifiMac: string): void {
    for (const s of [...this._sessions]) {
      if (!s.matchesIdentity({ wifiMac }) || this._onCable(s)) continue
      console.log(`[CpManager] ${wifiMac} left the access point, its session ends`)
      void s.close()
    }
  }

  /** A session of a phone on the cable, other than the wireless one it had before the cable. */
  private _onCable(s: CpSession): boolean {
    return this._wired.has(s.getBtMac().toLowerCase()) && !this._cabled.has(s)
  }

  // ── Helper event routing ────────────────────────────────────────────────────
  //
  //   - wifi / device  → registry-level presence (onHelperPresence) + adopt onto a
  //                       matching session so it gains the phone's Wi-Fi IP.
  //   - metadata (nowplaying / navigation / call / power / cellular / albumart)
  //                       carries the phone's transport-independent iAP2 identity
  //                       (phoneId, from DeviceTransportIdentifierNotification) plus its
  //                       controllerId, and routes to the session matching either.
  //                       The phoneId is the same over BT, the Wi-Fi tunnel and the
  //                       USB tunnel, so it works even when metadata rides the BT
  //                       bootstrap peer. An untagged event falls back to the live
  //                       session, else the sole session.

  private _onHelperEvent(ev: Record<string, unknown>): void {
    if (ev.type === 'wifi') {
      const wifiMac = str(ev.mac)
      const joined = ev.event === 'joined'
      if (!joined && wifiMac) this._leftWifi(wifiMac)
      this._onHelperPresence({ kind: 'wifi', wifiMac, ip: str(ev.ip), connected: joined })
      return
    }
    if (ev.type === 'device') {
      const ids: PendingDevice = {
        btMac: str(ev.btMac) || undefined,
        ip: str(ev.ip) || undefined,
        usbUdid: str(ev.usbUdid) || undefined,
        name: str(ev.name) || undefined
      }
      if (ids.btMac) this._gone.delete(ids.btMac.toLowerCase())
      const match = this._matchSession(ids)
      if (ids.btMac && ids.usbUdid) {
        const mac = ids.btMac.toLowerCase()
        // A session already running when the phone comes onto the bus is the wireless one.
        if (!this._wired.has(mac) && match?.getControllerId()) this._cabled.add(match)
        this._wired.set(mac, ids.usbUdid)
      }
      this._onHelperPresence({ kind: 'device', ...ids })
      if (match) match.adoptHelperDevice(ids)
      else this._bufferPending(ids)
      return
    }
    if (ev.type === 'link') {
      // The LIVI Link carries every wireless CarPlay session, so they end with it instead of
      // each socket running into its own timeout. One on the cable does not need it any more.
      if (ev.up === false) {
        for (const s of [...this._sessions]) if (!this._onCable(s)) void s.close()
        for (let i = this._pendingDevices.length - 1; i >= 0; i--) {
          if (!this._pendingDevices[i]!.usbUdid) this._pendingDevices.splice(i, 1)
        }
      }
      return
    }
    if (ev.type === 'wired-start') {
      const usbUdid = str(ev.usbUdid)
      const ip = normHost(str(ev.ip))
      if (!usbUdid || !ip) return
      this._cableAddrs.set(usbUdid, ip)
      // Plugging the phone in asks for CarPlay over the cable. The phone runs one session at a
      // time, so the wireless one makes room.
      const phoneId = str(ev.phoneId) || undefined
      for (const s of [...this._sessions]) {
        if (!this._cabled.has(s) || !s.matchesIdentity({ usbUdid, btMac: phoneId })) continue
        console.log(`[CpManager] ${usbUdid} got the start over its cable, wireless makes room`)
        void s.close()
      }
      return
    }
    if (ev.type === 'deviceTime') {
      if (typeof ev.utcOffsetMinutes === 'number') applyPhoneUtcOffset(ev.utcOffsetMinutes)
      return
    }
    if (ev.type === 'device-gone') {
      const usbUdid = str(ev.usbUdid)
      if (!usbUdid) return
      // A wired phone physically left the bus (carkit): close its session, not the live one.
      for (const [mac, udid] of this._wired) if (udid === usbUdid) this._wired.delete(mac)
      this._cableAddrs.delete(usbUdid)
      this._cameOver(usbUdid)
      this._onHelperPresence({ kind: 'device-gone', usbUdid })
      for (const s of [...this._sessions]) {
        if (!s.matchesIdentity({ usbUdid })) continue
        // A session that ran before the cable came is the wireless one, and it carries on.
        if (this._cabled.delete(s)) continue
        void s.close()
      }
      for (let i = this._pendingDevices.length - 1; i >= 0; i--) {
        if (this._pendingDevices[i]!.usbUdid === usbUdid) this._pendingDevices.splice(i, 1)
      }
      return
    }
    const phoneId = typeof ev.phoneId === 'string' ? ev.phoneId : ''
    const cid = typeof ev.cid === 'string' ? ev.cid : ''
    const byPhoneId = phoneId
      ? [...this._sessions].find((s) => s.matchesIdentity({ btMac: phoneId }))
      : undefined
    const byCid = cid
      ? [...this._sessions].find((s) => s.matchesIdentity({ controllerId: cid }))
      : undefined
    let target = byPhoneId ?? byCid
    if (!target) {
      const fallback = this._metadataTarget()
      const contradicts =
        Boolean(phoneId) &&
        Boolean(fallback?.getBtMac()) &&
        fallback!.getBtMac().toLowerCase() !== phoneId.toLowerCase()
      const unattributable = !phoneId && !cid && this._sessions.size > 1
      if (unattributable) target = undefined
      else if (fallback && !contradicts) target = fallback
      else if (phoneId && !this._gone.has(phoneId.toLowerCase())) {
        target = this._createMetaSession(phoneId)
      }
    }
    if (target) target.ingestHelperEvent(ev)
  }

  private _matchSession(ids: PendingDevice): CpSession | null {
    for (const s of this._sessions) if (s.matchesIdentity(ids)) return s
    return null
  }

  /** The session an untagged (cid="") event belongs to: the current live session,
   *  else the sole session. Untagged metadata rides a BT bootstrap peer that lingers
   *  when disableBluetooth cannot drop it, so dropping here would lose CP media. */
  private _metadataTarget(): CpSession | null {
    if (this._liveSession && this._sessions.has(this._liveSession)) return this._liveSession
    if (this._sessions.size === 1) return [...this._sessions][0]!
    return null
  }

  private _bufferPending(ids: PendingDevice): void {
    if (!ids.btMac && !ids.wifiMac && !ids.usbUdid) return
    const i = this._pendingDevices.findIndex(
      (d) =>
        (ids.btMac && d.btMac?.toLowerCase() === ids.btMac.toLowerCase()) ||
        (ids.usbUdid && d.usbUdid === ids.usbUdid)
    )
    if (i >= 0) this._pendingDevices[i] = { ...this._pendingDevices[i], ...ids }
    else this._pendingDevices.push(ids)
    while (this._pendingDevices.length > 8) this._pendingDevices.shift()
  }

  private _adoptPending(session: CpSession): void {
    for (let i = this._pendingDevices.length - 1; i >= 0; i--) {
      const ids = this._pendingDevices[i]!
      if (session.matchesIdentity(ids)) {
        this._pendingDevices.splice(i, 1)
        session.adoptHelperDevice(ids)
      }
    }
  }
}

export default CpManager
