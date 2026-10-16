import { useLiviStore } from '@store/store'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DabPlayer } from '../DabPlayer'
import { dab, station } from './fixtures'

const coreActionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@store/store')>()),
  coreAction: coreActionMock
}))

vi.mock('../../hooks/useElementSize', () => ({
  useElementSize: () => [{ current: null }, { w: 1280, h: 560 }]
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

const show = (patch: Parameters<typeof dab>[0] | null) =>
  act(() => {
    useLiviStore.setState({ dab: patch === null ? null : dab(patch) })
  })

const asked = () => coreActionMock.mock.calls.map((c) => (c as unknown[])[0])

const two = [station(1, 'Dlf'), { ...station(2, 'Dlf Kultur'), logo: 'iVBOR' }]

describe('DabPlayer', () => {
  beforeEach(() => coreActionMock.mockClear())

  test('renders nothing without DAB+', () => {
    show(null)
    const { container } = render(<DabPlayer />)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the tuned station and steers it', () => {
    show({
      active: true,
      stations: two,
      station: 2,
      playing: true,
      text: 'Lesart',
      signal: { locked: true, quality: 95 }
    })
    render(<DabPlayer />)
    // The big picture is the station's logo, never a slide.
    expect(screen.getAllByAltText('Dlf Kultur')[0]).toHaveAttribute(
      'src',
      'data:image/png;base64,iVBOR'
    )
    expect(screen.getByRole('heading', { name: 'Dlf Kultur' })).toBeInTheDocument()
    expect(screen.getByText('Lesart')).toBeInTheDocument()
    expect(screen.getByText('DR Deutschland · 5C')).toBeInTheDocument()
    expect(screen.getByLabelText('95 %')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Play/Pause' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Play/Pause' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'media.favorite' }))
    fireEvent.click(screen.getAllByRole('button', { pressed: false }).at(-1) as HTMLElement)
    expect(asked()).toEqual([
      { kind: 'media', control: 'playPause' },
      { kind: 'media', control: 'prev' },
      { kind: 'media', control: 'next' },
      { kind: 'dabFavorite', serviceId: 2, favorite: true },
      { kind: 'dabPlay', serviceId: 1 }
    ])
  })

  test('a favorite unstars, weaker signals show fewer bars', () => {
    show({
      active: true,
      stations: [station(1, 'Dlf', true)],
      station: 1,
      signal: { locked: true, quality: 50 }
    })
    const { unmount } = render(<DabPlayer />)
    expect(screen.getByLabelText('50 %')).toBeInTheDocument()
    const star = screen.getByRole('button', { name: 'media.favorite' })
    expect(star).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(star)
    expect(asked()).toEqual([{ kind: 'dabFavorite', serviceId: 1, favorite: false }])
    unmount()
    show({
      active: true,
      stations: [station(1, 'Dlf')],
      station: 1,
      signal: { locked: true, quality: 10 }
    })
    render(<DabPlayer />)
    expect(screen.getByLabelText('10 %')).toBeInTheDocument()
  })

  test('a failed pick is logged, the star waits for a station, the lines keep their room', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    coreActionMock.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    show({ active: true, stations: [station(1, 'Dlf')], station: null })
    render(<DabPlayer />)
    expect(screen.getByRole('heading', { name: 'media.dabSource' })).toBeInTheDocument()
    const star = screen.getByRole('button', { name: 'media.favorite' })
    expect(star).toBeDisabled()
    fireEvent.click(star)
    expect(screen.getByTestId('dab-text')).toHaveStyle({ height: '47.5px' })
    expect(screen.getByRole('button', { name: 'Play/Pause' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    fireEvent.click(screen.getAllByRole('button', { pressed: false }).at(-1) as HTMLElement)
    await act(async () => {})
    expect(warn).toHaveBeenCalled()
    expect(asked()).toEqual([{ kind: 'dabPlay', serviceId: 1 }])
    warn.mockRestore()
  })

  test('the star rings on focus and hover, car keys flash the transport buttons', () => {
    vi.useFakeTimers()
    show({ active: true, stations: [station(1, 'Dlf')], station: 1 })
    render(<DabPlayer />)
    const star = screen.getByRole('button', { name: 'media.favorite' })
    const idle = star.style.boxShadow
    fireEvent.focus(star)
    expect(star.style.boxShadow).not.toBe(idle)
    fireEvent.blur(star)
    fireEvent.pointerEnter(star, { pointerType: 'touch' })
    expect(star.style.boxShadow).toBe(idle)
    fireEvent.pointerEnter(star, { pointerType: 'mouse' })
    expect(star.style.boxShadow).not.toBe(idle)
    fireEvent.pointerLeave(star)
    fireEvent.mouseUp(star)
    expect(star.style.boxShadow).toBe(idle)

    const next = screen.getByRole('button', { name: 'Next' })
    act(() => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'next' } }))
    })
    expect(next.style.transform).toBe('scale(0.94)')
    act(() => {
      vi.runAllTimers()
    })
    expect(next.style.transform).not.toBe('scale(0.94)')
    vi.useRealTimers()
  })

  test('without stations it points to the scan', () => {
    show({ active: true })
    render(<DabPlayer />)
    expect(screen.getByText('media.noStations')).toBeInTheDocument()
  })
})
