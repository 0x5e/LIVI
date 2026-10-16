import type { Dab, DabStation } from '@shared/core/contract'

export const station = (serviceId: number, label: string, favorite = false): DabStation => ({
  serviceId,
  label,
  shortLabel: label,
  ensemble: 'DR Deutschland',
  channel: '5C',
  frequencyHz: 178_352_000,
  favorite,
  hidden: false
})

export const dab = (patch: Partial<Dab> = {}): Dab => ({
  receiver: 'NESDR SMArt v5',
  stations: [],
  lastStation: null,
  scan: null,
  active: false,
  station: null,
  playing: false,
  text: null,
  signal: { locked: false, quality: 0 },
  error: null,
  gainsDb: [],
  ...patch
})
