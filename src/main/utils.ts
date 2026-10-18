import type { Config } from '@shared/types'
import { app } from 'electron'

export const isMacPlatform = () => process.platform === 'darwin'

export const isDev = () => !app.isPackaged

export function sizesEqual(a: Config, b: Config) {
  const aw = Number(a.mainScreenWidth) || 0
  const ah = Number(a.mainScreenHeight) || 0
  const bw = Number(b.mainScreenWidth) || 0
  const bh = Number(b.mainScreenHeight) || 0
  return aw === bw && ah === bh
}

export function setFeatureFlags(flags: string[]) {
  app.commandLine.appendSwitch('enable-features', flags.join(','))
}

export function linuxPresetAngleVulkan() {
  app.commandLine.appendSwitch('use-gl', 'angle')
  app.commandLine.appendSwitch('use-angle', 'vulkan')

  setFeatureFlags(['Vulkan', 'VulkanFromANGLE', 'DefaultANGLEVulkan'])
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
}
