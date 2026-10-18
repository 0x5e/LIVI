import PhoneIphoneRounded from '@mui/icons-material/PhoneIphoneRounded'
import type { DeviceView } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
import { CYCLE_SESSION_EVENT } from '../../constants'
import { useLiviStore } from '../../store/store'
import { overlayCard, overlayIcon, overlayText } from './overlayCard'

type Seen = { connected: Set<string>; active?: string }
type Content = { name: string; tick: number }

const phoneName = (phone?: DeviceView) => phone?.name || phone?.model

const card = (name: string) => (prev: Content | null) => ({ name, tick: (prev?.tick ?? 0) + 1 })

export function PhoneOverlay() {
  const devices = useLiviStore((s) => s.devices)
  const sessionCount = useLiviStore((s) => s.sessions.total)
  const ready = useLiviStore((s) => s.settings !== null)
  const enabled = useLiviStore((s) => s.settings?.overlayMessages !== false)
  const [content, setContent] = useState<Content | null>(null)
  const seen = useRef<Seen | null>(null)

  useEffect(() => {
    // With more phones the switch itself names the next one.
    if (sessionCount > 1) return
    const onCycle = () => {
      const name = phoneName(devices.find((d) => d.status === 'active'))
      if (name) setContent(card(name))
    }
    window.addEventListener(CYCLE_SESSION_EVENT, onCycle)
    return () => window.removeEventListener(CYCLE_SESSION_EVENT, onCycle)
  }, [devices, sessionCount])

  useEffect(() => {
    if (!ready) {
      seen.current = null
      return
    }
    const connected = new Set(devices.filter((d) => d.status !== 'offline').map((d) => d.id))
    const active = devices.find((d) => d.status === 'active')
    const before = seen.current
    seen.current = { connected, active: active?.id }
    // No news for the phones already there at start.
    if (!before) return
    const joined = devices.find((d) => connected.has(d.id) && !before.connected.has(d.id))
    const name = phoneName(joined ?? (active?.id !== before.active ? active : undefined))
    if (name) setContent(card(name))
  }, [devices, ready])

  if (!content || !enabled) return null

  return (
    <>
      <style>
        {'@keyframes liviPhoneOverlay{0%{opacity:0}12%{opacity:1}78%{opacity:1}100%{opacity:0}}'}
      </style>
      <div
        key={content.tick}
        aria-hidden
        style={{
          ...overlayCard,
          position: 'fixed',
          top: 16,
          right: 16,
          maxWidth: '60vw',
          opacity: 0,
          animation: 'liviPhoneOverlay 1500ms ease-in-out forwards'
        }}
      >
        <span style={overlayIcon}>
          <PhoneIphoneRounded fontSize="inherit" />
        </span>
        <span
          style={{
            ...overlayText,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {content.name}
        </span>
      </div>
    </>
  )
}
