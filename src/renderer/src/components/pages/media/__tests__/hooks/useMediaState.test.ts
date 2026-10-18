import type { NowPlaying } from '@shared/core/contract'
import { useLiviStore } from '@store/store'
import { act, renderHook } from '@testing-library/react'
import { useMediaState } from '../../hooks'
import { toPayload } from '../../hooks/useMediaState'

const nothing: NowPlaying = {
  title: null,
  artist: null,
  album: null,
  app: null,
  durationMs: null,
  elapsedMs: null,
  playing: null,
  artwork: null
}

const tell = (np: Partial<NowPlaying>) =>
  act(() => {
    useLiviStore.setState({ nowPlaying: { ...nothing, ...np } })
  })

const frames = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    setTimeout(() => cb(performance.now()), 16)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  useLiviStore.setState({ nowPlaying: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('toPayload', () => {
  test('names what the phone told the way the page reads it', () => {
    expect(
      toPayload({
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        app: 'Music',
        durationMs: 1000,
        elapsedMs: 10,
        playing: true,
        artwork: 'AAAA'
      })
    ).toEqual({
      type: 1,
      media: {
        MediaSongName: 'Song',
        MediaArtistName: 'Artist',
        MediaAlbumName: 'Album',
        MediaAPPName: 'Music',
        MediaSongDuration: 1000,
        MediaSongPlayTime: 10,
        MediaPlayStatus: 1
      },
      base64Image: 'AAAA'
    })
  })

  test('leaves out what the phone did not tell', () => {
    expect(toPayload(nothing)).toEqual({ type: 1, media: {} })
    expect(toPayload({ ...nothing, playing: false }).media).toEqual({ MediaPlayStatus: 0 })
  })
})

describe('useMediaState', () => {
  test('shows nothing before core said anything', () => {
    const { result } = renderHook(() => useMediaState())
    expect(result.current.snap).toBeNull()
    expect(result.current.livePlayMs).toBe(0)
  })

  test('core telling the track seeds the page', () => {
    const { result } = renderHook(() => useMediaState())
    tell({ title: 'Song', elapsedMs: 123 })
    expect(result.current.snap?.payload).toEqual(
      toPayload({ ...nothing, title: 'Song', elapsedMs: 123 })
    )
    expect(result.current.livePlayMs).toBe(123)

    tell({ title: 'Other' })
    expect(result.current.livePlayMs).toBe(0)
  })

  test('the track runs on between the phone updates while it plays', async () => {
    tell({ playing: true, durationMs: 1000, elapsedMs: 10 })
    const { result } = renderHook(() => useMediaState())
    expect(result.current.livePlayMs).toBe(10)

    await frames(500)
    expect(result.current.livePlayMs).toBeGreaterThan(10)
    expect(result.current.livePlayMs).toBeLessThanOrEqual(1000)
  })

  test('a paused track stands still', async () => {
    tell({ playing: false, durationMs: 1000, elapsedMs: 10 })
    const { result } = renderHook(() => useMediaState())
    await frames(500)
    expect(result.current.livePlayMs).toBe(10)
  })

  test('a playing track without a duration stays at zero', async () => {
    tell({ playing: true })
    const { result } = renderHook(() => useMediaState())
    await frames(500)
    expect(result.current.livePlayMs).toBe(0)
  })

  test('stalls on the reported time when the phone stops reporting progress', async () => {
    tell({ playing: true, durationMs: 600000, elapsedMs: 1000 })
    const { result } = renderHook(() => useMediaState())
    expect(result.current.stalled).toBe(false)

    await frames(2000)
    expect(result.current.stalled).toBe(false)
    expect(result.current.livePlayMs).toBeGreaterThan(1000)

    await frames(1500)
    expect(result.current.stalled).toBe(true)
    expect(result.current.livePlayMs).toBe(1000)

    await frames(5000)
    expect(result.current.livePlayMs).toBe(1000)
  })

  test('a new play time or a resume ends the stall', async () => {
    tell({ playing: true, durationMs: 600000, elapsedMs: 1000 })
    const { result } = renderHook(() => useMediaState())
    await frames(3500)
    expect(result.current.stalled).toBe(true)

    tell({ playing: true, durationMs: 600000, elapsedMs: 2000 })
    expect(result.current.stalled).toBe(false)
    expect(result.current.livePlayMs).toBe(2000)

    await frames(3500)
    expect(result.current.stalled).toBe(true)
    tell({ playing: false, durationMs: 600000, elapsedMs: 2000 })
    tell({ playing: true, durationMs: 600000, elapsedMs: 2000 })
    expect(result.current.stalled).toBe(false)
  })

  test('stops its frame loop on unmount', () => {
    const { unmount } = renderHook(() => useMediaState())
    unmount()
    expect(window.cancelAnimationFrame).toHaveBeenCalled()
  })
})
