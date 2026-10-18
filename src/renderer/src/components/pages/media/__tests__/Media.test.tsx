import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Mock } from 'vitest'
import { useLiviStore } from '../../../../store/store'
import { Media } from '../Media'

const coreActionMock = vi.fn((_action: unknown) => Promise.resolve())

vi.mock('../../../../store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../store/store')>()),
  coreAction: (action: unknown) => coreActionMock(action)
}))

vi.mock('../components/createFFTSpectrum', () => ({
  FFTSpectrum: () => null
}))

const sizeHolder = vi.hoisted(() => ({ w: 600, h: 400 }))

const makeDefaultSnap = () => ({
  snap: {
    payload: {
      media: {
        MediaSongName: 'Track',
        MediaArtistName: 'Artist',
        MediaAlbumName: 'Album',
        MediaAPPName: 'CarPlay',
        MediaSongDuration: 1000,
        MediaPlayStatus: 0
      }
    }
  },
  livePlayMs: 100
})

const mediaHolder = vi.hoisted(() => ({
  value: {
    snap: {
      payload: {
        media: {
          MediaSongName: 'Track',
          MediaArtistName: 'Artist',
          MediaAlbumName: 'Album',
          MediaAPPName: 'CarPlay',
          MediaSongDuration: 1000,
          MediaPlayStatus: 0
        }
      }
    },
    livePlayMs: 100
  } as { snap: unknown; livePlayMs: number }
}))

const setSize = (w: number, h: number) => {
  sizeHolder.w = w
  sizeHolder.h = h
}

const setMedia = (value: { snap: unknown; livePlayMs: number }) => {
  mediaHolder.value = value
}

vi.mock('./../hooks/useElementSize', () => ({
  useElementSize: () => [{ current: null }, { w: sizeHolder.w, h: sizeHolder.h }]
}))

vi.mock('./../hooks/useMediaState', () => ({
  useMediaState: () => mediaHolder.value
}))

describe('Media component', () => {
  beforeEach(async () => {
    setSize(600, 400)
    setMedia(makeDefaultSnap())
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(async () => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('sends the play/pause toggle and resets press feedback', async () => {
    const { getByLabelText } = render(<Media />)
    const playButton = getByLabelText('Play/Pause')

    // The button sends the toggle key, so a cold press resumes.
    await act(async () => {
      fireEvent.click(playButton)
    })

    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'media', control: 'playPause' })

    await act(async () => {
      vi.advanceTimersByTime(150)
    })

    await act(async () => {
      fireEvent.click(playButton)
      vi.advanceTimersByTime(150)
    })

    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'media', control: 'playPause' })
  })

  it('a refused media button changes nothing', async () => {
    coreActionMock.mockReturnValueOnce(Promise.reject(new Error('no phone')))
    const { getByLabelText } = render(<Media />)

    await act(async () => {
      fireEvent.click(getByLabelText('Next'))
    })

    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'media', control: 'next' })
  })

  it('seeks a CarPlay track and leaves an Android Auto one as it is', async () => {
    coreActionMock.mockImplementationOnce(() => Promise.reject(new Error('no phone')))
    await act(async () => {
      useLiviStore.setState({ sessions: { active: 'carplay', position: 1, total: 1 } })
    })
    render(<Media />)

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    })
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'seek', positionMs: 1000 })

    await act(async () => {
      useLiviStore.setState({ sessions: { active: 'androidauto', position: 1, total: 1 } })
    })
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('sends next and prev commands', async () => {
    const { getByLabelText } = render(<Media />)

    await act(async () => {
      fireEvent.click(getByLabelText('Next'))
      fireEvent.click(getByLabelText('Previous'))
    })

    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'media', control: 'next' })
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'media', control: 'prev' })
  })

  it('artwork button toggles FFT spectrum on click', async () => {
    render(<Media />)
    expect(screen.getByRole('button', { name: /Show spectrum/i })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Show spectrum/i }))
    })
    expect(screen.getByRole('button', { name: /Show artwork/i })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Show artwork/i }))
    })
    expect(screen.getByRole('button', { name: /Show spectrum/i })).toBeInTheDocument()
  })

  it('keyboard Enter on artwork button toggles FFT', async () => {
    render(<Media />)
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: /Show spectrum/i }), { key: 'Enter' })
    })
    expect(screen.getByRole('button', { name: /Show artwork/i })).toBeInTheDocument()
  })

  it('keyboard Space on artwork button toggles FFT', async () => {
    render(<Media />)
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: /Show spectrum/i }), { key: ' ' })
    })
    expect(screen.getByRole('button', { name: /Show artwork/i })).toBeInTheDocument()
  })

  it('car-media-key PLAY event bumps play feedback', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'play' } }))
    })
    expect(coreActionMock).not.toHaveBeenCalled()
  })

  it('car-media-key NEXT event flashes next button', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'next' } }))
    })
    expect(screen.getByLabelText('Next')).toBeInTheDocument()
  })

  it('car-media-key PREV event flashes prev button', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'prev' } }))
    })
    expect(screen.getByLabelText('Previous')).toBeInTheDocument()
  })

  it('car-media-key with no command does nothing', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: {} }))
    })
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('another phone in front resets showFft to false', async () => {
    render(<Media />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Show spectrum/i }))
    })
    expect(screen.getByRole('button', { name: /Show artwork/i })).toBeInTheDocument()

    await act(async () => {
      useLiviStore.setState({ sessions: { active: 'carplay', position: 2, total: 2 } })
    })
    expect(screen.getByRole('button', { name: /Show spectrum/i })).toBeInTheDocument()
  })

  it('renders the tiny-screen layout without crashing', async () => {
    setSize(600, 300)
    render(<Media />)
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('renders the single-column layout on narrow screens', async () => {
    setSize(280, 300)
    render(<Media />)
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
    expect(screen.getByText('Track')).toBeInTheDocument()
  })

  it('shows the app name in the single column when the artist is empty', async () => {
    setSize(280, 300)
    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: '',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 0
          }
        }
      },
      livePlayMs: 100
    })
    render(<Media />)
    expect(screen.getByText('CarPlay')).toBeInTheDocument()
  })

  it('renders artwork image when base64 image is present', async () => {
    setMedia({
      snap: {
        payload: {
          base64Image: 'iVBORw0KGgo=',
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 0
          }
        }
      },
      livePlayMs: 100
    })
    render(<Media />)
    expect(screen.getByAltText('Cover')).toBeInTheDocument()
  })

  it('handles zero playback time and zero duration', async () => {
    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaPlayStatus: 0
          }
        }
      },
      livePlayMs: 0
    })
    render(<Media />)
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('holds the last progress when playback appears to jump backwards', async () => {
    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 1
          }
        }
      },
      livePlayMs: 500
    })
    const { rerender } = render(<Media />)

    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 1
          }
        }
      },
      livePlayMs: 100
    })

    await act(async () => {
      rerender(<Media />)
    })

    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('car-media-key with an unknown command is ignored', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'seek' } }))
    })
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('ignores non-toggle keys on the artwork button', async () => {
    render(<Media />)
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: /Show spectrum/i }), { key: 'a' })
    })
    expect(screen.getByRole('button', { name: /Show spectrum/i })).toBeInTheDocument()
  })
})
