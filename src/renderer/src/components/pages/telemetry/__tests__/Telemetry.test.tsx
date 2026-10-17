import { AppContext } from '@renderer/context'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { Telemetry } from '../Telemetry'

const useLiviStoreMock = vi.fn()
const useNavbarHiddenMock = vi.fn()
const useKeyboardNavigationMock = vi.fn()
const coreActionMock = vi.fn(() => Promise.resolve())

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (state: unknown) => unknown) => useLiviStoreMock(selector),
  coreAction: (action: unknown) => coreActionMock(action)
}))

vi.mock('@renderer/hooks/useNavbarHidden', () => ({
  useNavbarHidden: () => useNavbarHiddenMock()
}))

vi.mock('../hooks/useKeyboardNavigation', () => ({
  useKeyboardNavigation: (args: unknown) => useKeyboardNavigationMock(args)
}))

vi.mock('../layouts/ClusterLayoutView', () => ({
  ClusterLayoutView: ({ layout, accent }: { layout: string; accent?: string }) =>
    React.createElement(
      'div',
      { 'data-testid': 'cluster-layout', 'data-accent': String(accent) },
      layout
    )
}))

vi.mock('@renderer/components/pages/telemetry/components/DashboardPlaceholder', () => ({
  DashboardPlaceholder: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-testid': 'dashboard-placeholder' }, title)
}))

vi.mock('@renderer/components/pages/telemetry/components/pagination/pagination', () => ({
  DashboardsPagination: ({
    activeIndex,
    dotsLength,
    onSetIndex
  }: {
    activeIndex: number
    dotsLength: number
    onSetIndex: (index: number) => void
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          'data-testid': 'pagination',
          'data-active-index': activeIndex,
          'data-dots-length': dotsLength,
          onClick: () => onSetIndex(1)
        },
        'pagination'
      ),
      React.createElement('button', {
        'data-testid': 'past-end',
        onClick: () => onSetIndex(dotsLength)
      })
    )
}))

vi.mock('@renderer/context', async () => {
  const React = await import('react')
  return { AppContext: React.createContext({}) }
})

const theme = {
  id: 'livi',
  displays: [
    { id: 'Center_Display', kind: 'center', layouts: [] },
    {
      id: 'Cluster_Display',
      kind: 'cluster',
      layouts: [
        { id: 'a', name: 'A', palettes: ['default'], zones: [] },
        { id: 'b', name: 'B', palettes: ['blue'], zones: [] },
        { id: 'c', name: 'C', palettes: ['default'], zones: [] }
      ]
    }
  ],
  palettes: [{ id: 'blue', accentDark: '#63d2ffff', accentLight: '#57aaffff' }]
}

const withState = (layout: string, shown = ['a', 'b'], main = true) =>
  useLiviStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
    selector({
      settings: { dashboard: { main, cluster: false, aux: false } },
      cluster: { theme, layout, palette: 'blue', palettes: {}, shown, appearance: 'automatic' }
    })
  )

const renderWithContext = (ui: React.ReactElement, value: Record<string, unknown> = {}) =>
  render(
    <AppContext.Provider value={{ isTouchDevice: false, ...value } as never}>
      {ui}
    </AppContext.Provider>
  )

const navigation = (overrides: Record<string, unknown> = {}) => ({
  prev: vi.fn(),
  next: vi.fn(),
  canPrev: false,
  canNext: false,
  onPointerDown: vi.fn(),
  onPointerUp: vi.fn(),
  ...overrides
})

describe('Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNavbarHiddenMock.mockReturnValue({ isNavbarHidden: false, isNavPresent: true })
    useKeyboardNavigationMock.mockReturnValue(navigation())
    withState('a')
  })

  test('shows the active layout in its palette colour and steps through the shown ones', () => {
    coreActionMock.mockReturnValueOnce(Promise.reject(new Error('core gone')))
    renderWithContext(<Telemetry />)
    expect(screen.getByTestId('cluster-layout')).toHaveTextContent('a')
    expect(screen.getByTestId('cluster-layout')).toHaveAttribute('data-accent', '#57aaffff')
    expect(screen.getByTestId('pagination')).toHaveAttribute('data-dots-length', '2')
    fireEvent.click(screen.getByTestId('pagination'))
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'selectClusterLayout', layout: 'b' })
  })

  test('keys and swipes ask core for a step', () => {
    withState('b')
    renderWithContext(<Telemetry />)
    expect(screen.getByTestId('pagination')).toHaveAttribute('data-active-index', '1')
    const { count, onStep } = useKeyboardNavigationMock.mock.calls.at(-1)?.[0] as {
      count: number
      onStep: (by: -1 | 1) => void
    }
    expect(count).toBe(2)
    coreActionMock.mockReturnValueOnce(Promise.reject(new Error('core gone')))
    onStep(-1)
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'stepClusterLayout', by: -1 })
  })

  test('a dot past the end asks nothing', () => {
    renderWithContext(<Telemetry />)
    fireEvent.click(screen.getByTestId('past-end'))
    expect(coreActionMock).not.toHaveBeenCalled()
  })

  test('a layout the phone picked shows although it is not offered', () => {
    withState('c')
    renderWithContext(<Telemetry />)
    expect(screen.getByTestId('cluster-layout')).toHaveTextContent('c')
    expect(screen.getByTestId('pagination')).toHaveAttribute('data-active-index', '-1')
  })

  test('one offered layout needs no dots', () => {
    withState('a', ['a'])
    renderWithContext(<Telemetry />)
    expect(screen.queryByTestId('pagination')).toBeNull()
  })

  test('a screen without the dashboard says so', () => {
    withState('a', ['a', 'b'], false)
    renderWithContext(<Telemetry />)
    expect(screen.getByTestId('dashboard-placeholder')).toBeInTheDocument()
    expect(screen.queryByTestId('cluster-layout')).toBeNull()
    expect(screen.queryByTestId('pagination')).toBeNull()
  })

  test('nothing shows before core answers', () => {
    useLiviStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ settings: null, cluster: null })
    )
    renderWithContext(<Telemetry />)
    expect(screen.queryByTestId('cluster-layout')).toBeNull()
    expect(screen.getByTestId('dashboard-placeholder')).toBeInTheDocument()
  })

  test('passes the pager into the app context and takes it back on unmount', () => {
    const prev = vi.fn()
    const next = vi.fn()
    const onSetAppContext = vi.fn()
    useKeyboardNavigationMock.mockReturnValue(
      navigation({ prev, next, canPrev: true, canNext: true })
    )
    const { unmount } = renderWithContext(<Telemetry />, { onSetAppContext })
    expect(onSetAppContext).toHaveBeenCalledWith({
      telemetryPager: { prev, next, canPrev: true, canNext: true }
    })
    unmount()
    expect(onSetAppContext).toHaveBeenLastCalledWith({ telemetryPager: undefined })
  })

  test('wires the pointer handlers', () => {
    const onPointerDown = vi.fn()
    const onPointerUp = vi.fn()
    useKeyboardNavigationMock.mockReturnValue(navigation({ onPointerDown, onPointerUp }))
    const { container } = renderWithContext(<Telemetry />)
    fireEvent.pointerDown(container.firstChild as Element)
    fireEvent.pointerUp(container.firstChild as Element)
    expect(onPointerDown).toHaveBeenCalled()
    expect(onPointerUp).toHaveBeenCalled()
  })
})
