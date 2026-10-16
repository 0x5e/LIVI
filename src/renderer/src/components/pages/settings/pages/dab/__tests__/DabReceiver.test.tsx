import type { Dab } from '@shared/core/contract'
import { useLiviStore } from '@store/store'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DabReceiver } from '../DabReceiver'

const coreActionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@store/store')>()),
  coreAction: coreActionMock
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k)
  })
}))

const dab = (patch: Partial<Dab> = {}): Dab => ({
  receiver: 'RTL2838UHIDIR',
  stations: [],
  lastStation: null,
  active: false,
  scan: null,
  station: null,
  playing: false,
  text: null,
  signal: { locked: false, quality: 0 },
  error: null,
  gainsDb: [],
  ...patch
})

const set = (d: Dab | null, stations = 0) =>
  act(() => {
    useLiviStore.setState({
      dab: d && { ...d, stations: Array.from({ length: stations }, () => ({})) as never }
    })
  })

describe('DabReceiver', () => {
  beforeEach(() => coreActionMock.mockClear())

  test('without a stick the scan waits', () => {
    set(null)
    render(<DabReceiver />)
    expect(screen.getByText('settings.dabStations {"count":0}')).toBeInTheDocument()
    expect(screen.getByText('settings.dabNoReceiver')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.dabScan' })).toBeDisabled()
  })

  test('starts a scan and shows how many stations the list holds', () => {
    set(dab(), 14)
    render(<DabReceiver />)
    expect(screen.getByText('RTL2838UHIDIR')).toBeInTheDocument()
    expect(screen.getByText('settings.dabStations {"count":14}')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'settings.dabScan' }))
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'dabScan' })
  })

  test('follows a running scan and stops it', () => {
    set(dab({ scan: { channel: '10A', done: 20, total: 40, found: 14 } }))
    render(<DabReceiver />)
    expect(screen.getByText('settings.dabScanning {"channel":"10A"}')).toBeInTheDocument()
    expect(screen.getByText('settings.dabFound {"count":14}')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    fireEvent.click(screen.getByRole('button', { name: 'settings.dabStopScan' }))
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'dabStopScan' })
  })

  test('an empty scan shows no progress and an error is shown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    coreActionMock.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    set(dab({ scan: { channel: '', done: 0, total: 0, found: 0 }, error: 'tune failed' }))
    render(<DabReceiver />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('tune failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'settings.dabStopScan' }))
    await act(async () => {})
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
