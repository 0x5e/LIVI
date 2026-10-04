import { registerIpcHandle } from '@main/ipc/register'
import type { ProjectionIpcHost } from './types'

type Deps = Pick<
  ProjectionIpcHost,
  'start' | 'stop' | 'restartSession' | 'pickPreferredTransport' | 'setVideoVisible'
>

export function registerLifecycleIpc(host: Deps): void {
  registerIpcHandle('projection-start', async () => host.start())

  registerIpcHandle('projection-stop', async () => {
    if (host.pickPreferredTransport() === 'aa') return
    return host.stop()
  })

  registerIpcHandle('projection-restart', async () => host.restartSession())

  registerIpcHandle('projection-set-visible', async (_evt, visible: boolean) => {
    host.setVideoVisible(Boolean(visible))
  })
}
