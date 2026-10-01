import type { EventEmitter } from 'node:events'
import type { InputCommand } from '@shared/types/InputCommand'
import type { SendableMessage } from '../messages/sendable.js'

/**
 * Common contract for the phone-projection drivers (aa, cp). Each driver is an EventEmitter that
 * pumps decoded messages ('message') and video codec/config events to ProjectionService.
 */
export interface IPhoneDriver extends EventEmitter {
  /** Tear down all driver resources. Idempotent. */
  close(): Promise<void>

  /** Send a message towards the phone. Resolves `true` if dispatched. */
  send(msg: SendableMessage): Promise<boolean>

  /** Forward an abstract input command (from BT AVRCP, CAN bridge, etc.) */
  handleInput(command: InputCommand): void

  /** Ask the phone to emit a fresh video keyframe (IDR) so a rebuilt decoder can start. */
  requestKeyframe?(): void

  /** Mark this phone's native video receivers active/inactive as the shared-plane feeders. */
  setVideoActive?(active: boolean): void

  /** Request focus for the secondary (cluster) video stream. */
  requestClusterFocus?(): void

  /** Sets the level of the driver's audio streams of this audioType. */
  setStreamVolume?(audioType: number, level: number, rampMs: number): void

  /** Soft-disconnect the current phone while keeping the driver armed. */
  disconnectPhone?(): Promise<boolean>
}
