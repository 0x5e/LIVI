import type { Navigation } from '@shared/core/contract'
import { render, screen, waitFor } from '@testing-library/react'
import { NavMini } from '../NavMini'
import { guidance } from './navState'

const useBlinkingTimeMock = vi.fn()
const state: { navigation: Navigation | null } = { navigation: null }

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: typeof state) => unknown) => selector(state)
}))

vi.mock('../../../../../hooks/useBlinkingTime', () => ({
  useBlinkingTime: () => useBlinkingTimeMock()
}))

describe('NavMini', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.navigation = null
    useBlinkingTimeMock.mockReturnValue('12:34')
  })

  test('shows the clock without a route', () => {
    render(<NavMini />)
    expect(
      screen.getAllByText((_, element) => element?.textContent === '12:34').length
    ).toBeGreaterThan(0)

    state.navigation = guidance({ active: false })
    render(<NavMini />)
    expect(screen.queryByText('200 m')).not.toBeInTheDocument()
  })

  test('renders the guidance core wrote out', () => {
    state.navigation = guidance()
    render(<NavMini iconSize={84} />)
    expect(screen.getByText('200 m')).toBeInTheDocument()
    expect(screen.getByText('12 min')).toBeInTheDocument()
    expect(screen.getByText('5 km')).toBeInTheDocument()
    expect(screen.getByTestId('AccessTimeIcon')).toBeInTheDocument()
  })

  test('shows the phone picture and leaves the destination distance out', async () => {
    state.navigation = guidance({ image: 'abc123' })
    render(<NavMini />)
    expect(await screen.findByAltText('Navigation maneuver')).toBeInTheDocument()
    expect(screen.queryByText('5 km')).not.toBeInTheDocument()
  })

  test('shows the road without a time left, a dash without either', () => {
    state.navigation = guidance({ timeLeftText: null })
    const { unmount } = render(<NavMini />)
    expect(screen.getByText('Main Street')).toBeInTheDocument()
    expect(screen.getByTestId('SignpostIcon')).toBeInTheDocument()
    unmount()

    state.navigation = guidance({ timeLeftText: null, roadName: null })
    render(<NavMini />)
    expect(screen.getAllByText('—')).not.toHaveLength(0)
  })

  test('the maneuver stands in for a missing distance, a dash for both', () => {
    state.navigation = guidance({ maneuverDistanceText: null })
    const { unmount } = render(<NavMini />)
    expect(screen.getByText('Turn right')).toBeInTheDocument()
    unmount()

    state.navigation = guidance({ maneuverDistanceText: null, maneuverText: null })
    render(<NavMini />)
    expect(screen.getAllByText('—')).not.toHaveLength(0)
  })

  test('shows a dash when the destination distance is missing', () => {
    state.navigation = guidance({ destinationDistanceText: null })
    render(<NavMini />)
    expect(screen.getByText('200 m')).toBeInTheDocument()
    expect(screen.getAllByText('—')).not.toHaveLength(0)
  })

  test.each([
    [null, null, 'NavigationOutlinedIcon'],
    [28, 2, 'RoundaboutRightIcon'],
    [4, 0, 'UTurnRightIcon'],
    [999, 1, 'NavigationOutlinedIcon'],
    [8, 1, 'ExitToAppIcon'],
    [48, 2, 'TurnSharpRightIcon'],
    [1, 1, 'TurnLeftIcon'],
    [3, 1, 'StraightIcon'],
    [5, 1, 'StraightIcon'],
    [18, 1, 'UTurnLeftIcon'],
    [26, 1, 'UTurnLeftIcon'],
    [7, 1, 'RoundaboutRightIcon'],
    [19, 1, 'RoundaboutRightIcon'],
    [22, 1, 'ExitToAppIcon'],
    [23, 1, 'ExitToAppIcon'],
    [9, 1, 'MergeIcon'],
    [10, 1, 'FlagIcon'],
    [12, 1, 'FlagIcon'],
    [24, 1, 'FlagIcon'],
    [25, 1, 'FlagIcon'],
    [27, 1, 'FlagIcon'],
    [13, 1, 'ForkLeftIcon'],
    [14, 1, 'ForkRightIcon'],
    [20, 1, 'SubdirectoryArrowLeftIcon'],
    [21, 1, 'SubdirectoryArrowRightIcon'],
    [47, 1, 'TurnSharpLeftIcon'],
    [49, 1, 'TurnSlightLeftIcon'],
    [50, 1, 'TurnSlightRightIcon'],
    [52, 1, 'ForkLeftIcon'],
    [53, 1, 'ForkRightIcon']
  ])('maneuver %s on side %s renders %s', async (maneuverType, turnSide, iconTestId) => {
    state.navigation = guidance({ maneuverType, turnSide })
    render(<NavMini />)
    await waitFor(() => {
      expect(screen.getByTestId(iconTestId)).toBeInTheDocument()
    })
  })
})
