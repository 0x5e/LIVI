import { runtimeStateProps } from '@main/types'
import { sizesEqual } from '@main/utils'
import { getMainWindow } from '@main/window/createWindow'
import {
  applyAspectRatioFullscreen,
  applyAspectRatioWindowed,
  applyWindowedContentSize,
  uiZoomFactor
} from '@main/window/utils'
import type { Config } from '@shared/types'
import { screen } from 'electron'
import { EventEmitter } from 'events'

export const configEvents = new EventEmitter()

export function applyConfig(runtimeState: runtimeStateProps, next: Config) {
  const mainWindow = getMainWindow()
  const prev = runtimeState.config
  runtimeState.config = next

  configEvents.emit('changed', next, prev)

  if (!mainWindow) return

  mainWindow.webContents.setZoomFactor(
    uiZoomFactor(runtimeState.config.uiZoomPercent, mainWindow.getContentSize()[1])
  )

  const sizeChanged = !sizesEqual(prev, runtimeState.config)
  const prevMainKiosk = prev.kiosk?.main === true
  const nextMainKiosk = runtimeState.config.kiosk?.main === true
  const kioskChanged = prevMainKiosk !== nextMainKiosk

  if (process.platform === 'darwin') {
    const wantFs = nextMainKiosk
    const isFs = mainWindow.isFullScreen()

    if (kioskChanged) {
      if (wantFs) {
        if (sizeChanged) {
          applyWindowedContentSize(
            mainWindow,
            runtimeState.config.mainScreenWidth || 800,
            runtimeState.config.mainScreenHeight || 480
          )
          applyAspectRatioFullscreen(
            mainWindow,
            runtimeState.config.mainScreenWidth || 800,
            runtimeState.config.mainScreenHeight || 480
          )
        }
        if (!isFs) mainWindow.setFullScreen(true)
      } else {
        if (isFs) mainWindow.setFullScreen(false)
        if (sizeChanged) {
          applyWindowedContentSize(
            mainWindow,
            runtimeState.config.mainScreenWidth || 800,
            runtimeState.config.mainScreenHeight || 480
          )
        }
      }
    } else if (sizeChanged) {
      if (wantFs) {
        applyWindowedContentSize(
          mainWindow,
          runtimeState.config.mainScreenWidth || 800,
          runtimeState.config.mainScreenHeight || 480
        )
        applyAspectRatioFullscreen(
          mainWindow,
          runtimeState.config.mainScreenWidth || 800,
          runtimeState.config.mainScreenHeight || 480
        )
      } else {
        applyWindowedContentSize(
          mainWindow,
          runtimeState.config.mainScreenWidth || 800,
          runtimeState.config.mainScreenHeight || 480
        )
      }
    }
  } else {
    const win = mainWindow

    if (process.env.LIVI_COMPOSITOR === '1') {
      // The compositor owns the window size, only fullscreen is ours.
      if (kioskChanged) win.setFullScreen(nextMainKiosk)
      return
    }

    if (kioskChanged) {
      const leavingKiosk = !nextMainKiosk

      applyAspectRatioWindowed(win, 0, 0)

      win.setKiosk(nextMainKiosk)

      if (leavingKiosk) {
        const onResize = () => {
          win.removeListener('resize', onResize)
          applyWindowedContentSize(
            win,
            runtimeState.config.mainScreenWidth,
            runtimeState.config.mainScreenHeight
          )
        }
        win.on('resize', onResize)

        setImmediate(() => {
          if (win.isDestroyed()) return
          applyWindowedContentSize(
            win,
            runtimeState.config.mainScreenWidth,
            runtimeState.config.mainScreenHeight
          )
        })
      } else {
        const d = screen.getDisplayMatching(win.getBounds())
        const wa = d.workAreaSize

        win.setContentSize(wa.width, wa.height)
      }
      return
    }
    if (sizeChanged && !nextMainKiosk) {
      applyWindowedContentSize(
        win,
        runtimeState.config.mainScreenWidth,
        runtimeState.config.mainScreenHeight
      )
    }
  }
}
