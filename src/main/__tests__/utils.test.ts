import { isMacPlatform, linuxPresetAngleVulkan, setFeatureFlags, sizesEqual } from '@main/utils'
import { app } from 'electron'

describe('main utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('isMacPlatform reflects current process platform', () => {
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      expect(isMacPlatform()).toBe(true)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  test('isMacPlatform is false on non-mac platforms', () => {
    const original = process.platform
    try {
      Object.defineProperty(process, 'platform', { value: 'linux' })
      expect(isMacPlatform()).toBe(false)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  test('sizesEqual compares normalized width and height', () => {
    expect(
      sizesEqual(
        { mainScreenWidth: 800, mainScreenHeight: 480 } as any,
        { mainScreenWidth: '800', mainScreenHeight: 480 } as any
      )
    ).toBe(true)
    expect(
      sizesEqual(
        { mainScreenWidth: 800, mainScreenHeight: 480 } as any,
        { mainScreenWidth: 801, mainScreenHeight: 480 } as any
      )
    ).toBe(false)
  })

  test('sizesEqual treats missing or invalid dimensions as zero', () => {
    expect(
      sizesEqual({ mainScreenWidth: undefined, mainScreenHeight: undefined } as any, {} as any)
    ).toBe(true)
    expect(
      sizesEqual(
        { mainScreenWidth: 'abc', mainScreenHeight: null } as any,
        { mainScreenWidth: 0, mainScreenHeight: 0 } as any
      )
    ).toBe(true)
    expect(
      sizesEqual(
        { mainScreenWidth: '', mainScreenHeight: 5 } as any,
        { mainScreenWidth: 0, mainScreenHeight: 0 } as any
      )
    ).toBe(false)
  })

  test('setFeatureFlags emits comma-joined enable-features switch', () => {
    setFeatureFlags(['A', 'B'])
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('enable-features', 'A,B')
  })

  test('linuxPresetAngleVulkan emits gpu switches and feature flags', () => {
    linuxPresetAngleVulkan()

    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('use-gl', 'angle')
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('use-angle', 'vulkan')
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('ozone-platform-hint', 'auto')
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith(
      'enable-features',
      expect.stringContaining('Vulkan')
    )
  })
})
