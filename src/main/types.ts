import type { Config } from '@shared/types'

export interface runtimeStateProps {
  config: Config
  isQuitting: boolean
  suppressNextFsSync: boolean
  wmExitedKiosk: boolean
}
