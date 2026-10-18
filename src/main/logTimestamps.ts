import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'
import { app } from 'electron'

const MAX_LOG_BYTES = 8 * 1024 * 1024
const KEEP_SESSIONS = 5

const HELD_MAX = 1000

let stream: fs.WriteStream | null = null
let written = 0
let sinkDead = false

// On macOS core is Electron's child and writes LIVI.log, so the lines go to core.
const coreTakesLog = process.platform === 'darwin'
const held: string[] = []
let toCore: ((line: string) => void) | null = null

export function logThroughCore(write: ((line: string) => void) | null): void {
  toCore = write
  if (write) for (const line of held.splice(0)) write(line)
}

function hand(line: string): void {
  if (toCore) toCore(line)
  else if (held.length < HELD_MAX) held.push(line)
}

function rotate(dir: string): void {
  fs.rmSync(path.join(dir, `LIVI.${KEEP_SESSIONS - 1}.log`), { force: true })
  for (let i = KEEP_SESSIONS - 2; i >= 1; i--) {
    try {
      fs.renameSync(path.join(dir, `LIVI.${i}.log`), path.join(dir, `LIVI.${i + 1}.log`))
    } catch {
      /* slot not filled yet */
    }
  }
  try {
    fs.renameSync(path.join(dir, 'LIVI.log'), path.join(dir, 'LIVI.1.log'))
  } catch {
    /* first run, nothing to rotate */
  }
}

function openLogStream(): fs.WriteStream | null {
  const dir = path.join(app.getPath('userData'), 'log')
  fs.mkdirSync(dir, { recursive: true })
  rotate(dir)
  written = 0
  return fs.createWriteStream(path.join(dir, 'LIVI.log'), { flags: 'w' })
}

function sink(line: string): void {
  if (sinkDead) return
  try {
    if (!stream) stream = openLogStream()
    if (!stream) return
    if (written > MAX_LOG_BYTES) {
      stream.end()
      stream = openLogStream()
      if (!stream) return
    }
    stream.write(`${line}\n`)
    written += line.length + 1
  } catch {
    // No usable log path (yet) or disk trouble: stay console-only.
    sinkDead = true
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

const base = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console)
}

function emit(kind: keyof typeof base, args: unknown[]): void {
  const ts = `[${stamp()}]`
  base[kind](ts, ...args)
  const line = `${ts} ${util.format(...args)}`
  if (coreTakesLog) hand(line)
  else sink(line)
}

// Started by core, which stamps every line it hears and writes LIVI.log itself.
if (!process.env.LIVI_CORE_SOCKET) {
  console.log = (...a: unknown[]): void => emit('log', a)
  console.info = (...a: unknown[]): void => emit('info', a)
  console.warn = (...a: unknown[]): void => emit('warn', a)
  console.error = (...a: unknown[]): void => emit('error', a)
  console.debug = (...a: unknown[]): void => emit('debug', a)
}
