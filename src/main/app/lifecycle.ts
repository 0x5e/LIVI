import { stopCore } from '@main/core'
import { runtimeStateProps } from '@main/types'
import { createMainWindow, getMainWindow } from '@main/window/createWindow'
import { closeAllSecondaryWindows } from '@main/window/secondaryWindows'
import { app, BrowserWindow } from 'electron'

export function setupLifecycle(runtimeState: runtimeStateProps) {
  const mainWindow = getMainWindow()

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !mainWindow) createMainWindow(runtimeState)
    else mainWindow?.show()
  })

  app.on('before-quit', () => {
    runtimeState.isQuitting = true
    closeAllSecondaryWindows()
    stopCore()
  })
}
