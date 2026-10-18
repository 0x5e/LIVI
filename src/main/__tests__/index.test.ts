import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

vi.mock('../window/createWindow', () => ({
  createMainWindow: vi.fn(),
  getMainWindow: vi.fn(function () {
    return {}
  })
}))

vi.mock('../window/secondaryWindows', () => ({
  setupSecondaryWindows: vi.fn()
}))

vi.mock('@main/app/lifecycle', () => ({
  setupLifecycle: vi.fn()
}))

vi.mock('@main/app/init', () => ({
  setupAppIdentity: vi.fn()
}))

vi.mock('@main/protocol/appProtocol', () => ({
  registerAppProtocol: vi.fn(),
  seedCustomPage: vi.fn(),
  setCustomPageConfig: vi.fn()
}))

vi.mock('@main/ipc', () => ({
  registerIpc: vi.fn()
}))

vi.mock('../window/applyConfig', () => ({
  applyConfig: vi.fn(),
  configEvents: new EventEmitter()
}))

vi.mock('@main/core', () => ({
  startCore: vi.fn(async () => {})
}))

vi.mock('@main/video', () => ({
  startVideo: vi.fn()
}))

vi.mock('@main/services/custom/CustomProxy', () => ({
  customProxy: { start: vi.fn(async () => null) }
}))

async function mockReadyRunsCallback(): Promise<void> {
  const { app } = await import('electron')
  ;(app.whenReady as Mock).mockImplementation(
    () =>
      ({
        then: (cb: () => void) => {
          cb()
          return Promise.resolve()
        }
      }) as Promise<void>
  )
}

async function bootIndex(): Promise<void> {
  await import('@main/index')
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
}

describe('main index bootstrap', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const { configEvents } = await import('../window/applyConfig')
    configEvents.removeAllListeners()
  })

  test('follows core, then boots the windows', async () => {
    await mockReadyRunsCallback()
    const { createMainWindow } = await import('../window/createWindow')
    const { setupSecondaryWindows } = await import('../window/secondaryWindows')
    const { setupLifecycle } = await import('@main/app/lifecycle')
    const { setupAppIdentity } = await import('@main/app/init')
    const { registerIpc } = await import('@main/ipc')
    const { registerAppProtocol, seedCustomPage, setCustomPageConfig } = await import(
      '@main/protocol/appProtocol'
    )
    const { customProxy } = await import('@main/services/custom/CustomProxy')
    const { DEFAULT_CONFIG } = await import('@shared/types')
    const { startCore } = await import('@main/core')
    const { startVideo } = await import('@main/video')
    const { applyConfig } = await import('../window/applyConfig')

    await bootIndex()

    expect((startVideo as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (startCore as Mock).mock.invocationCallOrder[0]
    )

    const runtimeState = (createMainWindow as Mock).mock.calls[0][0]
    expect(runtimeState.config).toEqual(DEFAULT_CONFIG)
    expect(runtimeState.config).not.toBe(DEFAULT_CONFIG)
    const [coreState, onConfig] = (startCore as Mock).mock.calls[0]
    expect(coreState).toBe(runtimeState)
    const next = { customUrl: 'x' }
    onConfig(next)
    expect(applyConfig).toHaveBeenCalledWith(runtimeState, next)
    expect(setupAppIdentity).toHaveBeenCalled()
    expect(registerAppProtocol).toHaveBeenCalled()
    expect(registerIpc).toHaveBeenCalledWith(runtimeState)
    expect(setupSecondaryWindows).toHaveBeenCalledWith(runtimeState)
    expect(setupLifecycle).toHaveBeenCalledWith(runtimeState)
    expect(seedCustomPage).toHaveBeenCalled()
    expect(customProxy.start).toHaveBeenCalledWith(DEFAULT_CONFIG.customUrl)

    const getConfig = (setCustomPageConfig as Mock).mock.calls[0][0] as () => unknown
    expect(getConfig()).toBe(runtimeState.config)
  })

  test('a changed custom url restarts the proxy', async () => {
    await mockReadyRunsCallback()
    const { configEvents } = await import('../window/applyConfig')
    const { customProxy } = await import('@main/services/custom/CustomProxy')

    await bootIndex()
    configEvents.emit('changed', { customUrl: 'http://10.0.0.5/' })

    expect(customProxy.start).toHaveBeenLastCalledWith('http://10.0.0.5/')
  })

  test('exits without booting when the single-instance lock is held', async () => {
    await mockReadyRunsCallback()
    const { app } = await import('electron')
    ;(app.requestSingleInstanceLock as Mock).mockReturnValueOnce(false)
    const { createMainWindow } = await import('../window/createWindow')

    await bootIndex()

    expect(app.exit as Mock).toHaveBeenCalledWith(0)
    expect(createMainWindow).not.toHaveBeenCalled()
  })

  test('second-instance restores, shows and focuses the main window', async () => {
    const { app } = await import('electron')
    const { getMainWindow } = await import('../window/createWindow')

    await bootIndex()

    const call = (app.on as Mock).mock.calls.find((c) => c[0] === 'second-instance')
    const handler = call?.[1] as () => void

    ;(getMainWindow as Mock).mockReturnValueOnce(null)
    expect(() => handler()).not.toThrow()

    const restore = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()
    ;(getMainWindow as Mock).mockReturnValueOnce({ isMinimized: () => true, restore, show, focus })
    handler()
    expect(restore).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
    ;(getMainWindow as Mock).mockReturnValueOnce({ isMinimized: () => false, restore, show, focus })
    handler()
    expect(restore).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(2)
  })
})
