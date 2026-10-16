import { useLiviStore } from '@store/store'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { dab } from '../../dab/__tests__/fixtures'
import { SourceTabs } from '../SourceTabs'

const coreActionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@store/store')>()),
  coreAction: coreActionMock
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

const show = (d: ReturnType<typeof dab> | null) => act(() => useLiviStore.setState({ dab: d }))

describe('SourceTabs', () => {
  beforeEach(() => coreActionMock.mockClear())

  test('only there with the stick plugged in', () => {
    show(null)
    const { container, rerender } = render(<SourceTabs />)
    expect(container).toBeEmptyDOMElement()
    show(dab({ receiver: null, stations: [{} as never] }))
    rerender(<SourceTabs />)
    expect(container).toBeEmptyDOMElement()
    show(dab())
    rerender(<SourceTabs />)
    expect(screen.getByRole('tablist', { name: 'media.source' })).toBeInTheDocument()
  })

  test('switches between phone and DAB+, the chosen tab does nothing', async () => {
    show(dab({ active: false }))
    render(<SourceTabs />)
    const phone = screen.getByRole('tab', { name: 'media.phoneSource' })
    expect(phone).toHaveAttribute('aria-selected', 'true')
    fireEvent.mouseUp(phone)
    fireEvent.click(phone)
    expect(coreActionMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'media.dabSource' }))
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'dabResume' })

    show(dab({ active: true }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    coreActionMock.mockImplementationOnce(() => Promise.reject(new Error('gone')))
    expect(screen.getByRole('tab', { name: 'media.dabSource' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    fireEvent.click(screen.getByRole('tab', { name: 'media.phoneSource' }))
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'dabStop' })
    await act(async () => {})
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
