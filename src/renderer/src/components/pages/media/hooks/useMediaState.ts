import type { NowPlaying } from '@shared/core/contract'
import { useLiviStore } from '@store/store'
import { useEffect, useRef, useState } from 'react'
import { PROGRESS_STALL_MS, UI_INTERVAL_MS } from '../constants'
import type { MediaPayload, PersistedSnapshot } from '../types'
import { clamp } from '../utils'

export function toPayload(np: NowPlaying): MediaPayload {
  const media: NonNullable<MediaPayload['media']> = {}
  if (np.title !== null) media.MediaSongName = np.title
  if (np.artist !== null) media.MediaArtistName = np.artist
  if (np.album !== null) media.MediaAlbumName = np.album
  if (np.app !== null) media.MediaAPPName = np.app
  if (np.durationMs !== null) media.MediaSongDuration = np.durationMs
  if (np.elapsedMs !== null) media.MediaSongPlayTime = np.elapsedMs
  if (np.playing !== null) media.MediaPlayStatus = np.playing ? 1 : 0
  const payload: MediaPayload = { type: 1, media }
  if (np.artwork !== null) payload.base64Image = np.artwork
  return payload
}

export function useMediaState() {
  const nowPlaying = useLiviStore((s) => s.nowPlaying)
  const [snap, setSnap] = useState<PersistedSnapshot | null>(null)
  const [livePlayMs, setLivePlayMs] = useState<number>(0)
  const [stalled, setStalled] = useState(false)

  const lastTick = useRef<number>(performance.now())
  const lastUiUpdateRef = useRef<number>(0)
  const livePlayMsRef = useRef<number>(0)
  const phonePlayMsRef = useRef<number | undefined>(undefined)
  const playStatusRef = useRef<number | undefined>(undefined)
  const lastProgressAtRef = useRef<number>(performance.now())

  useEffect(() => {
    if (!nowPlaying) return
    const payload = toPayload(nowPlaying)
    const phonePlayMs = payload.media?.MediaSongPlayTime
    const progressed = typeof phonePlayMs === 'number' && phonePlayMs !== phonePlayMsRef.current
    if (progressed) phonePlayMsRef.current = phonePlayMs
    const status = payload.media?.MediaPlayStatus
    const resumed = status === 1 && playStatusRef.current !== 1
    playStatusRef.current = status
    if (progressed || resumed) {
      lastProgressAtRef.current = performance.now()
      setStalled(false)
    }
    const play = phonePlayMs ?? 0
    setLivePlayMs(play)
    livePlayMsRef.current = play
    lastTick.current = performance.now()
    lastUiUpdateRef.current = lastTick.current
    setSnap({ timestamp: new Date().toISOString(), payload })
  }, [nowPlaying])

  useEffect(() => {
    let raf = 0

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const m = snap?.payload.media
      if (!m) return

      const now = performance.now()
      const dt = now - lastTick.current
      lastTick.current = now

      if (m.MediaPlayStatus !== 1) return

      if (now - lastProgressAtRef.current > PROGRESS_STALL_MS) {
        const reported = phonePlayMsRef.current
        if (typeof reported === 'number' && reported !== livePlayMsRef.current) {
          livePlayMsRef.current = reported
          setLivePlayMs(reported)
        }
        setStalled(true)
        return
      }

      const dur = m.MediaSongDuration ?? 0
      const next = clamp(livePlayMsRef.current + dt, 0, dur)
      livePlayMsRef.current = next

      if (now - lastUiUpdateRef.current >= UI_INTERVAL_MS) {
        lastUiUpdateRef.current = now
        setLivePlayMs(next)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [snap])

  return { snap, livePlayMs, stalled }
}
