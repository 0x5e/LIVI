import { registerIpcHandle } from '@main/ipc/register'
import type { ProjectionIpcHost } from './types'

type Deps = Pick<ProjectionIpcHost, 'getDevices' | 'selectDevice' | 'cycleSession' | 'forgetDevice'>

export function registerTransportIpc(host: Deps): void {
  registerIpcHandle('devices:list', async () => host.getDevices())
  registerIpcHandle('devices:select', async (_evt, id: string) => host.selectDevice(id))
  registerIpcHandle('devices:cycle', async () => host.cycleSession())
  registerIpcHandle('devices:forget', async (_evt, id: string) => host.forgetDevice(id))
}
