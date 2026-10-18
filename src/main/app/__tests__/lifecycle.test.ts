import { setupLifecycle } from '@main/app/lifecycle'
import { stopCore } from '@main/core'
import { createMainWindow, getMainWindow } from '@main/window/createWindow'
import { closeAllSecondaryWindows } from '@main/window/secondaryWindows'
import { app, BrowserWindow } from 'electron'
import type { Mock } from 'vitest'

vi.mock('@main/window/createWindow', () => ({
  createMainWindow: vi.fn(),
  getMainWindow: vi.fn(() => null)
}))

vi.mock('@main/window/secondaryWindows', () => ({
  closeAllSecondaryWindows: vi.fn()
}))

vi.mock('@main/core', () => ({
  stopCore: vi.fn()
}))

describe('setupLifecycle', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  function handler(eventName: string): (...args: unknown[]) => unknown {
    const pair = (app.on as Mock).mock.calls.find(([name]) => name === eventName)
    if (!pair) throw new Error(`no ${eventName} handler`)
    return pair[1] as (...args: unknown[]) => unknown
  }

  test('activate creates the main window when none is open', () => {
    ;(BrowserWindow.getAllWindows as Mock).mockReturnValue([])
    ;(getMainWindow as Mock).mockReturnValue(null)
    const runtimeState = { isQuitting: false } as never

    setupLifecycle(runtimeState)
    handler('activate')()

    expect(createMainWindow).toHaveBeenCalledWith(runtimeState)
  })

  test('activate shows the existing main window', () => {
    const show = vi.fn()
    ;(BrowserWindow.getAllWindows as Mock).mockReturnValue([{}])
    ;(getMainWindow as Mock).mockReturnValue({ show })

    setupLifecycle({ isQuitting: false } as never)
    handler('activate')()

    expect(show).toHaveBeenCalled()
    expect(createMainWindow).not.toHaveBeenCalled()
  })

  test('window-all-closed quits everywhere but on macOS', () => {
    setupLifecycle({ isQuitting: false } as never)
    const allClosed = handler('window-all-closed')

    Object.defineProperty(process, 'platform', { value: 'darwin' })
    allClosed()
    expect(app.quit).not.toHaveBeenCalled()

    Object.defineProperty(process, 'platform', { value: 'linux' })
    allClosed()
    expect(app.quit).toHaveBeenCalledTimes(1)
  })

  test('before-quit marks the quit, closes the secondary windows and stops core', () => {
    const runtimeState = { isQuitting: false }

    setupLifecycle(runtimeState as never)
    handler('before-quit')()

    expect(runtimeState.isQuitting).toBe(true)
    expect(closeAllSecondaryWindows).toHaveBeenCalled()
    expect(stopCore).toHaveBeenCalled()
  })
})
