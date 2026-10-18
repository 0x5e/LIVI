import CropPortraitOutlinedIcon from '@mui/icons-material/CropPortraitOutlined'
import { Box, useTheme } from '@mui/material'
import type { Config } from '@shared/types'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  reportShown,
  useLiviStore,
  useProjectionActive,
  useStatusStore
} from '../../../store/store'
import { useProjectionMultiTouch } from './hooks/useProjectionTouch'
import { ViewAreaMask } from './ViewAreaMask'

interface CarplayProps {
  receivingVideo: boolean
  setReceivingVideo: (v: boolean) => void
  settings: Config
}

function StatusOverlay({
  mode,
  show,
  offsetX = 0,
  offsetY = 0
}: {
  mode: 'idle' | 'phone'
  show: boolean
  offsetX?: number
  offsetY?: number
}) {
  const theme = useTheme()
  const isPhonePhase = mode === 'phone'

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-hidden={!show}
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: show ? 'block' : 'none',
        zIndex: 9
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: `calc(50% + ${offsetX}px)`,
          top: `calc(50% + ${offsetY}px)`,
          transform: 'translate(-50%, -50%)',
          display: 'grid',
          placeItems: 'center'
        }}
      >
        <CropPortraitOutlinedIcon
          sx={{
            fontSize: 84,
            color: theme.palette.text.primary,
            opacity: isPhonePhase ? 'var(--ui-breathe-opacity, 1)' : 0.55
          }}
        />
      </Box>
    </Box>
  )
}

const CarplayComponent: React.FC<CarplayProps> = ({
  receivingVideo,
  setReceivingVideo,
  settings
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  const theme = useTheme()

  const isStreaming = useStatusStore((s) => s.isStreaming)
  const clusterDashActive = useStatusStore((s) => s.clusterDashActive)
  const isProjectionActive = useProjectionActive()

  const frontMain = useLiviStore((s) => s.front?.main)
  const phoneActive = useLiviStore((s) => s.sessions.active !== null)

  useEffect(() => {
    setReceivingVideo(isStreaming)
  }, [isStreaming, setReceivingVideo])

  // Core shows the video plane while the projection or the cluster is in front
  useEffect(() => {
    reportShown('main', pathname === '/' ? 'projection' : clusterDashActive ? 'cluster' : 'livi')
  }, [pathname, clusterDashActive])

  useEffect(() => {
    document.documentElement.classList.toggle('show-video', pathname === '/' && receivingVideo)
  }, [pathname, receivingVideo])

  useEffect(() => {
    console.log('[PROJECTION] projection active:', isProjectionActive)
  }, [isProjectionActive])

  const videoContainerRef = useRef<HTMLDivElement>(null)

  // Core moves main on its own for a call, Siri or the phone handing the screen back.
  const backPathRef = useRef<string | null>(null)
  const prevFrontRef = useRef(frontMain)
  useEffect(() => {
    if (pathname !== '/') backPathRef.current = null
  }, [pathname])
  useEffect(() => {
    const prev = prevFrontRef.current
    prevFrontRef.current = frontMain
    if (prev === undefined || prev === frontMain) return
    if (frontMain === 'projection') {
      if (pathname === '/') return
      backPathRef.current = pathname
      navigate('/', { replace: true })
      return
    }
    if (prev !== 'projection' || pathname !== '/' || !phoneActive) return
    navigate(backPathRef.current ?? '/media', { replace: true })
    backPathRef.current = null
  }, [frontMain, pathname, phoneActive, navigate])

  const [overlayX, setOverlayX] = useState(0)
  const [overlayY, setOverlayY] = useState(0)

  useLayoutEffect(() => {
    const getAnchor = () => document.getElementById('content-root')

    const recalc = () => {
      const r = getAnchor()?.getBoundingClientRect()
      if (!r) return

      const contentCenterX = r.left + r.width / 2
      const contentCenterY = r.top + r.height / 2

      const windowCenterX = window.innerWidth / 2
      const windowCenterY = window.innerHeight / 2

      setOverlayX(contentCenterX - windowCenterX)
      setOverlayY(contentCenterY - windowCenterY)
    }

    recalc()
    const raf = requestAnimationFrame(recalc)

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recalc) : null
    const anchor = getAnchor()
    if (ro && anchor) ro.observe(anchor)

    window.addEventListener('resize', recalc)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', recalc)
      ro?.disconnect()
    }
  }, [settings?.hand])

  const mode: 'idle' | 'phone' = !isProjectionActive ? 'idle' : 'phone'

  const inProjection = pathname === '/'
  const showProjectionOverlay = inProjection

  // Core maps a point on the picture onto the phone's stream.
  const touchHandlers = useProjectionMultiTouch(videoContainerRef)

  return (
    <div
      id="projection-root"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        touchAction: 'none',
        visibility: showProjectionOverlay ? 'visible' : 'hidden',
        opacity: showProjectionOverlay ? 1 : 0,
        transition: 'opacity 120ms ease',
        pointerEvents: inProjection && isStreaming ? 'auto' : 'none',
        zIndex: showProjectionOverlay ? 999 : -1
      }}
    >
      {pathname === '/' && (
        <StatusOverlay show={!receivingVideo} mode={mode} offsetX={overlayX} offsetY={overlayY} />
      )}

      <div
        id="videoContainer"
        ref={videoContainerRef}
        {...touchHandlers}
        style={{
          height: '100%',
          width: '100%',
          padding: 0,
          margin: 0,
          display: 'block',
          touchAction: 'none',
          backgroundColor: receivingVideo ? 'transparent' : theme.palette.background.default,
          visibility: receivingVideo ? 'visible' : 'hidden',
          zIndex: receivingVideo ? 1 : -1,
          position: 'relative',
          overflow: 'hidden'
        }}
      />

      <ViewAreaMask
        visible={receivingVideo}
        displayWidth={settings.projectionWidth}
        displayHeight={settings.projectionHeight}
        insets={{
          top: settings.projectionViewAreaTop ?? 0,
          bottom: settings.projectionViewAreaBottom ?? 0,
          left: settings.projectionViewAreaLeft ?? 0,
          right: settings.projectionViewAreaRight ?? 0
        }}
      />
    </div>
  )
}

export const Projection = React.memo(CarplayComponent)
