import type { Config } from '@shared/types'

declare global {
  const __BUILD_SHA__: string
  const __BUILD_RUN__: string
  const __BUILD_BRANCH__: string
}

declare global {
  interface Window {
    core: {
      connect(
        client: string,
        onMessage: (msg: import('@shared/core/contract').FromCore) => void,
        onClose?: () => void
      ): {
        send(msg: import('@shared/core/contract').ToCore): boolean
        close(): void
      }
    }

    projection: {
      ipc: {
        clusterRepaintNudge(): Promise<{ ok: boolean }>
      }
    }

    app: {
      platform: NodeJS.Platform
      compositor: boolean
      notifyUserActivity(): void
      customPageUrl(): Promise<string | null>
      customIconUrl(): Promise<string | null>
      getVersion(): Promise<string>
      broadcastMediaKey(command: string): void
      onMediaKey(handler: (command: string) => void): () => void
    }
  }
}

export {}
