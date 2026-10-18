import type { CSSProperties } from 'react'

export const overlayCard: CSSProperties = {
  zIndex: 4000,
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '10px 20px',
  borderRadius: 14,
  background: 'rgba(18, 18, 20, 0.72)',
  color: 'rgba(255, 255, 255, 0.92)',
  boxShadow: '0 6px 22px rgba(0, 0, 0, 0.4)'
}

export const overlayIcon: CSSProperties = { display: 'flex', fontSize: 28 }

export const overlayText: CSSProperties = { fontSize: 20, fontWeight: 500 }
