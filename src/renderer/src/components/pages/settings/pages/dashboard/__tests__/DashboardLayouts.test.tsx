import { fireEvent, render, screen } from '@testing-library/react'
import { DashboardLayouts } from '../DashboardLayouts'

let cluster: unknown = null
const coreAction = vi.fn(() => Promise.resolve())

vi.mock('@renderer/store/store', () => ({
  useLiviStore: (selector: (s: { cluster: unknown }) => unknown) => selector({ cluster }),
  coreAction: (action: unknown) => coreAction(action)
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key })
}))

const layout = (id: string) => ({ id, name: id.toUpperCase(), palettes: [], zones: [] })

const theme = {
  id: 'livi',
  displays: [{ id: 'Cluster_Display', kind: 'cluster', layouts: ['a', 'b'].map(layout) }],
  palettes: []
}

describe('DashboardLayouts', () => {
  beforeEach(() => {
    coreAction.mockClear()
    cluster = {
      theme,
      layout: 'a',
      palette: '',
      palettes: {},
      shown: ['b', 'a'],
      arranged: [
        { id: 'b', on: true },
        { id: 'a', on: false },
        { id: 'x', on: true }
      ],
      appearance: 'automatic'
    }
  })

  test("lists core's arrangement and asks core to move and switch", () => {
    render(<DashboardLayouts />)
    expect(screen.getAllByText(/^(A|B|x)$/).map((n) => n.textContent)).toEqual(['B', 'A', 'x'])
    expect(screen.getByLabelText('A')).not.toBeChecked()

    fireEvent.click(screen.getAllByLabelText('settings.moveUp')[1])
    expect(coreAction).toHaveBeenLastCalledWith({ kind: 'moveClusterLayout', layout: 'a', by: -1 })
    fireEvent.click(screen.getAllByLabelText('settings.moveDown')[0])
    expect(coreAction).toHaveBeenLastCalledWith({ kind: 'moveClusterLayout', layout: 'b', by: 1 })

    coreAction.mockReturnValueOnce(Promise.reject(new Error('core gone')))
    fireEvent.click(screen.getByLabelText('A'))
    expect(coreAction).toHaveBeenLastCalledWith({
      kind: 'showClusterLayout',
      layout: 'a',
      on: true
    })
    fireEvent.click(screen.getByLabelText('B'))
    expect(coreAction).toHaveBeenLastCalledWith({
      kind: 'showClusterLayout',
      layout: 'b',
      on: false
    })
  })

  test('shows nothing before core answers', () => {
    cluster = null
    render(<DashboardLayouts />)
    expect(screen.queryByLabelText('settings.moveUp')).toBeNull()
  })
})
