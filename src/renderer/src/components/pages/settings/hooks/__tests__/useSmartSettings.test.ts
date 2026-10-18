import { act, renderHook } from '@testing-library/react'
import { useSmartSettings } from '../useSmartSettings'

const saveSettings = vi.fn()
const markRestartBaseline = vi.fn()
const coreAction = vi.fn()
let mockRestartBaseline: any = { projectionWidth: 800, bindings: { back: 'KeyB' } }

const { sessionsOpen } = vi.hoisted(() => ({ sessionsOpen: { value: true } }))

vi.mock('@store/store', () => ({
  coreAction: (action: unknown) => coreAction(action),
  useLiviStore: (selector: (s: any) => unknown) =>
    selector({
      saveSettings,
      restartBaseline: mockRestartBaseline,
      markRestartBaseline
    }),
  useSessionsOpen: () => sessionsOpen.value
}))

vi.mock('../../constants', () => ({
  requiresRestartParams: ['projectionWidth', 'bindings', 'carplayIcon180', 'wifiChannel']
}))

describe('useSmartSettings', () => {
  beforeEach(async () => {
    saveSettings.mockReset()
    markRestartBaseline.mockReset()
    coreAction.mockReset().mockResolvedValue(undefined)
    mockRestartBaseline = { projectionWidth: 800, bindings: { back: 'KeyB' } }
  })

  test('handleFieldChange updates state and persists settings', async () => {
    const initial = { projectionWidth: 800, 'bindings.back': 'KeyB' } as any
    const settings = { projectionWidth: 800, bindings: { back: 'KeyB' } } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))

    act(() => {
      result.current.handleFieldChange('projectionWidth', 900)
    })

    expect(result.current.state.projectionWidth).toBe(900)
    expect(saveSettings).toHaveBeenCalled()
    expect(result.current.isDirty).toBe(true)
  })

  test('requestRestart ignores bindings paths but marks relevant paths', async () => {
    const initial = { projectionWidth: 800, 'bindings.back': 'KeyB' } as any
    const settings = { projectionWidth: 800 } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))

    act(() => result.current.requestRestart('bindings.back'))
    expect(result.current.needsRestart).toBe(false)

    act(() => result.current.requestRestart('projectionWidth'))
    expect(result.current.needsRestart).toBe(true)
  })

  test('restart asks core to apply the settings when a restart is needed', async () => {
    const initial = { projectionWidth: 800 } as any
    const settings = { projectionWidth: 800 } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))
    act(() => result.current.requestRestart('projectionWidth'))
    await act(async () => {
      await result.current.restart()
    })
    expect(coreAction).toHaveBeenCalledWith({ kind: 'applySettings' })
    expect(markRestartBaseline).toHaveBeenCalled()
  })

  test('a refused restart keeps the restart pending', async () => {
    coreAction.mockRejectedValue(new Error('core is not connected'))
    const initial = { projectionWidth: 800 } as any
    const settings = { projectionWidth: 800 } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))
    act(() => result.current.requestRestart('projectionWidth'))
    await act(async () => {
      expect(await result.current.restart()).toBe(false)
    })
    expect(markRestartBaseline).not.toHaveBeenCalled()
    expect(result.current.needsRestart).toBe(true)
  })

  test('restart returns false when needsRestart is false', async () => {
    const initial = { projectionWidth: 800 } as any
    const settings = { projectionWidth: 800 } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))
    await act(async () => {
      expect(await result.current.restart()).toBe(false)
    })
    expect(coreAction).not.toHaveBeenCalled()
  })

  test('needsRestartFromConfig detects when settings differ from restartBaseline', async () => {
    // The store mock's restartBaseline has projectionWidth 800.
    const initial = { projectionWidth: 900 } as any
    const settings = { projectionWidth: 900 } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))
    expect(result.current.needsRestart).toBe(true)
  })

  test('with no phone connected nothing waits for apply', async () => {
    mockRestartBaseline = { carplayIcon180: '', wifiChannel: 36 }
    sessionsOpen.value = false

    const changed = { carplayIcon180: 'b64', wifiChannel: 149 } as any
    const idle = renderHook(() => useSmartSettings(changed, changed))
    expect(idle.result.current.needsRestart).toBe(false)

    sessionsOpen.value = true
    const projecting = renderHook(() => useSmartSettings(changed, changed))
    expect(projecting.result.current.needsRestart).toBe(true)
  })

  test('handleFieldChange with transform override applies transformation', async () => {
    const initial = { volume: 50 } as any
    const settings = { volume: 50 } as any
    const transform = vi.fn((v: unknown) => (v as number) * 2)
    const { result } = renderHook(() =>
      useSmartSettings(initial, settings, {
        overrides: { volume: { transform } }
      })
    )

    act(() => {
      result.current.handleFieldChange('volume', 10)
    })

    expect(transform).toHaveBeenCalledWith(10, 50)
    expect(result.current.state.volume).toBe(20)
  })

  test('handleFieldChange with validate override blocks invalid values', async () => {
    const initial = { volume: 50 } as any
    const settings = { volume: 50 } as any
    const validate = vi.fn(() => false)
    const { result } = renderHook(() =>
      useSmartSettings(initial, settings, {
        overrides: { volume: { validate } }
      })
    )

    act(() => {
      result.current.handleFieldChange('volume', 999)
    })

    expect(validate).toHaveBeenCalled()
    expect(result.current.state.volume).toBe(50)
  })

  test('requestRestart with no path treats it as restart-relevant', async () => {
    const initial = { projectionWidth: 800 } as any
    const settings = { projectionWidth: 800 } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))

    act(() => result.current.requestRestart())
    expect(result.current.needsRestart).toBe(true)
  })

  test('needsRestartFromConfig skips bindings keys and tolerates nullish settings and baseline', async () => {
    mockRestartBaseline = null
    const initial = {} as any
    const { result } = renderHook(() => useSmartSettings(initial, null as any))
    expect(result.current.needsRestart).toBe(false)
  })

  test('handleFieldChange clones an empty object when settings is nullish', async () => {
    const initial = { projectionWidth: 800 } as any
    const { result } = renderHook(() => useSmartSettings(initial, null as any))

    act(() => {
      result.current.handleFieldChange('projectionWidth', 640)
    })

    expect(result.current.state.projectionWidth).toBe(640)
    expect(saveSettings).toHaveBeenCalledWith({ projectionWidth: 640 })
  })

  test('resetState restores the provided initial state', async () => {
    const initial = { projectionWidth: 800 } as any
    const settings = { projectionWidth: 800 } as any
    const { result } = renderHook(() => useSmartSettings(initial, settings))

    act(() => {
      result.current.handleFieldChange('projectionWidth', 900)
    })
    expect(result.current.state.projectionWidth).toBe(900)

    act(() => {
      result.current.resetState()
    })
    expect(result.current.state.projectionWidth).toBe(800)
  })
})
