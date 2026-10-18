import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import { msToClock } from '../../../../utils'

const SEEK_STEP_MS = 15000
/** The phone confirms a seek with its next update, until then the bar stays at the target. */
const SEEK_HOLD_MS = 3000
const SEEK_SETTLED_MS = 1500
const FOCUS_GLOW = '0 0 8px 0 color-mix(in srgb, var(--ui-highlight) 35%, transparent)'

type ProgressProps = {
  elapsedMs: number
  progressH: number
  totalMs: number
  pct: number
  onSeek?: (ms: number) => void
}

export const ProgressBar = ({ elapsedMs, progressH, totalMs, pct, onSeek }: ProgressProps) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragMs, setDragMs] = useState<number | null>(null)
  const [heldMs, setHeldMs] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (heldMs === null) return
    const timer = setTimeout(() => setHeldMs(null), SEEK_HOLD_MS)
    return () => clearTimeout(timer)
  }, [heldMs])

  useEffect(() => {
    if (heldMs !== null && Math.abs(elapsedMs - heldMs) < SEEK_SETTLED_MS) setHeldMs(null)
  }, [elapsedMs, heldMs])

  const seekable = onSeek !== undefined && totalMs > 0
  const targetMs = dragMs ?? heldMs
  const shownMs = targetMs ?? elapsedMs
  const shownPct = targetMs === null ? pct : (targetMs / totalMs) * 100
  const left = msToClock(shownMs)
  const right = `-${msToClock(Math.max(0, totalMs - shownMs))}`

  const msAt = (clientX: number): number => {
    const rect = (trackRef.current as HTMLDivElement).getBoundingClientRect()
    const share = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    return Math.round(Math.min(1, Math.max(0, share)) * totalMs)
  }

  const seek = onSeek as (ms: number) => void
  // The played time runs on as a fraction, core takes whole ms only.
  const commit = (ms: number) => {
    const target = Math.round(ms)
    setDragMs(null)
    setHeldMs(target)
    seek(target)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragMs(msAt(e.clientX))
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragMs !== null) setDragMs(msAt(e.clientX))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragMs !== null) commit(msAt(e.clientX))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -SEEK_STEP_MS, ArrowRight: SEEK_STEP_MS }[e.key]
    if (step === undefined) return
    e.preventDefault()
    commit(Math.min(totalMs, Math.max(0, shownMs + step)))
  }

  const knobH = Math.round(progressH * 2.4)
  const knobW = Math.round(knobH * 1.75)
  const transition = dragMs === null ? '120ms linear' : null

  const track = (
    <div
      ref={trackRef}
      style={{
        minWidth: 0,
        height: progressH,
        borderRadius: progressH / 1.6,
        background: 'rgba(255,255,255,0.28)',
        overflow: 'hidden',
        boxShadow: focused ? FOCUS_GLOW : undefined
      }}
    >
      <div
        style={{
          width: `${shownPct}%`,
          height: '100%',
          transition: transition ? `width ${transition}` : 'none',
          background: 'var(--ui-highlight)'
        }}
      />
    </div>
  )

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        display: 'grid',
        gridTemplateColumns: 'minmax(3.5em, max-content) minmax(0, 1fr) minmax(3.5em, max-content)',
        alignItems: 'center',
        columnGap: 12,
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          fontSize: 14,
          opacity: 0.85,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'clip'
        }}
      >
        {left}
      </div>

      {seekable ? (
        <div
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={totalMs}
          aria-valuenow={shownMs}
          aria-valuetext={left}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDragMs(null)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ position: 'relative', minWidth: 0, touchAction: 'none', outline: 'none' }}
        >
          {/* A thin track is hard to hit with a finger. */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: -knobH, bottom: -knobH }} />
          {track}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: `clamp(${knobW / 2}px, ${shownPct}%, calc(100% - ${knobW / 2}px))`,
              width: knobW,
              height: knobH,
              borderRadius: knobH / 2,
              transform: 'translate(-50%, -50%)',
              background: 'var(--ui-highlight)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
              transition: transition ? `left ${transition}` : 'none'
            }}
          />
        </div>
      ) : (
        track
      )}

      <div
        style={{
          fontSize: 14,
          opacity: 0.85,
          textAlign: 'right',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'clip'
        }}
      >
        {right}
      </div>
    </div>
  )
}
