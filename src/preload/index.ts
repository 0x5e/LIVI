import type { FromCore, ToCore } from '@shared/core/contract'
import { CoreLink, coreSocketPath } from '@shared/core/link'
import { contextBridge, ipcRenderer } from 'electron'

// The renderer talks to core itself, Electron main only keeps the windows.
contextBridge.exposeInMainWorld('core', {
  connect: (client: string, onMessage: (msg: FromCore) => void, onClose?: () => void) => {
    const link = new CoreLink({ path: coreSocketPath(), client, onMessage, onClose })
    // A reload starts a new link, the old one must not linger.
    ;(globalThis as unknown as EventTarget).addEventListener('pagehide', () => link.close())
    return {
      send: (msg: ToCore): boolean => link.send(msg),
      close: (): void => link.close()
    }
  }
})

type MediaKeyHandler = (command: string) => void
const mediaKeyHandlers: MediaKeyHandler[] = []
let mediaKeyQueue: string[] = []

ipcRenderer.on('app:media-key', (_event, command: unknown) => {
  if (typeof command !== 'string' || !command) return
  if (mediaKeyHandlers.length) {
    mediaKeyHandlers.forEach((h) => h(command))
  } else {
    mediaKeyQueue.push(command)
  }
})

const api = {
  ipc: {
    // macOS only. Nudges the window a pixel so a stale paint stops hiding the cluster plane.
    clusterRepaintNudge: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('cluster:repaint-nudge')
  }
}

contextBridge.exposeInMainWorld('projection', api)

const appApi = {
  platform: process.platform,
  compositor: process.env.LIVI_COMPOSITOR === '1',
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  customPageUrl: (): Promise<string | null> => ipcRenderer.invoke('app:customPageUrl'),
  customIconUrl: (): Promise<string | null> => ipcRenderer.invoke('app:customIconUrl'),

  notifyUserActivity: (): void => {
    ipcRenderer.send('app:user-activity')
  },

  broadcastMediaKey: (command: string): void => {
    ipcRenderer.send('app:media-key', command)
  },

  onMediaKey: (handler: MediaKeyHandler): (() => void) => {
    mediaKeyHandlers.push(handler)
    if (mediaKeyQueue.length) {
      const drained = mediaKeyQueue
      mediaKeyQueue = []
      drained.forEach((cmd) => handler(cmd))
    }
    return () => {
      const i = mediaKeyHandlers.indexOf(handler)
      if (i >= 0) mediaKeyHandlers.splice(i, 1)
    }
  }
}

contextBridge.exposeInMainWorld('app', appApi)
