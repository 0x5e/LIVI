import { speedIn, speedSuffix, temperatureIn, temperatureSuffix } from '../units'

describe('units', () => {
  test('speed stays in km/h or turns into mph', () => {
    expect(speedIn(100, 'kmh')).toBe(100)
    expect(speedIn(160.9344, 'mph')).toBeCloseTo(100)
    expect([speedSuffix('kmh'), speedSuffix('mph')]).toEqual(['km/h', 'mph'])
  })

  test('temperature stays in °C or turns into °F', () => {
    expect(temperatureIn(21, 'celsius')).toBe(21)
    expect(temperatureIn(100, 'fahrenheit')).toBe(212)
    expect([temperatureSuffix('celsius'), temperatureSuffix('fahrenheit')]).toEqual(['°C', '°F'])
  })
})
