import { useLiviStore } from '@store/store'
import { dabSchema, loadGainOptions } from '../dabSchema'
import { generalSchema } from '../generalSchema'

const children = (dabSchema as { children: { path: string; type: string }[] }).children

describe('dabSchema', () => {
  test('sits under General between MFi and GPS', () => {
    expect(dabSchema).toEqual(
      expect.objectContaining({ type: 'route', route: 'dab', labelKey: 'settings.dab' })
    )
    const general = (generalSchema as { children: { route?: string }[] }).children
    const routes = general.map((c) => c.route)
    const at = routes.indexOf('dab')
    expect(routes.slice(at - 1, at + 2)).toEqual(['mfi', 'dab', 'gps'])
  })

  test('the receiver comes first, then rows like the rest of General', () => {
    expect(children.map((c) => c.type)).toEqual(['custom', 'route', 'checkbox', 'select', 'number'])
    expect(children.slice(2).map((c) => c.path)).toEqual(['dabGainAuto', 'dabGainDb', 'dabPpm'])
  })

  test('the gain offers the steps the tuner reports', async () => {
    useLiviStore.setState({ dab: null })
    expect(await loadGainOptions()).toEqual([])
    useLiviStore.setState({ dab: { gainsDb: [0, 19.7, 49.6] } as never })
    expect(await loadGainOptions()).toEqual([
      { value: 0, label: '0.0 dB' },
      { value: 19.7, label: '19.7 dB' },
      { value: 49.6, label: '49.6 dB' }
    ])
    useLiviStore.setState({ dab: null })
  })
})
