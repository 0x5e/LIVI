import { render } from '@testing-library/react'

const setClusterDashboardActive = vi.fn()

vi.mock('@store/store', () => ({
  useStatusStore: (selector: (s: { setClusterDashboardActive: (v: boolean) => void }) => unknown) =>
    selector({ setClusterDashboardActive })
}))

import { ClusterStreamView } from '../ClusterStreamView'

describe('ClusterStreamView', () => {
  beforeEach(() => {
    setClusterDashboardActive.mockClear()
  })

  test('marks the cluster dashboard active on mount and inactive on unmount', () => {
    const { unmount } = render(<ClusterStreamView />)

    expect(setClusterDashboardActive).toHaveBeenCalledWith(true)

    setClusterDashboardActive.mockClear()
    unmount()

    expect(setClusterDashboardActive).toHaveBeenCalledWith(false)
  })

  test('renders an empty cluster-only box', () => {
    const { container } = render(<ClusterStreamView />)

    expect(container.textContent).toBe('')
    expect(container.querySelector('div')).not.toBeNull()
  })
})
