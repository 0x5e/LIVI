import { type RefObject, useEffect } from 'react'
import { MediaEventType } from '../types'
import { flash } from '../utils/flash'

type Props = {
  bump: (type: MediaEventType) => void
  playBtnRef: RefObject<HTMLButtonElement | null>
  prevBtnRef: RefObject<HTMLButtonElement | null>
  nextBtnRef: RefObject<HTMLButtonElement | null>
  onPrev?: () => void
}

export function useCarMediaKeys({ bump, playBtnRef, prevBtnRef, nextBtnRef, onPrev }: Props) {
  useEffect(() => {
    const handler = (e: Event) => {
      const cmdRaw = (e as CustomEvent<{ command?: string }>).detail?.command
      if (!cmdRaw) return

      const cmd = cmdRaw.toLowerCase()

      const isPlayLike =
        cmd === MediaEventType.PLAY ||
        cmd === MediaEventType.PAUSE ||
        cmd === MediaEventType.STOP ||
        cmd === MediaEventType.PLAYPAUSE

      if (isPlayLike) {
        bump(MediaEventType.PLAY)
        flash(playBtnRef)
        return
      }

      if (cmd === MediaEventType.NEXT) {
        bump(MediaEventType.NEXT)
        flash(nextBtnRef)
        return
      }

      if (cmd === MediaEventType.PREV) {
        bump(MediaEventType.PREV)
        flash(prevBtnRef)
        onPrev?.()
        return
      }
    }

    window.addEventListener('car-media-key', handler as EventListener)
    return () => window.removeEventListener('car-media-key', handler as EventListener)
  }, [bump, playBtnRef, prevBtnRef, nextBtnRef, onPrev])
}
