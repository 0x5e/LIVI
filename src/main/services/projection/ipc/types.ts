import type { Config } from '@shared/types'
import type { WebContents } from 'electron'
import type { SendableMessage } from '../messages/sendable'
import type { DeviceView } from '../services/DeviceRegistry'
import type { LogicalStreamKey } from '../services/ProjectionAudio'
import type { PersistedMediaFile, PersistedNavigationFile } from '../services/types'
import type { Transport } from '../transport/types'

export type BtActionResponse = { ok: boolean; error?: string }

export interface ProjectionIpcHost {
  // Lifecycle / transport
  start(): Promise<void>
  stop(): Promise<void>
  restartSession(): Promise<void>
  setVideoVisible(visible: boolean): void
  pickPreferredTransport(): Transport | null
  getDevices(): DeviceView[]
  selectDevice(id: string): { ok: boolean }
  cycleSession(): void
  forgetDevice(id: string): { ok: boolean }

  // Driver send
  send(msg: SendableMessage): Promise<boolean>
  isUsingAa(): boolean
  isStarted(): boolean

  // Bluetooth
  connectBt(mac: string): Promise<BtActionResponse>
  refreshBtPaired(): void

  // Cluster
  getConfig(): Config
  setClusterRequested(id: number, wanted: boolean): void
  isMainClusterWindow(id: number): boolean
  isClusterRequested(): boolean
  setClusterVisible(v: boolean): void
  resetLastClusterVideoSize(): void
  getLastClusterVideoSize(): { width: number; height: number } | null
  getClusterTargetWebContents(): WebContents[]

  readActiveMedia(): PersistedMediaFile
  readActiveNav(): PersistedNavigationFile

  // Audio
  setAudioStreamVolume(stream: LogicalStreamKey, volume: number): void
  setAudioVisualizerEnabled(enabled: boolean, sourceId?: number): void
}
