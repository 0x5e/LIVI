import { coreAction } from '@store/store'

let fired = false

export function Restart(): null {
  if (fired) return null
  fired = true
  coreAction({ kind: 'restart' }).catch(console.error)
  return null
}

export function __resetRestartGuardForTests(): void {
  fired = false
}
