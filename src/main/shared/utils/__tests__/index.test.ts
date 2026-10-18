import * as sharedUtils from '@main/shared/utils'

describe('main/shared/utils index exports', () => {
  test('exports the url and cluster helpers', () => {
    expect(typeof sharedUtils.normalizeHttpUrl).toBe('function')
    expect(typeof sharedUtils.clusterTargetScreens).toBe('function')
  })
})
