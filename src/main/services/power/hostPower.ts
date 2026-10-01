// Host power, via the root helper.

import { spawn } from 'node:child_process'
import fs from 'node:fs'

const POWER_HELPER = '/usr/local/lib/livi/livi-power.sh'

export type PowerAction = 'poweroff' | 'reboot'

let pending: PowerAction | null = null

/** True on the appliance, where Power Off means the device and not just the app. */
export function hostPowerAvailable(): boolean {
  return process.env.LIVI_KIOSK === '1'
}

/** Remember what to do once the quit sequence has run. */
export function requestPowerAction(action: PowerAction): void {
  pending = action
}

/** Detached, so the helper outlives the process that asked for it. */
export function runPendingPowerAction(): void {
  const action = pending
  pending = null
  if (!action) return

  if (!fs.existsSync(POWER_HELPER)) {
    console.warn('[power] helper missing — re-run the installer to let LIVI power the host')
    return
  }
  try {
    spawn('sudo', ['-n', POWER_HELPER, action], { detached: true, stdio: 'ignore' }).unref()
    console.log(`[power] host ${action} requested`)
  } catch (e) {
    console.warn(`[power] could not ${action}:`, (e as Error).message)
  }
}
