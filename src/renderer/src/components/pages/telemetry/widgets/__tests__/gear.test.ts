import { normalizeGear } from '../gear'

describe('normalizeGear', () => {
  test.each([
    ['NEUTRAL', 'N'],
    ['REVERSE', 'R'],
    ['PARK', 'P'],
    ['DRIVE', 'D'],
    ['WINTER', 'W'],
    ['SPORT', 'S']
  ])('maps %s to %s', (gear, short) => {
    expect(normalizeGear(gear)).toBe(short)
  })

  test('trims and uppercases what it does not know', () => {
    expect(normalizeGear('  r  ')).toBe('R')
    expect(normalizeGear('d')).toBe('D')
    expect(normalizeGear(3)).toBe('3')
  })

  test('shows a dash for an empty or unknown gear', () => {
    expect(normalizeGear(undefined)).toBe('—')
    expect(normalizeGear('')).toBe('—')
    expect(normalizeGear('unknown')).toBe('—')
  })
})
