import { registerAppIpc } from '@main/ipc/app'
import { registerIpcHandle, registerIpcOn } from '@main/ipc/register'
import { broadcastToRenderers } from '@main/window/broadcast'
import { restoreKioskAfterWmExit } from '@main/window/utils'
import { app, BrowserWindow } from 'electron'
import type { Mock } from 'vitest'

vi.mock('@main/window/utils', () => ({
  restoreKioskAfterWmExit: vi.fn()
}))

vi.mock('@main/window/broadcast', () => ({
  broadcastToRenderers: vi.fn()
}))

vi.mock('@main/ipc/register', () => ({
  registerIpcHandle: vi.fn(),
  registerIpcOn: vi.fn()
}))

vi.mock('@main/protocol/appProtocol', () => ({
  CUSTOM_PAGE_URL: 'app://index.html/custom/index.html',
  CUSTOM_ICON_URL: 'app://index.html/custom/icon.svg',
  customPageExists: vi.fn(() => false),
  customIconExists: vi.fn(() => false)
}))

vi.mock('@main/services/custom/CustomProxy', () => ({
  customProxy: { start: vi.fn(async () => null) }
}))

const fromWebContents = vi.fn()
Object.assign(BrowserWindow, { fromWebContents })

describe('registerAppIpc', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  function handle<T>(channel: string): T {
    return (registerIpcHandle as Mock).mock.calls.find(([name]) => name === channel)?.[1] as T
  }

  function on<T>(channel: string): T {
    return (registerIpcOn as Mock).mock.calls.find(([name]) => name === channel)?.[1] as T
  }

  const state = () => ({ isQuitting: false, config: { customUrl: '' } }) as never

  test('registers the app handlers and listeners', () => {
    registerAppIpc(state())

    expect((registerIpcHandle as Mock).mock.calls.map((c) => c[0])).toEqual([
      'app:getVersion',
      'app:customPageUrl',
      'app:customIconUrl',
      'cluster:repaint-nudge'
    ])
    expect((registerIpcOn as Mock).mock.calls.map((c) => c[0])).toEqual([
      'app:user-activity',
      'app:media-key'
    ])
  })

  test('app:customPageUrl prefers the proxy, then the local page, then nothing', async () => {
    const { customProxy } = await import('@main/services/custom/CustomProxy')
    const { customPageExists } = await import('@main/protocol/appProtocol')
    registerAppIpc(state())
    const url = handle<() => Promise<string | null>>('app:customPageUrl')

    ;(customProxy.start as Mock).mockResolvedValueOnce('http://127.0.0.1:5555/')
    await expect(url()).resolves.toBe('http://127.0.0.1:5555/')

    ;(customPageExists as Mock).mockReturnValueOnce(true)
    await expect(url()).resolves.toBe('app://index.html/custom/index.html')

    await expect(url()).resolves.toBeNull()
  })

  test('app:customIconUrl names the icon only when the folder has one', async () => {
    const { customIconExists } = await import('@main/protocol/appProtocol')
    registerAppIpc(state())
    const icon = handle<() => string | null>('app:customIconUrl')

    ;(customIconExists as Mock).mockReturnValueOnce(true)
    expect(icon()).toBe('app://index.html/custom/icon.svg')
    expect(icon()).toBeNull()
  })

  test('app:getVersion reports the app version', () => {
    registerAppIpc(state())
    expect(handle<() => string>('app:getVersion')()).toBe(app.getVersion())
  })

  test('app:user-activity restores the kiosk', () => {
    const runtimeState = state()
    registerAppIpc(runtimeState)
    on<() => void>('app:user-activity')()
    expect(restoreKioskAfterWmExit).toHaveBeenCalledWith(runtimeState)
  })

  test('app:media-key fans a command out and ignores anything else', () => {
    registerAppIpc(state())
    const mediaKey = on<(evt: unknown, cmd: unknown) => void>('app:media-key')

    mediaKey(undefined, 'playPause')
    mediaKey(undefined, '')
    mediaKey(undefined, 42)

    expect(broadcastToRenderers).toHaveBeenCalledTimes(1)
    expect(broadcastToRenderers).toHaveBeenCalledWith('app:media-key', 'playPause')
  })

  test('cluster:repaint-nudge grows the macOS window a pixel and back', async () => {
    vi.useFakeTimers()
    const win = {
      isDestroyed: vi.fn(() => false),
      getSize: vi.fn(() => [800, 480]),
      setSize: vi.fn()
    }
    fromWebContents.mockReturnValue(win)
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    registerAppIpc(state())
    const nudge = handle<(evt: unknown) => Promise<{ ok: boolean }>>('cluster:repaint-nudge')

    await expect(nudge({ sender: {} })).resolves.toEqual({ ok: true })
    expect(win.setSize).toHaveBeenLastCalledWith(800, 481)
    vi.advanceTimersByTime(60)
    expect(win.setSize).toHaveBeenLastCalledWith(800, 480)

    win.setSize.mockClear()
    await nudge({ sender: {} })
    win.isDestroyed.mockReturnValue(true)
    vi.advanceTimersByTime(60)
    expect(win.setSize).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  test('cluster:repaint-nudge does nothing off macOS or without a window', async () => {
    registerAppIpc(state())
    const nudge = handle<(evt: unknown) => Promise<{ ok: boolean }>>('cluster:repaint-nudge')

    Object.defineProperty(process, 'platform', { value: 'linux' })
    await expect(nudge({ sender: {} })).resolves.toEqual({ ok: false })

    Object.defineProperty(process, 'platform', { value: 'darwin' })
    fromWebContents.mockReturnValueOnce(null)
    await expect(nudge({ sender: {} })).resolves.toEqual({ ok: false })
    fromWebContents.mockReturnValueOnce({ isDestroyed: () => true })
    await expect(nudge({ sender: {} })).resolves.toEqual({ ok: false })
  })
})
