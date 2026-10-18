vi.mock('../contract', () => ({ MAX_FRAME: 1024, PROTOCOL: 7 }))

import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FromCore, ToCore } from '../contract'
import { CoreLink, coreSocketPath } from '../link'
import { encodeFrame, FrameDecoder } from '../wire'

let dir: string
let path: string
let server: Server
let peers: Socket[]
let received: ToCore[]

function listen(): Promise<void> {
  server = createServer((socket) => {
    peers.push(socket)
    const dec = new FrameDecoder()
    socket.on('data', (chunk) => {
      received.push(...(dec.push(chunk) as unknown as ToCore[]))
    })
  })
  return new Promise((resolve) => server.listen(path, resolve))
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10))
  expect(check()).toBe(true)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lc-'))
  path = join(dir, 'core.sock')
  peers = []
  received = []
})

afterEach(async () => {
  for (const p of peers) p.destroy()
  await new Promise((r) => (server?.listening ? server.close(r) : r(undefined)))
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('coreSocketPath', () => {
  test('takes the path core handed over', () => {
    expect(coreSocketPath({ LIVI_CORE_SOCKET: '/x/core.sock' }, 5)).toBe('/x/core.sock')
  })

  test('finds core in the session dir, else in the temp dir', () => {
    expect(coreSocketPath({ XDG_RUNTIME_DIR: '/run/user/5' }, 5)).toBe('/run/user/5/livi/core.sock')
    expect(coreSocketPath({}, 5)).toBe(join(tmpdir(), 'livi-5', 'core.sock'))
  })

  test('defaults to this process', () => {
    const env = { ...process.env, LIVI_CORE_SOCKET: '' }
    expect(coreSocketPath(env)).toMatch(/core\.sock$/)
    expect(coreSocketPath()).toMatch(/core\.sock$/)
  })

  test('takes uid 0 where the platform has none', () => {
    const getuid = process.getuid
    Object.assign(process, { getuid: undefined })
    expect(coreSocketPath({})).toBe(join(tmpdir(), 'livi-0', 'core.sock'))
    Object.assign(process, { getuid })
  })
})

describe('CoreLink', () => {
  test('says hello, then carries messages both ways', async () => {
    await listen()
    const got: FromCore[] = []
    const link = new CoreLink({ path, client: 'test', onMessage: (m) => got.push(m) })
    expect(link.send({ type: 'resync' })).toBe(false)
    await until(() => received.length === 1)
    expect(received[0]).toEqual({ type: 'hello', protocol: 7, client: 'test' })
    expect(link.send({ type: 'resync' })).toBe(true)
    peers[0].write(encodeFrame({ type: 'reply', id: 1 }))
    await until(() => received.length === 2 && got.length === 1)
    expect(got).toEqual([{ type: 'reply', id: 1 }])
    link.close()
  })

  test('waits for core and connects once it is there', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const link = new CoreLink({ path, client: 'late', onMessage: () => {}, retryMs: 20 })
    await until(() => log.mock.calls.length === 1)
    await new Promise((r) => setTimeout(r, 60))
    expect(log).toHaveBeenCalledTimes(1)
    await listen()
    await until(() => received.length === 1)
    link.close()
  })

  test('tries again every half second by default', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const link = new CoreLink({ path, client: 'x', onMessage: () => {} })
    await new Promise((r) => setTimeout(r, 50))
    await listen()
    await until(() => received.length === 1)
    link.close()
  })

  test('a lost core is reported and found again', async () => {
    await listen()
    const onClose = vi.fn()
    const link = new CoreLink({ path, client: 'x', onMessage: () => {}, onClose, retryMs: 20 })
    await until(() => received.length === 1)
    peers[0].destroy()
    await until(() => onClose.mock.calls.length === 1 && received.length === 2)
    link.close()
  })

  test('a refused client stops trying', async () => {
    await listen()
    const got: FromCore[] = []
    const link = new CoreLink({ path, client: 'x', onMessage: (m) => got.push(m), retryMs: 20 })
    await until(() => received.length === 1)
    peers[0].end(encodeFrame({ type: 'refused', reason: 'old' }))
    await until(() => got.length === 1)
    await new Promise((r) => setTimeout(r, 80))
    expect(received).toHaveLength(1)
    link.close()
  })

  test('an oversized frame drops the connection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await listen()
    const onClose = vi.fn()
    const link = new CoreLink({ path, client: 'x', onMessage: () => {}, onClose, retryMs: 1000 })
    await until(() => received.length === 1)
    const head = new Uint8Array(4)
    new DataView(head.buffer).setUint32(0, 4096, true)
    peers[0].write(head)
    await until(() => onClose.mock.calls.length === 1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropping the connection'))
    link.close()
  })

  test('close before anything connected stops the retries', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const link = new CoreLink({ path, client: 'x', onMessage: () => {} })
    link.close()
    await listen()
    await new Promise((r) => setTimeout(r, 80))
    expect(received).toHaveLength(0)
  })
})
