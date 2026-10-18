import type { MediaControl } from '@shared/core/contract'
import { RefObject } from 'react'
import { coreAction } from '../../../../store/store'
import { MediaEventType } from '../types'
import { flash } from './flash'

const press = (control: MediaControl) => {
  coreAction({ kind: 'media', control }).catch(() => {})
}

export const mediaControlOps = ({
  uiPlaying,
  onBump,
  playBtnRef,
  prevBtnRef,
  allowBackwardOnceRef,
  nextBtnRef,
  setOverride
}: {
  uiPlaying: boolean
  onBump: (type: MediaEventType) => void
  playBtnRef: RefObject<HTMLButtonElement | null>
  prevBtnRef: RefObject<HTMLButtonElement | null>
  allowBackwardOnceRef: RefObject<boolean>
  nextBtnRef: RefObject<HTMLButtonElement | null>
  setOverride: (type: boolean) => void
}) => {
  const handlePlayPause = () => {
    onBump(MediaEventType.PLAY)
    flash(playBtnRef)
    setOverride(!uiPlaying)

    press('playPause')
  }

  const handlePrev = () => {
    onBump(MediaEventType.PREV)
    flash(prevBtnRef)
    allowBackwardOnceRef.current = true
    press('prev')
  }
  const handleNext = () => {
    onBump(MediaEventType.NEXT)
    flash(nextBtnRef)
    press('next')
  }

  return {
    onPlayPause: handlePlayPause,
    onPrev: handlePrev,
    onNext: handleNext
  }
}
