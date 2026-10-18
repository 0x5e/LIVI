import { DEFAULT_CONFIG } from '@shared/types'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { useLiviStore } from '../../../store/store'
import { VolumeOverlay } from '../VolumeOverlay'

const at = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <VolumeOverlay />
  </MemoryRouter>
)

const volume = (huVolume: number, overlayMessages = true) =>
  act(() => useLiviStore.setState({ settings: { ...DEFAULT_CONFIG, huVolume, overlayMessages } }))

const card = () => document.querySelector<HTMLElement>('[aria-hidden="true"]')
const shownPct = () => card()?.lastElementChild?.lastElementChild?.textContent

beforeEach(() => {
  vi.useFakeTimers()
  useLiviStore.setState({ settings: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('VolumeOverlay', () => {
  test('stays away until the settings are known and does not show the level at start', () => {
    const { container } = render(at('/'))
    expect(container).toBeEmptyDOMElement()

    volume(0.6)
    expect(card()?.style.opacity).toBe('0')
  })

  test('shows a change for a moment with the level and its icon', () => {
    volume(0.6)
    render(at('/'))

    volume(0.4)
    expect(card()?.style.opacity).toBe('1')
    expect(shownPct()).toBe('40%')
    expect(screen.getByTestId('VolumeDownRoundedIcon')).toBeInTheDocument()

    volume(0)
    expect(screen.getByTestId('VolumeOffRoundedIcon')).toBeInTheDocument()
    volume(0.5)
    expect(screen.getByTestId('VolumeUpRoundedIcon')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1499)
    })
    expect(card()?.style.opacity).toBe('1')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(card()?.style.opacity).toBe('0')
  })

  test('stays hidden on the settings pages and with overlay messages off', () => {
    volume(0.6)
    const { unmount } = render(at('/settings/audio'))
    volume(0.7)
    expect(card()?.style.opacity).toBe('0')
    unmount()

    render(at('/'))
    volume(0.8, false)
    expect(card()?.style.opacity).toBe('0')
  })

  test('starts over when the settings go away and come back', () => {
    volume(0.6)
    const { container, unmount } = render(at('/'))
    act(() => useLiviStore.setState({ settings: null }))
    expect(container).toBeEmptyDOMElement()

    volume(0.7)
    expect(card()?.style.opacity).toBe('0')
    volume(0.8)
    expect(card()?.style.opacity).toBe('1')
    unmount()
  })
})
