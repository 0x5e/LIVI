import { MIN_HEIGHT, MIN_WIDTH } from '@main/constants'
import { saveSettings } from '@main/ipc/utils'
import { runtimeStateProps } from '@main/types'
import { isMacPlatform, pushSettingsToRenderer } from '@main/utils'
import { getMainWindow } from '@main/window/createWindow'
import type { Config, WindowBounds } from '@shared/types'
import { BrowserWindow, screen } from 'electron'

export function applyAspectRatioFullscreen(
  win: BrowserWindow,
  width: number,
  height: number
): void {
  const ratio = width && height ? width / height : 0
  win.setAspectRatio(ratio, { width: 0, height: 0 })
}

export function applyAspectRatioWindowed(win: BrowserWindow, width: number, height: number): void {
  if (!width || !height) {
    win.setAspectRatio(0)
    win.setMinimumSize(0, 0)
    return
  }
  const [winW, winH] = win.getSize()
  const [contentW, contentH] = win.getContentSize()
  const extraW = Math.max(0, winW - contentW)
  const extraH = Math.max(0, winH - contentH)

  win.setAspectRatio(0)
  win.setMinimumSize(MIN_WIDTH + extraW, MIN_HEIGHT + extraH)
}

export function applyWindowedContentSize(win: BrowserWindow, w: number, h: number) {
  if (process.platform === 'linux') {
    const d = screen.getDisplayMatching(win.getBounds())
    const work = d.workAreaSize

    const dipW = Math.max(1, Math.min(Math.round(w), work.width))
    const dipH = Math.max(1, Math.min(Math.round(h), work.height))

    win.setResizable(true)
    win.setMinimumSize(0, 0)

    win.setContentSize(dipW, dipH, false)
    applyAspectRatioWindowed(win, dipW, dipH)
    return
  }

  // non-Linux
  win.setContentSize(w, h, false)
  applyAspectRatioWindowed(win, w, h)
}

// Guards against monitors being unplugged/rearranged so a window never opens off-screen.
export function sanitizeBounds(b?: WindowBounds): WindowBounds | undefined {
  if (
    !b ||
    typeof b.x !== 'number' ||
    typeof b.y !== 'number' ||
    typeof b.width !== 'number' ||
    typeof b.height !== 'number' ||
    b.width < 1 ||
    b.height < 1
  ) {
    return undefined
  }
  const MIN_VISIBLE = 64
  const displays = typeof screen?.getAllDisplays === 'function' ? screen.getAllDisplays() : []
  for (const d of displays) {
    const wa = d.workArea
    const overlapW = Math.min(b.x + b.width, wa.x + wa.width) - Math.max(b.x, wa.x)
    const overlapH = Math.min(b.y + b.height, wa.y + wa.height) - Math.max(b.y, wa.y)
    if (overlapW >= MIN_VISIBLE && overlapH >= MIN_VISIBLE) return b
  }
  // No display info available (e.g. headless/test) -> trust the saved rect as-is.
  return displays.length === 0 ? b : undefined
}

export function getMainKiosk(config: Config): boolean {
  return config.kiosk?.main === true
}

export function withMainKiosk(config: Config, value: boolean): Config['kiosk'] {
  const prev = config.kiosk ?? { main: false, dash: false, aux: false }
  return { ...prev, main: value }
}

export function currentKiosk(config: Config): boolean {
  const win: BrowserWindow | null = getMainWindow()
  // mac and the nested compositor both express kiosk as host-window fullscreen, not setKiosk
  const viaFullscreen = isMacPlatform() || process.env.LIVI_COMPOSITOR === '1'

  if (win && !win.isDestroyed()) {
    return viaFullscreen ? win.isFullScreen() : win.isKiosk()
  }
  return getMainKiosk(config)
}

export function persistKioskAndBroadcast(kiosk: boolean, runtimeState: runtimeStateProps) {
  if (getMainKiosk(runtimeState.config) === kiosk) {
    pushSettingsToRenderer(runtimeState, { kiosk: withMainKiosk(runtimeState.config, kiosk) })
    return
  }

  runtimeState.wmExitedKiosk = false
  saveSettings(runtimeState, { kiosk: withMainKiosk(runtimeState.config, kiosk) })
}

export function restoreKioskAfterWmExit(runtimeState: runtimeStateProps) {
  const mainWindow: BrowserWindow | null = getMainWindow()

  if (process.platform !== 'linux') return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!runtimeState.wmExitedKiosk) return

  runtimeState.wmExitedKiosk = false

  try {
    mainWindow.setKiosk(true)
  } catch {}

  saveSettings(runtimeState, { kiosk: withMainKiosk(runtimeState.config, true) })
}

export function attachKioskStateSync(runtimeState: runtimeStateProps) {
  const win: BrowserWindow | null = getMainWindow()

  if (process.platform !== 'linux') return
  if (!win) return

  let lastSent: boolean | null = null

  const push = (effectiveKiosk: boolean) => {
    if (lastSent === effectiveKiosk) return
    lastSent = effectiveKiosk

    // Window fullscreen state already matches config: nothing to persist, just refresh the UI.
    if (effectiveKiosk === getMainKiosk(runtimeState.config)) {
      pushSettingsToRenderer(runtimeState, {
        kiosk: withMainKiosk(runtimeState.config, effectiveKiosk)
      })
      return
    }

    // Window fullscreen diverged from config, reconcile it. Leaving kiosk is a WM pull-out
    // (swipe gesture), flag it so focus restores kiosk. Entering from outside Electron (the
    // compositor titlebar button) just persists so the settings slider can toggle it back.
    if (!effectiveKiosk) {
      runtimeState.wmExitedKiosk = true
    }
    saveSettings(runtimeState, { kiosk: withMainKiosk(runtimeState.config, effectiveKiosk) })
  }

  const syncFromElectron = () => {
    if (win.isDestroyed()) return
    push(process.env.LIVI_COMPOSITOR === '1' ? win.isFullScreen() : win.isKiosk())
  }

  win.on('enter-full-screen', syncFromElectron)
  win.on('leave-full-screen', syncFromElectron)
  win.on('resize', syncFromElectron)
  win.on('move', syncFromElectron)
  win.on('show', syncFromElectron)

  win.on('focus', () => {
    restoreKioskAfterWmExit(runtimeState)
  })

  win.on('blur', syncFromElectron)
  win.on('restore', syncFromElectron)
  win.on('minimize', syncFromElectron)

  syncFromElectron()
}

// Nudges Chromium to re-render at the new window size after a resize settles.
export function attachResizeReflow() {
  if (process.env.LIVI_COMPOSITOR !== '1') return
  const win: BrowserWindow | null = getMainWindow()
  if (!win) return

  let timer: ReturnType<typeof setTimeout> | null = null
  let nudging = false

  win.on('resize', () => {
    if (nudging || win.isDestroyed()) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isFullScreen()) return
      nudging = true
      const [w, h] = win.getContentSize()
      win.setContentSize(w, h + 1)
      setTimeout(() => {
        if (!win.isDestroyed()) win.setContentSize(w, h)
        setTimeout(() => {
          nudging = false
        }, 60)
      }, 60)
    }, 200)
  })
}

export const MIN_UI_VIEWPORT_HEIGHT = 292

export function uiZoomFactor(uiZoomPercent: number | undefined, contentHeight: number): number {
  const base = contentHeight > 0 ? Math.min(1, contentHeight / MIN_UI_VIEWPORT_HEIGHT) : 1
  return ((uiZoomPercent ?? 100) / 100) * base
}
