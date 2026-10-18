import { coreAction } from '@store/store'

let fired = false

export function PowerOff(): null {
  if (fired) return null
  fired = true
  coreAction({ kind: 'quit' }).catch(console.error)
  return null
}

export function __resetPowerOffGuardForTests(): void {
  fired = false
}
