import type { ReactNode } from 'react'
import { overlayCard, overlayIcon, overlayText } from './overlayCard'

type Props = {
  icon: ReactNode
  /** 0 to 1. */
  level: number
  shown: boolean
}

export function LevelOverlay({ icon, level, shown }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100)

  return (
    <div
      aria-hidden
      style={{
        ...overlayCard,
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: shown ? 1 : 0,
        transition: 'opacity 180ms ease-in-out'
      }}
    >
      <span style={overlayIcon}>{icon}</span>
      <div
        style={{
          width: 'clamp(120px, 24vw, 280px)',
          height: 6,
          borderRadius: 3,
          background: 'rgba(255, 255, 255, 0.25)',
          overflow: 'hidden'
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--ui-highlight)' }} />
      </div>
      <span
        style={{
          ...overlayText,
          display: 'grid',
          justifyItems: 'end',
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {/* Holds the width of the widest value, so the centred card does not move. */}
        <span style={{ gridArea: '1 / 1', visibility: 'hidden' }}>100%</span>
        <span style={{ gridArea: '1 / 1' }}>{pct}%</span>
      </span>
    </div>
  )
}
