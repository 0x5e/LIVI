import type { DeviceView } from '@shared/types'
import { coreAction, useLiviStore } from '@store/store'

export type { DeviceView }

export function useDevices(): DeviceView[] {
  return useLiviStore((s) => s.devices)
}

export function selectDevice(id: string): Promise<{ ok: boolean }> {
  return coreAction({ kind: 'selectDevice', id }).then(
    () => ({ ok: true }),
    () => ({ ok: false })
  )
}

export function forgetDevice(id: string): void {
  coreAction({ kind: 'forgetDevice', id }).catch(() => {})
}
