type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'

const METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug']

const fsMock = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  renameSync: vi.fn(),
  createWriteStream: vi.fn()
}))
vi.mock('node:fs', () => ({ default: fsMock }))

function fakeStream(): { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> } {
  return { write: vi.fn(), end: vi.fn() }
}

const realPlatform = process.platform
const onPlatform = (platform: string) =>
  Object.defineProperty(process, 'platform', { value: platform })

describe('logTimestamps', () => {
  afterEach(() => onPlatform(realPlatform))

  beforeEach(() => {
    onPlatform('linux')
    fsMock.mkdirSync.mockReset()
    fsMock.rmSync.mockReset()
    fsMock.renameSync.mockReset()
    fsMock.createWriteStream.mockReset()
    fsMock.createWriteStream.mockImplementation(() => fakeStream())
  })

  test('prefixes every console method with a wall-clock timestamp', async () => {
    vi.resetModules()
    const original = new Map(METHODS.map((m) => [m, console[m]]))
    const spies = Object.fromEntries(METHODS.map((m) => [m, vi.fn()])) as Record<
      ConsoleMethod,
      ReturnType<typeof vi.fn>
    >
    for (const m of METHODS) console[m] = spies[m]
    try {
      await import('../logTimestamps')
      console.log('a', 1)
      console.info('b')
      console.warn('c')
      console.error('d')
      console.debug('e')
      const ts = expect.stringMatching(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]$/)
      expect(spies.log).toHaveBeenCalledWith(ts, 'a', 1)
      expect(spies.info).toHaveBeenCalledWith(ts, 'b')
      expect(spies.warn).toHaveBeenCalledWith(ts, 'c')
      expect(spies.error).toHaveBeenCalledWith(ts, 'd')
      expect(spies.debug).toHaveBeenCalledWith(ts, 'e')
    } finally {
      for (const m of METHODS) {
        const fn = original.get(m)
        if (fn) console[m] = fn
      }
    }
  })

  test('started by core it leaves the console and the log file to core', async () => {
    vi.resetModules()
    vi.stubEnv('LIVI_CORE_SOCKET', '/run/livi/core.sock')
    const before = new Map(METHODS.map((m) => [m, console[m]]))
    try {
      await import('../logTimestamps')
      for (const m of METHODS) expect(console[m]).toBe(before.get(m))
      expect(fsMock.createWriteStream).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('on macOS the lines wait for core and then go to it', async () => {
    vi.resetModules()
    onPlatform('darwin')
    const original = console.log
    console.log = vi.fn()
    try {
      const { logThroughCore } = await import('../logTimestamps')
      console.log('early')
      const write = vi.fn()
      logThroughCore(write)
      expect(write).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] early$/)
      )
      console.log('live')
      expect(write).toHaveBeenLastCalledWith(expect.stringContaining('live'))

      logThroughCore(null)
      for (let i = 0; i < 1001; i++) console.log(`held ${i}`)
      const later = vi.fn()
      logThroughCore(later)
      expect(later).toHaveBeenCalledTimes(1000)
    } finally {
      console.log = original
    }
    expect(fsMock.createWriteStream).not.toHaveBeenCalled()
  })

  test('rotates the session logs and starts a fresh file over the size cap', async () => {
    vi.resetModules()
    const streams: ReturnType<typeof fakeStream>[] = []
    fsMock.createWriteStream.mockImplementation(() => {
      const s = fakeStream()
      streams.push(s)
      return s
    })
    // One slot is empty, so the rename catch path runs alongside the successful ones
    fsMock.renameSync.mockImplementation((from: unknown) => {
      if (String(from).includes('LIVI.3.log')) throw new Error('slot empty')
    })
    const original = console.log
    console.log = vi.fn()
    try {
      await import('../logTimestamps')
      console.log('x'.repeat(9 * 1024 * 1024))
      console.log('first line of the fresh file')
    } finally {
      console.log = original
    }
    expect(streams).toHaveLength(2)
    expect(streams[0].end).toHaveBeenCalled()
    expect(streams[1].write).toHaveBeenCalledWith(expect.stringContaining('fresh file'))
    expect(fsMock.rmSync).toHaveBeenCalled()
  })

  test('skips the sink quietly when no stream can be opened', async () => {
    vi.resetModules()
    fsMock.createWriteStream.mockReturnValue(null)
    const original = console.log
    const spy = vi.fn()
    console.log = spy
    try {
      await import('../logTimestamps')
      console.log('one')
      console.log('two')
    } finally {
      console.log = original
    }
    // Not dead: every line retries the open, the console keeps printing
    expect(fsMock.createWriteStream).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  test('skips the write when the post-rotation stream cannot be opened', async () => {
    vi.resetModules()
    const first = fakeStream()
    fsMock.createWriteStream.mockReturnValueOnce(first).mockReturnValueOnce(null)
    const original = console.log
    console.log = vi.fn()
    try {
      await import('../logTimestamps')
      console.log('x'.repeat(9 * 1024 * 1024))
      console.log('lost line')
    } finally {
      console.log = original
    }
    expect(first.end).toHaveBeenCalled()
    expect(first.write).toHaveBeenCalledTimes(1)
  })

  test('stays console-only after the log sink fails once', async () => {
    vi.resetModules()
    fsMock.createWriteStream.mockImplementation(() => {
      throw new Error('no disk')
    })
    const original = console.log
    const spy = vi.fn()
    console.log = spy
    try {
      await import('../logTimestamps')
      console.log('one')
      console.log('two')
    } finally {
      console.log = original
    }
    expect(fsMock.createWriteStream).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
