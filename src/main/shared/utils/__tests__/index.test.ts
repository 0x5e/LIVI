import * as sharedUtils from '@main/shared/utils'

describe('main/shared/utils index exports', () => {
  test('exports the url helpers', () => {
    expect(typeof sharedUtils.normalizeHttpUrl).toBe('function')
  })
})
