vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '/repo' }
}))

vi.mock('fs', () => {
  const __m = { existsSync: vi.fn(() => false) }
  return { ...__m, default: __m }
})

import { app } from 'electron'
import fs from 'fs'
import type { Mock } from 'vitest'
import { gstEnv, resolveBinary, resolveGStreamerRoot } from '../gstreamer'

describe('gstEnv', () => {
  const origPlatform = process.platform
  const setPlatform = (p: NodeJS.Platform) =>
    Object.defineProperty(process, 'platform', { value: p, configurable: true })
  afterEach(() => setPlatform(origPlatform))

  test('linux sets LD_LIBRARY_PATH', () => {
    setPlatform('linux')
    const env = gstEnv('/opt/gst')
    expect(env.LD_LIBRARY_PATH).toBe('/opt/gst/lib')
    expect(env.GST_PLUGIN_PATH).toBe('/opt/gst/lib/gstreamer-1.0')
    expect(env.GST_PLUGIN_SYSTEM_PATH).toBe('')
  })

  test('darwin sets DYLD_LIBRARY_PATH', () => {
    setPlatform('darwin')
    const env = gstEnv('/opt/gst')
    expect(env.DYLD_LIBRARY_PATH).toBe('/opt/gst/lib')
  })
})

describe('resolveGStreamerRoot / resolveBinary', () => {
  const origPlatform = process.platform
  const origArch = process.arch
  const setPlatform = (p: NodeJS.Platform) =>
    Object.defineProperty(process, 'platform', { value: p, configurable: true })
  const setArch = (a: NodeJS.Architecture) =>
    Object.defineProperty(process, 'arch', { value: a, configurable: true })
  afterEach(() => {
    setPlatform(origPlatform)
    setArch(origArch)
  })

  test('unsupported platform returns null', () => {
    setPlatform('freebsd' as NodeJS.Platform)
    expect(resolveGStreamerRoot()).toBeNull()
  })

  test('unsupported arch returns null on supported platform', () => {
    setPlatform('linux')
    setArch('ia32' as NodeJS.Architecture)
    expect(resolveGStreamerRoot()).toBeNull()
  })

  test('resolveBinary returns null when root cannot be resolved', () => {
    setPlatform('freebsd' as NodeJS.Platform)
    expect(resolveBinary('gst-launch-1.0')).toBeNull()
    expect(resolveBinary('gst-device-monitor-1.0')).toBeNull()
  })

  test('resolves the bundled dev root and its binaries on linux x64', () => {
    setPlatform('linux')
    setArch('x64')
    ;(fs.existsSync as Mock).mockReturnValueOnce(true)
    expect(resolveGStreamerRoot()).toBe('/repo/assets/gstreamer/linux-x64')
    ;(fs.existsSync as Mock).mockReturnValueOnce(true)
    expect(resolveBinary('gst-launch-1.0')).toBe(
      '/repo/assets/gstreamer/linux-x64/bin/gst-launch-1.0'
    )
  })

  test('resolves the packaged root from resourcesPath', () => {
    const originalResources = process.resourcesPath
    setPlatform('linux')
    setArch('arm64')
    ;(app as { isPackaged: boolean }).isPackaged = true
    ;(process as { resourcesPath?: string }).resourcesPath = '/res'
    ;(fs.existsSync as Mock).mockReturnValueOnce(true)
    try {
      expect(resolveGStreamerRoot()).toBe('/res/gstreamer/linux-arm64')
    } finally {
      ;(app as { isPackaged: boolean }).isPackaged = false
      ;(process as { resourcesPath?: string }).resourcesPath = originalResources
    }
  })

  test('resolves the macos bundle dir', () => {
    setPlatform('darwin')
    ;(fs.existsSync as Mock).mockReturnValueOnce(true)
    expect(resolveGStreamerRoot()).toBe('/repo/assets/gstreamer/macos-arm64')
  })

  test('returns null when the bundle is missing on disk', () => {
    setPlatform('linux')
    setArch('x64')
    expect(resolveGStreamerRoot()).toBeNull()
  })
})
