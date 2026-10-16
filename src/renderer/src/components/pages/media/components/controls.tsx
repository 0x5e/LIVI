import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious'
import { useTheme } from '@mui/material/styles'
import type React from 'react'
import { RefObject, SetStateAction, useState } from 'react'
import { circleBtnStyle } from '../styles'

type ControlsProps = {
  ctrlGap: number
  ctrlSize: number
  prevBtnRef: RefObject<HTMLButtonElement | null>
  playBtnRef: RefObject<HTMLButtonElement | null>
  nextBtnRef: RefObject<HTMLButtonElement | null>
  onSetFocus: (
    focus: SetStateAction<{
      play: boolean
      next: boolean
      prev: boolean
    }>
  ) => void
  onPrev: () => void
  onPlayPause: () => void
  onNext: () => void
  uiPlaying: boolean
  press: {
    play?: boolean
    next?: boolean
    prev?: boolean
  }
  focus: {
    play?: boolean
    next?: boolean
    prev?: boolean
  }
  iconPx: number
  align?: 'center' | 'start'
  children?: React.ReactNode
}

type RoundButtonProps = {
  size: number
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

export const RoundButton = ({
  size,
  label,
  pressed,
  disabled,
  onClick,
  children
}: RoundButtonProps) => {
  const theme = useTheme()
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      style={{
        ...circleBtnStyle(size, { focused, hovered, ringColor: theme.palette.primary.main }),
        opacity: disabled ? 0.4 : 1
      }}
    >
      {children}
    </button>
  )
}

export const Controls = ({
  ctrlGap,
  ctrlSize,
  prevBtnRef,
  playBtnRef,
  nextBtnRef,
  onSetFocus: setFocus,
  onPrev,
  onPlayPause,
  onNext,
  uiPlaying,
  press,
  focus,
  iconPx,
  align = 'center',
  children
}: ControlsProps) => {
  const theme = useTheme()
  const ringColor = theme.palette.primary.main

  const [hover, setHover] = useState<{ play: boolean; next: boolean; prev: boolean }>({
    play: false,
    next: false,
    prev: false
  })

  const hoverProps = (
    key: 'play' | 'next' | 'prev'
  ): {
    onPointerEnter: (e: React.PointerEvent<HTMLButtonElement>) => void
    onPointerLeave: () => void
  } => ({
    onPointerEnter: (e) => {
      if (e.pointerType === 'mouse') setHover((h) => ({ ...h, [key]: true }))
    },
    onPointerLeave: () => setHover((h) => ({ ...h, [key]: false }))
  })

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: align
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: ctrlGap,
          alignItems: 'center',
          height: ctrlSize
        }}
      >
        {/* PREVIOUS */}
        <button
          ref={prevBtnRef}
          onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
          onFocus={() => setFocus((f) => ({ ...f, prev: true }))}
          onBlur={() => setFocus((f) => ({ ...f, prev: false }))}
          {...hoverProps('prev')}
          onClick={onPrev}
          aria-label="Previous"
          style={circleBtnStyle(ctrlSize, {
            pressed: !!press.prev,
            focused: !!focus.prev,
            hovered: hover.prev,
            ringColor
          })}
        >
          <SkipPreviousIcon sx={{ fontSize: iconPx, display: 'block', lineHeight: 0 }} />
        </button>

        {/* PLAY / PAUSE */}
        <button
          ref={playBtnRef}
          onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
          onFocus={() => setFocus((f) => ({ ...f, play: true }))}
          onBlur={() => setFocus((f) => ({ ...f, play: false }))}
          {...hoverProps('play')}
          onClick={onPlayPause}
          aria-label="Play/Pause"
          aria-pressed={uiPlaying}
          style={circleBtnStyle(ctrlSize, {
            pressed: !!press.play,
            focused: !!focus.play,
            hovered: hover.play,
            ringColor
          })}
        >
          {uiPlaying ? (
            <PauseIcon sx={{ fontSize: iconPx, display: 'block', lineHeight: 0 }} />
          ) : (
            <PlayArrowIcon
              sx={{
                fontSize: iconPx,
                display: 'block',
                lineHeight: 0,
                transform: 'translateX(1px)'
              }}
            />
          )}
        </button>

        {/* NEXT */}
        <button
          ref={nextBtnRef}
          onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
          onFocus={() => setFocus((f) => ({ ...f, next: true }))}
          onBlur={() => setFocus((f) => ({ ...f, next: false }))}
          {...hoverProps('next')}
          onClick={onNext}
          aria-label="Next"
          style={circleBtnStyle(ctrlSize, {
            pressed: !!press.next,
            focused: !!focus.next,
            hovered: hover.next,
            ringColor
          })}
        >
          <SkipNextIcon sx={{ fontSize: iconPx, display: 'block', lineHeight: 0 }} />
        </button>
        {children}
      </div>
    </div>
  )
}
