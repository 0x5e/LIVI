import type { Navigation } from '@shared/core/contract'
import { render, screen, waitFor } from '@testing-library/react'
import { NavFull } from '../NavFull'
import { guidance } from './navState'

const state: { navigation: Navigation | null } = { navigation: null }

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: typeof state) => unknown) => selector(state)
}))

describe('NavFull', () => {
  beforeEach(() => {
    state.navigation = null
  })

  test('shows the plain navigation glyph without a route', () => {
    render(<NavFull />)
    expect(screen.getByTestId('NavigationOutlinedIcon')).toBeInTheDocument()

    state.navigation = guidance({ active: false })
    render(<NavFull />)
    expect(screen.queryByText('Turn right')).not.toBeInTheDocument()
  })

  test('renders the guidance core wrote out', () => {
    state.navigation = guidance()
    render(<NavFull />)
    for (const text of ['Turn right', '200 m', 'Main Street', '12 min', '5 km', 'Berlin', 'Maps']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  test('with the phone picture the road moves below the divider', async () => {
    state.navigation = guidance({ image: 'abc123' })
    render(<NavFull />)
    expect(await screen.findByAltText('Navigation maneuver')).toBeInTheDocument()
    expect(screen.getByText('Turn right')).toBeInTheDocument()
    expect(screen.getByText('Main Street')).toBeInTheDocument()
  })

  test('a picture without road or maneuver words shows only the picture', async () => {
    state.navigation = guidance({
      image: 'abc123',
      roadName: null,
      maneuverText: null,
      maneuverDistanceText: null
    })
    render(<NavFull />)
    expect(await screen.findByAltText('Navigation maneuver')).toBeInTheDocument()
    expect(screen.queryByText('Main Street')).not.toBeInTheDocument()
    expect(screen.queryByText('200 m')).not.toBeInTheDocument()
  })

  test('leaves out what core did not write', () => {
    state.navigation = guidance({
      maneuverText: 'Continue',
      maneuverDistanceText: null,
      maneuverType: 0,
      turnSide: 1,
      roadName: null,
      timeLeftText: null,
      destinationDistanceText: null,
      destinationName: null,
      appName: null
    })
    render(<NavFull />)
    expect(screen.getByText('Continue')).toBeInTheDocument()
    expect(screen.getByTestId('StraightIcon')).toBeInTheDocument()
    for (const text of ['200 m', 'Main Street', 'Berlin', 'Maps']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
    }
  })

  test('renders the road after the maneuver below the current one', () => {
    state.navigation = guidance({ afterRoadName: 'Second Street', maneuverText: null })
    render(<NavFull />)
    expect(screen.getByText('Second Street')).toBeInTheDocument()
  })

  test.each([
    [null, null, 'NavigationOutlinedIcon'],
    [28, 2, 'RoundaboutRightIcon'],
    [4, 0, 'UTurnRightIcon'],
    [999, 1, 'NavigationOutlinedIcon'],
    [1, 1, 'TurnLeftIcon'],
    [2, 1, 'TurnRightIcon'],
    [3, 1, 'StraightIcon'],
    [5, 1, 'StraightIcon'],
    [4, 1, 'UTurnLeftIcon'],
    [18, 1, 'UTurnLeftIcon'],
    [26, 1, 'UTurnLeftIcon'],
    [6, 1, 'RoundaboutRightIcon'],
    [7, 1, 'RoundaboutRightIcon'],
    [19, 1, 'RoundaboutRightIcon'],
    [8, 1, 'ExitToAppIcon'],
    [22, 1, 'ExitToAppIcon'],
    [23, 1, 'ExitToAppIcon'],
    [9, 1, 'MergeIcon'],
    [10, 1, 'FlagIcon'],
    [12, 1, 'FlagIcon'],
    [24, 1, 'FlagIcon'],
    [25, 1, 'FlagIcon'],
    [27, 1, 'FlagIcon'],
    [11, 1, 'StraightIcon'],
    [13, 1, 'ForkLeftIcon'],
    [14, 1, 'ForkRightIcon'],
    [15, 1, 'DirectionsBoatIcon'],
    [16, 1, 'DirectionsBoatIcon'],
    [17, 1, 'DirectionsBoatIcon'],
    [20, 1, 'SubdirectoryArrowLeftIcon'],
    [21, 1, 'SubdirectoryArrowRightIcon'],
    [47, 1, 'TurnSharpLeftIcon'],
    [48, 1, 'TurnSharpRightIcon'],
    [49, 1, 'TurnSlightLeftIcon'],
    [50, 1, 'TurnSlightRightIcon'],
    [51, 1, 'SwapHorizIcon'],
    [52, 1, 'ForkLeftIcon'],
    [53, 1, 'ForkRightIcon']
  ])('maneuver %s on side %s renders %s', async (maneuverType, turnSide, iconTestId) => {
    state.navigation = guidance({ maneuverType, turnSide })
    render(<NavFull />)
    await waitFor(() => {
      expect(screen.getByTestId(iconTestId)).toBeInTheDocument()
    })
  })
})
