import { UpdatePhases } from './types'

export const INSTALL_PHASES: readonly UpdatePhases[] = [
  UpdatePhases.mounting,
  UpdatePhases.copying,
  UpdatePhases.unmounting,
  UpdatePhases.installing,
  UpdatePhases.relaunching
]
