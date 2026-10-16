import { dab, station } from '@renderer/components/pages/media/dab/__tests__/fixtures'
import { useLiviStore } from '@store/store'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DabStations } from '../DabStations'

const coreActionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@store/store')>()),
  coreAction: coreActionMock
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

const show = (patch: Parameters<typeof dab>[0] | null) =>
  act(() => {
    useLiviStore.setState({ dab: patch === null ? null : dab(patch) })
  })

const asked = () => coreActionMock.mock.calls.map((c) => (c as unknown[])[0])

describe('DabStations', () => {
  beforeEach(() => coreActionMock.mockClear())

  test('renders nothing without DAB+, says so without stations', () => {
    show(null)
    const { container, unmount } = render(<DabStations />)
    expect(container).toBeEmptyDOMElement()
    unmount()
    show({})
    render(<DabStations />)
    expect(screen.getByText('media.noStations')).toBeInTheDocument()
  })

  test('the list in its own order with logo, star and eye per station', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    coreActionMock.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    show({
      stations: [
        { ...station(1, 'Dlf', true), logo: 'iVBOR' },
        { ...station(2, 'Doku'), hidden: true }
      ]
    })
    render(<DabStations />)
    expect(screen.getByAltText('Dlf')).toHaveAttribute('src', 'data:image/png;base64,iVBOR')

    fireEvent.click(screen.getAllByRole('button', { name: 'settings.moveDown' })[0])
    await act(async () => {})
    expect(warn).toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'settings.moveUp' })[1])

    const stars = screen.getAllByRole('button', { name: 'media.favorite' })
    expect(stars[0]).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(stars[0])
    fireEvent.click(stars[1])

    const hide = screen.getByRole('button', { name: 'media.hideStation' })
    const reveal = screen.getByRole('button', { name: 'media.showStation' })
    expect(reveal).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(hide)
    fireEvent.click(reveal)

    expect(asked()).toEqual([
      { kind: 'dabMove', serviceId: 1, by: 1 },
      { kind: 'dabMove', serviceId: 2, by: -1 },
      { kind: 'dabFavorite', serviceId: 1, favorite: false },
      { kind: 'dabFavorite', serviceId: 2, favorite: true },
      { kind: 'dabHide', serviceId: 1, hidden: true },
      { kind: 'dabHide', serviceId: 2, hidden: false }
    ])
    expect(screen.queryByRole('switch')).toBeNull()
    warn.mockRestore()
  })
})
