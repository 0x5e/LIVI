import type { SpeedUnit, TemperatureUnit } from '@shared/types'

export const KM_PER_MILE = 1.609344

export const speedIn = (kph: number, unit: SpeedUnit): number =>
  unit === 'mph' ? kph / KM_PER_MILE : kph

export const speedSuffix = (unit: SpeedUnit): string => (unit === 'mph' ? 'mph' : 'km/h')

export const temperatureIn = (celsius: number, unit: TemperatureUnit): number =>
  unit === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius

export const temperatureSuffix = (unit: TemperatureUnit): string =>
  unit === 'fahrenheit' ? '°F' : '°C'
