import { EventEmitter } from 'node:events'

class MockSocket extends EventEmitter {
  write = vi.fn()
  destroy = vi.fn()
}

const createConnection = vi.fn()

vi.mock('net', () => ({
  __esModule: true,
  createConnection: (...args: unknown[]) => createConnection(...args)
}))

import { AA_SOCK_PATH, AaHelperSock } from '../AaHelperSock'

function makeClient(): { client: AaHelperSock; nextSocket: () => MockSocket } {
  const sockets: MockSocket[] = []
  createConnection.mockReset()
  createConnection.mockImplementation(function () {
    const s = new MockSocket()
    sockets.push(s)
    return s
  })
  return { client: new AaHelperSock('/tmp/test.sock'), nextSocket: () => sockets.shift()! }
}

function answer(sock: MockSocket, body: Record<string, unknown>): void {
  sock.emit('connect')
  sock.emit('data', Buffer.from(JSON.stringify(body) + '\n'))
}

describe('AaHelperSock', () => {
  test('setWiredPhones serializes the id list', async () => {
    const { client, nextSocket } = makeClient()
    const p = client.setWiredPhones(['id1', 'id2'], 500)
    const sock = nextSocket()
    answer(sock, { ok: true })
    expect(sock.write).toHaveBeenCalledWith('wired-phones ["id1","id2"]\n')
    await expect(p).resolves.toEqual({ ok: true })
  })

  test('setScoSink names the feed and stream, or clears it', async () => {
    const { client, nextSocket } = makeClient()
    const p = client.setScoSink('/tmp/feed.sock', 5, 500)
    const sock = nextSocket()
    answer(sock, { ok: true })
    expect(sock.write).toHaveBeenCalledWith('sco-sink /tmp/feed.sock 5\n')
    await expect(p).resolves.toEqual({ ok: true })

    const p2 = client.setScoSink()
    const sock2 = nextSocket()
    answer(sock2, { ok: true })
    expect(sock2.write).toHaveBeenCalledWith('sco-sink\n')
    await expect(p2).resolves.toEqual({ ok: true })
  })

  test('restartUsb writes restart-usb and answers with the count', async () => {
    const { client, nextSocket } = makeClient()
    const p = client.restartUsb()
    const sock = nextSocket()
    answer(sock, { ok: true, count: 1 })
    expect(sock.write).toHaveBeenCalledWith('restart-usb\n')
    await expect(p).resolves.toEqual({ ok: true, count: 1 })
  })

  test('setWiredPhones with the default timeout still works', async () => {
    const { client, nextSocket } = makeClient()
    const p = client.setWiredPhones([])
    answer(nextSocket(), { ok: true })
    await expect(p).resolves.toEqual({ ok: true })
  })

  test('talks to the Android Auto socket unless told otherwise', () => {
    createConnection.mockReset()
    createConnection.mockImplementation(() => new MockSocket())
    new AaHelperSock().subscribe(() => {})
    expect(createConnection).toHaveBeenCalledWith(AA_SOCK_PATH)
  })
})
