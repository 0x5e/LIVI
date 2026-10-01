import { app } from 'electron'
import fs from 'fs'
import path from 'path'

function platformDir(): string | null {
  switch (process.platform) {
    case 'darwin':
      return 'macos-arm64'
    case 'linux':
      return process.arch === 'arm64' ? 'linux-arm64' : process.arch === 'x64' ? 'linux-x64' : null
    default:
      return null
  }
}

export function resolveGStreamerRoot(): string | null {
  const dir = platformDir()
  if (!dir) return null
  const base = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'assets')
  const bundled = path.join(base, 'gstreamer', dir)
  return fs.existsSync(bundled) ? bundled : null
}

export function resolveBinary(name: 'gst-launch-1.0' | 'gst-device-monitor-1.0'): string | null {
  const root = resolveGStreamerRoot()
  if (!root) return null
  return path.join(root, 'bin', name)
}

export function gstEnv(gstRoot: string): NodeJS.ProcessEnv {
  const pluginPath = path.join(gstRoot, 'lib', 'gstreamer-1.0')
  const pluginScanner = path.join(gstRoot, 'libexec', 'gstreamer-1.0', 'gst-plugin-scanner')
  const lcUtf8 = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8'
  const base = {
    ...process.env,
    LANG: lcUtf8,
    LC_ALL: lcUtf8,
    GST_PLUGIN_SYSTEM_PATH: '',
    GST_PLUGIN_PATH: pluginPath,
    GST_PLUGIN_SCANNER: pluginScanner
  }
  if (process.platform === 'darwin') {
    return { ...base, DYLD_LIBRARY_PATH: path.join(gstRoot, 'lib') }
  }
  return { ...base, LD_LIBRARY_PATH: path.join(gstRoot, 'lib') }
}
