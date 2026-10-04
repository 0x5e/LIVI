import type { Config, DeviceView } from '@shared/types'
import type { MultiTouchPoint } from '@shared/types/TouchTypes'

declare global {
  type UpdateEvent =
    | {
        phase:
          | 'start'
          | 'ready'
          | 'mounting'
          | 'copying'
          | 'unmounting'
          | 'installing'
          | 'relaunching'
      }
    | { phase: 'error'; message?: string }

  type UpdateProgress = {
    phase: 'download'
    percent?: number
    received?: number
    total?: number
  }

  const __BUILD_SHA__: string
  const __BUILD_RUN__: string
  const __BUILD_BRANCH__: string
}

type MediaPayload = {
  timestamp: string
  payload: {
    type: number
    media?: {
      MediaSongName?: string
      MediaAlbumName?: string
      MediaArtistName?: string
      MediaAPPName?: string
      MediaSongDuration?: number
      MediaSongPlayTime?: number
      MediaPlayStatus?: number
      MediaLyrics?: string
    }
    base64Image?: string
  }
} | null

declare global {
  interface Window {
    projection: {
      settings: {
        get(): Promise<Config>
        save(settings: Partial<Config>): Promise<void>
        onUpdate(
          callback: (event: import('electron').IpcRendererEvent, settings: Config) => void
        ): () => void
        onLinkSpeed(
          callback: (
            event: import('electron').IpcRendererEvent,
            speed: { downMbps: number; upMbps: number; downRate: number; upRate: number } | null
          ) => void
        ): () => void
      }
      audio: {
        listSinks(): Promise<
          Array<{ id: string; name: string; isDefault: boolean; offline?: boolean }>
        >
        listSources(): Promise<
          Array<{ id: string; name: string; isDefault: boolean; offline?: boolean }>
        >
      }
      ipc: {
        start(): Promise<void>
        stop(): Promise<void>
        restart(): Promise<void>
        setVisible(visible: boolean): Promise<void>
        sendFrame(): Promise<void>

        sendTouch(x: number, y: number, action: number): void
        sendMultiTouch(points: MultiTouchPoint[]): void
        sendCommand(key: string): void

        onEvent(callback: (event: unknown, ...args: unknown[]) => void): () => void

        onTelemetry(handler: (payload: unknown) => void): void
        offTelemetry(handler: (payload: unknown) => void): void
        getTelemetrySnapshot(): Promise<unknown>

        setVisualizerEnabled(enabled: boolean): void

        readMedia(): Promise<MediaPayload>
        readNavigation(): Promise<unknown>

        onAudioChunk(handler: (payload: unknown) => void): void
        offAudioChunk(handler: (payload: unknown) => void): void

        requestCluster(enabled: boolean): Promise<{ ok: boolean; enabled: boolean }>
        onClusterResolution(handler: (payload: unknown) => void): () => void

        connectBluetoothPairedDevice(mac: string): Promise<{ ok: boolean }>

        cycleSession(): Promise<void>
        getDevices(): Promise<DeviceView[]>
      }
    }

    app: {
      platform: NodeJS.Platform
      compositor: boolean
      notifyUserActivity(): void
      reportPath(path: string): void
      customPageUrl(): Promise<string | null>
      customIconUrl(): Promise<string | null>
      quitApp(): Promise<void>
      restartApp(): Promise<void>
      getVersion(): Promise<string>
      listDisplayModes(): Promise<string[]>
      listWifiChannels(): Promise<number[]>
      listWifiCountryCodes(): Promise<string[]>
      listWifiInterfaces(): Promise<string[]>
      listBtAdapters(): Promise<string[]>
      dongleRadios(): Promise<{ wifi: boolean | null; bt: boolean | null }>
      switchDongleRadio(radio: 'wifi' | 'bt', on: boolean): Promise<void>
      getLatestRelease(): Promise<{
        version?: string
        url?: string
        commit?: string
        run?: string
      }>
      performUpdate(imageUrl?: string): Promise<void>
      onUpdateEvent(cb: (payload: UpdateEvent) => void): () => void
      onUpdateProgress(cb: (payload: UpdateProgress) => void): () => void
      beginInstall(): Promise<void>
      abortUpdate(): Promise<void>
      broadcastMediaKey(command: string): void
      onMediaKey(handler: (command: string) => void): () => void
    }
  }
}

export {}
