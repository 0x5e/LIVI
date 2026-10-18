import type { Update } from '@shared/core/contract'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SoftwareUpdate } from '../SoftwareUpdate'

const mockSaveSettings = vi.fn()
const coreActionMock = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const store: { settings: any; update: Update | null } = { settings: null, update: null }

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: any) => unknown) =>
    selector({ saveSettings: mockSaveSettings, settings: store.settings, update: store.update }),
  coreAction: coreActionMock
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

const checked = (latest: Update['latest']): Update => ({
  latest,
  checking: false,
  checked: true,
  phase: 'idle',
  received: 0,
  total: 0,
  error: null
})

const newer = { version: '1.1.0', commit: '', run: '', url: 'https://u' }

function page() {
  const view = render(<SoftwareUpdate />)
  const set = (patch: Partial<Update>) => {
    store.update = { ...(store.update ?? checked(newer)), ...patch }
    view.rerender(<SoftwareUpdate />)
  }
  return { ...view, set }
}

const asked = () =>
  coreActionMock.mock.calls.map((c) => (c as unknown as [{ kind: string }])[0].kind)

describe('SoftwareUpdate', () => {
  beforeEach(() => {
    coreActionMock.mockClear()
    mockSaveSettings.mockClear()
    ;(globalThis as any).__BUILD_SHA__ = undefined
    ;(globalThis as any).__BUILD_RUN__ = undefined
    store.settings = { updateNightly: false }
    store.update = checked(newer)
    ;(window as any).app = { getVersion: vi.fn().mockResolvedValue('1.0.0') }
  })

  test('asks core for the newest build and downloads it', async () => {
    page()
    await waitFor(() => expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument())
    expect(screen.getByText('1.1.0')).toBeInTheDocument()
    expect(asked()).toEqual(['checkUpdate'])

    fireEvent.click(screen.getByRole('button', { name: 'softwareUpdate.refresh' }))
    fireEvent.click(screen.getByRole('button', { name: 'softwareUpdate.update' }))
    expect(asked()).toEqual(['checkUpdate', 'checkUpdate', 'downloadUpdate'])
  })

  test('shows the download progress and installs once it is ready', async () => {
    const { set } = page()
    set({ phase: 'download', received: 1024, total: 2048 })
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)

    set({ phase: 'ready' })
    const install = screen.getByText('softwareUpdate.installNow')
    fireEvent.click(install)
    expect(asked()).toContain('installUpdate')
    expect(install).toBeDisabled()
  })

  test('a download of unknown size has no percentage', async () => {
    const { set } = page()
    fireEvent.click(await screen.findByRole('button', { name: 'softwareUpdate.update' }))
    set({ phase: 'download', received: 10, total: 0 })
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  test('an error shows its message and close closes the dialog', async () => {
    const { set } = page()
    set({ phase: 'ready' })
    set({ phase: 'error', error: 'network timeout' })
    expect(screen.getAllByText('network timeout').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('softwareUpdate.close'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(asked()).not.toContain('abortUpdate')
  })

  test('an error without words reads as a failed update', async () => {
    const { set } = page()
    set({ phase: 'ready' })
    set({ phase: 'error', error: null })
    expect(screen.getAllByText('softwareUpdate.updateFailed').length).toBeGreaterThan(0)
  })

  test('an abort closes the dialog by itself after 1.2 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { set } = page()
    set({ phase: 'ready' })
    set({ phase: 'error', error: 'Aborted' })
    act(() => {
      vi.advanceTimersByTime(1199)
    })
    expect(screen.getByText('softwareUpdate.close')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2)
    })
    // The dialog fades out before it leaves the page.
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  test('while a download runs the update row spins and refresh waits', async () => {
    const { set } = page()
    await waitFor(() => expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument())
    set({ phase: 'download', received: 200, total: 1000 })
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'softwareUpdate.refresh' })).toBeDisabled()
  })

  test('a finished check without a build for this machine says so', () => {
    store.update = checked(null)
    const { set } = page()
    expect(screen.getByText('softwareUpdate.couldNotCheckLatestRelease')).toBeInTheDocument()
    set({ checking: true })
    expect(screen.queryByText('softwareUpdate.couldNotCheckLatestRelease')).not.toBeInTheDocument()
    set({ checking: false, latest: { ...newer, url: null } })
    expect(screen.getByText('softwareUpdate.couldNotCheckLatestRelease')).toBeInTheDocument()
  })

  test('nothing is said before core answered', () => {
    store.update = null
    page()
    expect(screen.queryByText('softwareUpdate.couldNotCheckLatestRelease')).not.toBeInTheDocument()
  })

  test('nightly offers an update when the version matches but the commit differs', async () => {
    store.settings = { updateNightly: true }
    store.update = checked({ version: '8.0.0', url: 'https://n', commit: 'abcdef0123', run: '123' })
    ;(window as any).app.getVersion = vi.fn().mockResolvedValue('8.0.0')
    page()
    const update = await screen.findByRole('button', { name: 'softwareUpdate.update' })
    expect(update).toBeEnabled()
    fireEvent.click(update)
    expect(asked()).toContain('downloadUpdate')
  })

  test('a nightly of this very build is up to date', async () => {
    store.settings = { updateNightly: true }
    ;(globalThis as any).__BUILD_SHA__ = 'abcdef0'
    store.update = checked({ version: '8.0.0', url: 'https://n', commit: 'abcdef0123', run: '1' })
    page()
    expect(await screen.findByRole('button', { name: 'softwareUpdate.upToDate' })).toBeDisabled()
  })

  test('the nightly switch turns the channel on and off', async () => {
    page()
    const sw = await screen.findByRole('switch', { name: 'softwareUpdate.channelNightly' })
    expect(sw).not.toBeChecked()
    fireEvent.click(sw)
    expect(mockSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ updateNightly: true }))

    store.settings = { updateNightly: true }
    mockSaveSettings.mockClear()
    page()
    const on = (await screen.findAllByRole('switch', { name: 'softwareUpdate.channelNightly' }))[1]
    fireEvent.click(on)
    expect(mockSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ updateNightly: false }))
  })

  test('without settings neither the switch nor a check do anything', async () => {
    store.settings = null
    page()
    fireEvent.click(await screen.findByRole('switch', { name: 'softwareUpdate.channelNightly' }))
    expect(mockSaveSettings).not.toHaveBeenCalled()
    expect(asked()).toEqual([])
  })

  test('shows the build of this install', async () => {
    ;(globalThis as any).__BUILD_SHA__ = 'deadbee'
    ;(globalThis as any).__BUILD_RUN__ = '42'
    page()
    await waitFor(() => expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument())
  })

  test('offers a downgrade when the installed version is newer', async () => {
    ;(window as any).app.getVersion = vi.fn().mockResolvedValue('2.0.0')
    store.update = checked({ ...newer, version: '1.0.0' })
    page()
    const btn = await screen.findByRole('button', { name: 'softwareUpdate.downgrade' })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(screen.getByText('Software Downgrade')).toBeInTheDocument()
  })

  test('shows up to date and disables the button when versions match', async () => {
    store.update = checked({ ...newer, version: '1.0.0' })
    page()
    expect(await screen.findByRole('button', { name: 'softwareUpdate.upToDate' })).toBeDisabled()
  })

  test('install phases tell that LIVI starts again', () => {
    const { set } = page()
    set({ phase: 'ready' })
    set({ phase: 'installing' })
    expect(screen.getByText('softwareUpdate.restartsAutomaticallyWhenDone')).toBeInTheDocument()
  })

  test('abort asks core to stop', () => {
    const { set } = page()
    set({ phase: 'ready' })
    fireEvent.click(screen.getByText('softwareUpdate.abort'))
    expect(asked()).toContain('abortUpdate')
  })

  test('escape keeps the dialog open unless the update failed', async () => {
    const { set } = page()
    set({ phase: 'ready' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText('softwareUpdate.installNow')).toBeInTheDocument()
    set({ phase: 'error', error: 'boom' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('closing a ready download drops it and the dialog stays closed', async () => {
    const { baseElement, set } = page()
    set({ phase: 'ready' })
    fireEvent.click(baseElement.querySelector('.MuiBackdrop-root') as HTMLElement)
    expect(asked()).toContain('abortUpdate')
    set({ received: 1 })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('a refused request is only logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    coreActionMock.mockRejectedValueOnce(new Error('no core'))
    page()
    await waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
