export enum UpdatePhases {
  start = 'start',
  download = 'download',
  ready = 'ready',
  installing = 'installing',
  relaunching = 'relaunching',
  error = 'error'
}

export const phaseMap: Record<UpdatePhases, string> = {
  download: 'Downloading',
  installing: 'Installing',
  relaunching: 'Relaunching',
  ready: 'Ready to install',
  start: 'Starting…',
  error: 'Error'
}

export enum UpgradeText {
  upgrade = 'Software Update',
  downgrade = 'Software Downgrade'
}
