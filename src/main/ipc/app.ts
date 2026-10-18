import { registerIpcHandle, registerIpcOn } from '@main/ipc/register'
import {
  CUSTOM_ICON_URL,
  CUSTOM_PAGE_URL,
  customIconExists,
  customPageExists
} from '@main/protocol/appProtocol'
import { customProxy } from '@main/services/custom/CustomProxy'
import { runtimeStateProps } from '@main/types'
import { broadcastToRenderers } from '@main/window/broadcast'
import { restoreKioskAfterWmExit } from '@main/window/utils'
import { app, BrowserWindow } from 'electron'

export function registerAppIpc(runtimeState: runtimeStateProps) {
  registerIpcHandle('app:getVersion', () => app.getVersion())

  registerIpcHandle('app:customPageUrl', async () => {
    const proxied = await customProxy.start(runtimeState.config.customUrl)
    if (proxied) return proxied
    return customPageExists() ? CUSTOM_PAGE_URL : null
  })

  registerIpcHandle('app:customIconUrl', () => (customIconExists() ? CUSTOM_ICON_URL : null))

  registerIpcOn('app:user-activity', () => {
    restoreKioskAfterWmExit(runtimeState)
  })

  registerIpcOn('app:media-key', (_evt, command: string) => {
    if (typeof command !== 'string' || !command) return
    broadcastToRenderers('app:media-key', command)
  })

  // macOS keeps a transparent window's stale paint, so a cluster plane stays hidden behind a
  // ghost until the surface is recreated. A 1px size nudge of the requesting window forces that.
  registerIpcHandle('cluster:repaint-nudge', async (evt) => {
    if (process.platform !== 'darwin') return { ok: false }
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win || win.isDestroyed()) return { ok: false }
    const [w, h] = win.getSize()
    win.setSize(w, h + 1)
    setTimeout(() => {
      if (!win.isDestroyed()) win.setSize(w, h)
    }, 60)
    return { ok: true }
  })
}
