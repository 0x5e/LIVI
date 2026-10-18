import './logTimestamps'
import './app/gpu'
import { installMainProcessErrorHandlers } from '@main/app/errorHandler'
import { setupAppIdentity } from '@main/app/init'
import { setupLifecycle } from '@main/app/lifecycle'

installMainProcessErrorHandlers()

import { startCore } from '@main/core'
import { registerIpc } from '@main/ipc'
import {
  registerAppProtocol,
  seedCustomPage,
  setCustomPageConfig
} from '@main/protocol/appProtocol'
import { customProxy } from '@main/services/custom/CustomProxy'
import { runtimeStateProps } from '@main/types'
import { startVideo } from '@main/video'
import type { Config } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'
import { app } from 'electron'
import { applyConfig, configEvents } from './window/applyConfig'
import { createMainWindow, getMainWindow } from './window/createWindow'
import { setupSecondaryWindows } from './window/secondaryWindows'

let bootAllowed = true
if (!app.requestSingleInstanceLock()) {
  app.exit(0)
  bootAllowed = false
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}

app.whenReady().then(async () => {
  if (!bootAllowed) return

  const runtimeState: runtimeStateProps = {
    config: { ...DEFAULT_CONFIG },
    isQuitting: false,
    suppressNextFsSync: false,
    wmExitedKiosk: false
  }
  startVideo()
  await startCore(runtimeState, (next) => applyConfig(runtimeState, next))

  setCustomPageConfig(() => runtimeState.config)
  seedCustomPage()
  await customProxy.start(runtimeState.config.customUrl)
  configEvents.on('changed', (next: Config) => {
    void customProxy.start(next.customUrl)
  })

  setupAppIdentity()
  registerAppProtocol()
  registerIpc(runtimeState)
  createMainWindow(runtimeState)
  setupSecondaryWindows(runtimeState)
  setupLifecycle(runtimeState)
})
