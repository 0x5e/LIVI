import { registerAppIpc } from '@main/ipc/app'
import { runtimeStateProps } from '@main/types'

export function registerIpc(runtimeState: runtimeStateProps) {
  registerAppIpc(runtimeState)
}
