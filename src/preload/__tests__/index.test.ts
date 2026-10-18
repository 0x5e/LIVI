const exposed: Record<string, unknown> = {}

type IpcHandler = (event: unknown, ...args: unknown[]) => void
type ExposedBridge = {
  core?: unknown
  projection?: unknown
  app?: unknown
}

const ipcOnHandlers = new Map<string, IpcHandler[]>()

const ipcRendererMock = {
  on: vi.fn(function (channel: string, handler: IpcHandler) {
    const arr = ipcOnHandlers.get(channel) ?? []
    arr.push(handler)
    ipcOnHandlers.set(channel, arr)
  }),
  invoke: vi.fn(),
  send: vi.fn(),
  removeListener: vi.fn(function (channel: string, handler: IpcHandler) {
    const arr = ipcOnHandlers.get(channel) ?? []
    ipcOnHandlers.set(
      channel,
      arr.filter((h) => h !== handler)
    )
  })
}

const links: Array<{ opts: Record<string, unknown>; close: ReturnType<typeof vi.fn> }> = []

vi.mock('@shared/core/link', () => ({
  coreSocketPath: () => '/run/livi/core.sock',
  CoreLink: class {
    close = vi.fn()
    constructor(public opts: Record<string, unknown>) {
      links.push(this)
    }
    send = vi.fn(() => true)
  }
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(function (key: keyof ExposedBridge, value: unknown) {
      exposed[key] = value
    })
  },
  ipcRenderer: ipcRendererMock
}))

describe('preload api bridge', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    for (const key of Object.keys(exposed)) delete exposed[key]
    ipcOnHandlers.clear()
  })

  async function loadPreload() {
    await import('../index')
    return {
      core: exposed.core,
      projection: exposed.projection,
      app: exposed.app
    }
  }

  function emit(channel: string, ...args: unknown[]) {
    const handlers = ipcOnHandlers.get(channel) ?? []
    for (const handler of handlers) {
      handler({ channel }, ...args)
    }
  }

  test('core connects a link of its own for each caller and drops it with the page', async () => {
    const listeners: Record<string, () => void> = {}
    vi.stubGlobal(
      'addEventListener',
      vi.fn((type: string, fn: () => void) => {
        listeners[type] = fn
      })
    )
    links.length = 0
    const { core } = await loadPreload()
    const onMessage = vi.fn()
    const onClose = vi.fn()

    const conn = core.connect('ui:main', onMessage, onClose)

    expect(links[0].opts).toEqual({
      path: '/run/livi/core.sock',
      client: 'ui:main',
      onMessage,
      onClose
    })
    expect(conn.send({ type: 'resync' })).toBe(true)
    conn.close()
    expect(links[0].close).toHaveBeenCalledTimes(1)
    listeners.pagehide()
    expect(links[0].close).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  test('exposes projection and app apis in main world', async () => {
    const { projection, app } = await loadPreload()

    expect(projection).toBeDefined()
    expect(app).toBeDefined()
  })

  test('app wrappers forward invoke and send calls', async () => {
    const { app } = await loadPreload()
    ipcRendererMock.invoke.mockResolvedValue({ ok: true })

    await app.getVersion()
    await app.customPageUrl()
    await app.customIconUrl()
    app.notifyUserActivity()

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('app:getVersion')
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('app:customPageUrl')
    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('app:customIconUrl')
    expect(ipcRendererMock.send).toHaveBeenCalledWith('app:user-activity')
  })

  describe('media-key bridge', () => {
    test('app:media-key ignores non-string payloads', async () => {
      const { app } = await loadPreload()
      const handler = vi.fn()
      app.onMediaKey(handler)
      emit('app:media-key', 123)
      emit('app:media-key', '')
      emit('app:media-key', null)
      expect(handler).not.toHaveBeenCalled()
    })

    test('app:media-key dispatches to registered handlers', async () => {
      const { app } = await loadPreload()
      const handler = vi.fn()
      app.onMediaKey(handler)
      emit('app:media-key', 'playPause')
      expect(handler).toHaveBeenCalledWith('playPause')
    })

    test('app:media-key queues commands until a handler subscribes, then flushes', async () => {
      const { app } = await loadPreload()
      emit('app:media-key', 'next')
      emit('app:media-key', 'prev')

      const handler = vi.fn()
      app.onMediaKey(handler)
      expect(handler).toHaveBeenCalledWith('next')
      expect(handler).toHaveBeenCalledWith('prev')
    })

    test('onMediaKey return value detaches the handler', async () => {
      const { app } = await loadPreload()
      const handler = vi.fn()
      const off = app.onMediaKey(handler)
      off()
      emit('app:media-key', 'playPause')
      expect(handler).not.toHaveBeenCalled()
    })

    test('broadcastMediaKey forwards the command via ipcRenderer.send', async () => {
      const { app } = await loadPreload()
      app.broadcastMediaKey('next')
      expect(ipcRendererMock.send).toHaveBeenCalledWith('app:media-key', 'next')
    })

    test('notifyUserActivity sends app:user-activity', async () => {
      const { app } = await loadPreload()
      app.notifyUserActivity()
      expect(ipcRendererMock.send).toHaveBeenCalledWith('app:user-activity')
    })
  })

  test('onMediaKey off is safe to call twice', async () => {
    const { app } = await loadPreload()
    const handler = vi.fn()

    const off = app.onMediaKey(handler)
    off()
    off()
    emit('app:media-key', 'playPause')

    expect(handler).not.toHaveBeenCalled()
  })

  test('the cluster repaint nudge forwards to invoke', async () => {
    const { projection } = await loadPreload()
    ipcRendererMock.invoke.mockResolvedValue(undefined)

    await projection.ipc.clusterRepaintNudge()

    expect(ipcRendererMock.invoke).toHaveBeenCalledWith('cluster:repaint-nudge')
  })
})
