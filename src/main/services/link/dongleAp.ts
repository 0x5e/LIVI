import net from 'node:net'
import os from 'node:os'
import type { Config } from '@shared/types/Config'

/** What the Wi-Fi interface and Bluetooth adapter lists carry for the dongle's own radios. */
export const DONGLE_LINK = 'livi-link'

const HOST = 'livi-link.local'
/** The dongle's USB link and its own access point both hand out addresses here. */
const LINK_SUBNET = '10.10.10.'
/** The dongle takes every order here, the Bluetooth accessory's with an `iap` in front. */
const PORT = 5001
/** Applying waits for the radio, and a 5 GHz start spends the first seconds scanning. */
const APPLY_MS = 30_000
const PROBE_MS = 1500
const DRIFT_RETRY_MS = 30_000
/** Quitting waits for each order this long at most. */
const QUIT_MS = 1500

/**
 * Runs commands on one connection, in order, and gives up on the first one the dongle refuses.
 * Every answer ends in `ok` or `error <reason>`, so the next command goes out on the `ok`.
 */
function talk(commands: string[], timeoutMs = APPLY_MS): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port: PORT })
    const answers: string[] = []
    let buffer = ''
    let at = 0
    let done = false

    const finish = (err?: Error): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.destroy()
      if (err) reject(err)
      else resolve(answers)
    }
    // One timer for the whole exchange, since a name that does not resolve never reaches connect.
    const timer = setTimeout(() => finish(new Error('the dongle did not answer')), timeoutMs)

    socket.on('connect', () => socket.write(`${commands[at]}\n`))
    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end).trimEnd()
        buffer = buffer.slice(end + 1)
        if (line.startsWith('error ')) {
          finish(new Error(`${commands[at]}: ${line.slice(6)}`))
          return
        }
        if (line !== 'ok') {
          answers.push(line)
          continue
        }
        at += 1
        if (at >= commands.length) {
          finish()
          return
        }
        socket.write(`${commands[at]}\n`)
      }
    })
    socket.on('error', (err) => finish(err))
    socket.on('close', () => finish(new Error('the dongle closed the link')))
  })
}

const ssidOf = (config: Config): string => config.carName || 'LIVI'
const countryOf = (config: Config): string => (config.country || 'DE').toUpperCase()

/** The access point's settings, while it is the chosen one and switched on. Whether it is on is kept
 *  on the dongle and changes only on its page or when an adapter is picked. */
export function commandsFor(config: Config, status: Record<string, string>): string[] {
  if (config.wifiInterface !== DONGLE_LINK || status['wifi-enabled'] === 'off') return []
  return settingsFor(config)
}

function settingsFor(config: Config): string[] {
  return [
    `set ssid ${ssidOf(config)}`,
    `set country ${countryOf(config)}`,
    `set channel ${config.wifiChannel || 36}`,
    `set width ${config.wifiChannelWidth || 40}`,
    `set passphrase ${config.wifiPassword || '12345678'}`,
    'apply',
    // Keeps the whole state across a reboot. Only a boot that reaches neither the USB link nor
    // the AP puts the default name back.
    'save'
  ]
}

// On Linux the host drives the dongle's controller itself, over the tunnel.
function accessoryOnDongle(): boolean {
  return process.platform !== 'linux' || process.env.LIVI_BT_VIA_DONGLE === '1'
}

export function btCommandsFor(config: Config): string[] {
  if (config.btAdapter !== DONGLE_LINK || !config.wirelessCpEnabled) return ['iap off']
  if (!accessoryOnDongle()) return ['iap off']
  // Who may be paged comes from the paging list the helper hands over, not from here.
  return ['iap on']
}

/** The access point's MAC, as of the last exchange with the dongle. */
let apMac: string | null = null

/** What the phone is told to look for. Empty until the dongle has answered once. */
export function dongleApMac(): string | null {
  return apMac
}

function attached(): boolean {
  return Object.values(os.networkInterfaces())
    .flat()
    .some((address) => address?.address.startsWith(LINK_SUBNET))
}

function parse(answers: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of answers) {
    const sp = line.indexOf(' ')
    if (sp > 0) out[line.slice(0, sp)] = line.slice(sp + 1).trim()
  }
  return out
}

/** One status snapshot as a flat map of the dongle's `key value` lines, or null if it is not
 *  on the network / did not answer. Used by the link-speed monitor. */
export async function dongleStatus(): Promise<Record<string, string> | null> {
  if (!attached()) return null
  try {
    return parse(await talk(['status'], PROBE_MS))
  } catch {
    return null
  }
}

export type DongleRadios = { wifi: boolean | null; bt: boolean | null }

/** Whether the dongle's radios are switched on, null for a dongle that did not answer. */
export function radiosOf(status: Record<string, string> | null): DongleRadios {
  if (!status) return { wifi: null, bt: null }
  return { wifi: status['wifi-enabled'] !== 'off', bt: status['bt-enabled'] !== 'off' }
}

/** Whether a LIVI Link is on the network and ready to be configured. */
export async function dongleApPresent(): Promise<boolean> {
  if (!attached()) return false
  // Right after the dongle is plugged in the route to it needs a moment, so one miss is no answer.
  let last = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await talk(['status'], PROBE_MS)
      return true
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
  }
  console.log(`[dongleAp] ${HOST}:${PORT} did not answer: ${last}`)
  return false
}

function absent(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code
  return code === 'ENOTFOUND' || code === 'EAI_AGAIN'
}

function report(what: string, err: unknown): void {
  if (absent(err)) console.log(`[dongleAp] ${what}: no dongle on the network`)
  else console.warn(`[dongleAp] ${what}:`, String(err))
}

let wanted: Config | null = null
let told = false
let reconciling = false
let lastDriftAt = 0
let lastTryAt = 0

export function drifted(status: Record<string, string>, config: Config): boolean {
  if (config.wifiInterface !== DONGLE_LINK || status['wifi-enabled'] === 'off') return false
  if (status.state !== 'on') return true
  // Not channel and width: the dongle narrows those itself when its radio refuses them.
  return status.ssid !== ssidOf(config).trim() || status.country_code !== countryOf(config)
}

/** Fed with every status poll. */
export function noteDongleStatus(status: Record<string, string> | null): void {
  if (!status) {
    told = false
    lastTryAt = 0
    return
  }
  if (!wanted || reconciling) return
  if (!told && Date.now() - lastTryAt < DRIFT_RETRY_MS) return
  if (told && !(drifted(status, wanted) && Date.now() - lastDriftAt > DRIFT_RETRY_MS)) return
  if (told) lastDriftAt = Date.now()
  void reconcileDongleAp(wanted)
}

/** Hands the dongle its settings when it is the chosen AP and switched on. */
export async function reconcileDongleAp(config: Config): Promise<void> {
  wanted = config
  if (!attached() || reconciling) return
  reconciling = true
  try {
    await reconcile(config)
  } finally {
    reconciling = false
  }
}

async function reconcile(config: Config): Promise<void> {
  lastTryAt = Date.now()
  let heard = true
  let status: Record<string, string> = {}
  try {
    status = parse(await talk(['status']))
    const commands = commandsFor(config, status)
    if (commands.length > 0) status = parse(await talk([...commands, 'status']))
    apMac = status.mac || apMac
  } catch (err) {
    // Nothing local depends on the dongle, so a refusal is noted and the rest goes on.
    heard = false
    report('access point', err)
  }
  // The accessory only runs while the dongle's Bluetooth is switched on.
  if (status['bt-enabled'] !== 'off') {
    try {
      await talk(btCommandsFor(config))
    } catch (err) {
      heard = false
      report('bluetooth', err)
    }
  }
  told = heard
}

export type DongleRadio = 'wifi' | 'bt'

/** Switches one of the dongle's radios, kept there across a boot. Wi-Fi switched on gets the access
 *  point's settings right away. */
export async function switchDongle(radio: DongleRadio, on: boolean, config: Config): Promise<void> {
  if (!attached()) return
  const commands =
    radio === 'wifi' ? (on ? ['on', ...settingsFor(config)] : ['off']) : [on ? 'bt on' : 'bt off']
  try {
    await talk(commands)
  } catch (err) {
    report(radio === 'wifi' ? 'access point' : 'bluetooth', err)
    return
  }
  // The accessory learns its part once the controller is up.
  if (radio === 'bt' && on) await reconcileDongleAp(config)
}

/**
 * LIVI is quitting: the accessory stops calling the phone back and the access point goes off the
 * air, because a phone thrown off a network that is still there joins it again. The next start
 * brings it back. Each order on its own connection, because a refused one ends a connection and
 * the other must still arrive.
 */
export async function releaseDongleForQuit(): Promise<void> {
  if (!attached()) return
  for (const command of ['iap off', 'down']) {
    try {
      await talk([command], QUIT_MS)
    } catch (err) {
      report(command, err)
    }
  }
}

/** Picking the dongle as an adapter switches that radio on, picking another one switches it off. */
export function followAdapterChoice(before: Config, next: Config): void {
  const adapters: [DongleRadio, 'wifiInterface' | 'btAdapter'][] = [
    ['wifi', 'wifiInterface'],
    ['bt', 'btAdapter']
  ]
  for (const [radio, key] of adapters) {
    if (before[key] === next[key]) continue
    if (next[key] === DONGLE_LINK) void switchDongle(radio, true, next)
    else if (before[key] === DONGLE_LINK) void switchDongle(radio, false, next)
  }
}
