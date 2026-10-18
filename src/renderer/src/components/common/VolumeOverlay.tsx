import VolumeDownRounded from '@mui/icons-material/VolumeDownRounded'
import VolumeOffRounded from '@mui/icons-material/VolumeOffRounded'
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded'
import { ROUTES } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useLiviStore } from '../../store/store'
import { LevelOverlay } from './LevelOverlay'

const SHOWN_MS = 1500

export function VolumeOverlay() {
  const level = useLiviStore((s) => s.settings?.huVolume)
  const enabled = useLiviStore((s) => s.settings?.overlayMessages !== false)
  const { pathname } = useLocation()
  const [shown, setShown] = useState(false)
  const seen = useRef(level)
  const allowed = useRef(false)
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // The settings page shows the value at its own slider.
  allowed.current = enabled && !pathname.startsWith(ROUTES.SETTINGS)

  useEffect(() => () => clearTimeout(hide.current), [])

  useEffect(() => {
    const before = seen.current
    seen.current = level
    if (before === undefined || level === undefined || before === level || !allowed.current) {
      return
    }
    setShown(true)
    clearTimeout(hide.current)
    hide.current = setTimeout(() => setShown(false), SHOWN_MS)
  }, [level])

  if (level === undefined) return null

  const icon =
    level === 0 ? (
      <VolumeOffRounded fontSize="inherit" />
    ) : level < 0.5 ? (
      // Material draws this speaker 2 of 24 units further right than in VolumeUp.
      <VolumeDownRounded fontSize="inherit" style={{ transform: 'translateX(-8.333%)' }} />
    ) : (
      <VolumeUpRounded fontSize="inherit" />
    )

  return <LevelOverlay icon={icon} level={level} shown={shown} />
}
