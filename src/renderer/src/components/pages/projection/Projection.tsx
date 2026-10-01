// Icons
import CropPortraitOutlinedIcon from '@mui/icons-material/CropPortraitOutlined'
import { Box, useTheme } from '@mui/material'
import type { Config } from '@shared/types'
import { AudioCommand, CommandMapping } from '@shared/types/ProjectionEnums'
import { aaContentArea } from '@shared/utils'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { KeyCommand } from '../../../hooks/keysControl/types'
import { useFftPcm } from '../../../hooks/useFftPcm'
import {
  type ActiveProtocol,
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
  command: KeyCommand
  commandCounter: number
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

// Projection

const CarplayComponent: React.FC<CarplayProps> = ({
  receivingVideo,
  setReceivingVideo,
  settings,
  command,
  commandCounter
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname

  const theme = useTheme()

  // Zustand store
  const isStreaming = useStatusStore((s) => s.isStreaming)
  const setStreaming = useStatusStore((s) => s.setStreaming)
  const setActiveProtocol = useStatusStore((s) => s.setActiveProtocol)
  const isProjectionActive = useProjectionActive()
  const setAudioInfo = useLiviStore((s) => s.setAudioInfo)
  const setBluetoothPairedList = useLiviStore((s) => s.setBluetoothPairedList)
  const bumpAudioDevicesRevision = useLiviStore((s) => s.bumpAudioDevicesRevision)
  const negotiatedWidth = useLiviStore((s) => s.negotiatedWidth)
  const negotiatedHeight = useLiviStore((s) => s.negotiatedHeight)

  // Attention-driven UI switching (call / voiceAssistant)
  type AttentionKind = 'call' | 'voiceAssistant'
  type AttentionPayload = { kind: AttentionKind; active: boolean; phase?: string }

  const attentionBackPathRef = useRef<string | null>(null)
  const attentionSwitchedByRef = useRef<AttentionKind | null>(null)

  const prevPathnameRef = useRef(pathname)
  useEffect(() => {
    const prev = prevPathnameRef.current
    prevPathnameRef.current = pathname
    if (pathname !== '/' || prev === '/') return
    if (!isProjectionActive) return
    // Attention-driven switches (Siri / call) must NOT press the CarPlay home button:
    // 'home' dismisses an in-progress Siri session immediately.
    if (!attentionSwitchedByRef.current) window.projection.ipc.sendCommand('home')
    void window.projection.ipc.sendFrame().catch(() => {})
  }, [pathname, isProjectionActive])

  // Tell main when the projection surface is shown/hidden so the native
  // GStreamer video can be shown over the UI or hidden behind it
  useEffect(() => {
    const visible = pathname === '/'
    void window.projection.ipc.setVisible(visible).catch(() => {})
    document.documentElement.classList.toggle('show-video', visible && receivingVideo)
  }, [pathname, receivingVideo])

  useEffect(() => {
    console.log('[PROJECTION] projection active:', isProjectionActive)
  }, [isProjectionActive])

  const videoContainerRef = useRef<HTMLDivElement>(null)

  // If the user manually navigates away from projection, drop the return arm.
  useEffect(() => {
    if (pathname === '/') return
    if (!attentionSwitchedByRef.current) return
    attentionSwitchedByRef.current = null
  }, [pathname])

  // Overlay offset
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

  // Forward audio chunks to FFT (shared with the secondary windows via useFftPcm)
  useFftPcm()

  const gotoHostUI = useCallback(() => {
    if (location.pathname !== '/media') {
      navigate('/media', { replace: true })
    }
  }, [location.pathname, navigate])

  const applyAttention = useCallback(
    (p: AttentionPayload) => {
      const inProjection = location.pathname === '/'

      // ACTIVE: switch to projection
      if (p.active) {
        // Already on projection: the arm stays, and a second kind taking over inherits it.
        if (inProjection) {
          if (attentionSwitchedByRef.current) attentionSwitchedByRef.current = p.kind
          return
        }

        // Not on projection -> we will switch now, so arm return
        attentionBackPathRef.current = location.pathname
        attentionSwitchedByRef.current = p.kind

        navigate('/', { replace: true })
        return
      }

      // INACTIVE: only return if we previously switched because of this kind
      if (attentionSwitchedByRef.current !== p.kind) return

      const back = attentionBackPathRef.current

      // Return immediately. Siri's end is message-driven (speechMode -> none covers the
      // full session incl. the response), so there is nothing to debounce.
      attentionSwitchedByRef.current = null
      if (back && back !== '/' && location.pathname === '/') {
        navigate(back, { replace: true })
      }
    },
    [location.pathname, navigate]
  )

  // Settings/events from main
  useEffect(() => {
    const handler = (_evt: unknown, data: unknown) => {
      const d = (data ?? {}) as Record<string, unknown>
      const t = typeof d.type === 'string' ? d.type : undefined

      switch (t) {
        case 'bluetoothPairedList': {
          const raw =
            typeof d.payload === 'string'
              ? d.payload
              : typeof (d.payload as { data?: unknown } | undefined)?.data === 'string'
                ? ((d.payload as { data?: string }).data as string)
                : typeof d.data === 'string'
                  ? (d.data as string)
                  : ''

          setBluetoothPairedList(raw)
          break
        }
        case 'audioDevicesChanged': {
          bumpAudioDevicesRevision()
          break
        }
        case 'resolution': {
          const payload = d.payload as { width?: number; height?: number } | undefined
          if (payload && typeof payload.width === 'number' && typeof payload.height === 'number') {
            useLiviStore.setState({
              negotiatedWidth: payload.width,
              negotiatedHeight: payload.height
            })
          }
          break
        }

        case 'projection': {
          const shown = (d as { shown?: boolean }).shown === true
          setReceivingVideo(shown)
          setStreaming(shown)
          break
        }

        case 'audio': {
          const cmd = (d as { payload?: { command?: number } }).payload?.command
          if (typeof cmd !== 'number') break

          // Siri UI attention is driven by speechMode (voiceAssistantUi* commands), not
          // the speech audio stream, so it covers the full session incl. the response.
          if (cmd === AudioCommand.AudioPhonecallStart) {
            applyAttention({ kind: 'call', active: true, phase: 'active' })
          } else if (cmd === AudioCommand.AudioPhonecallStop) {
            applyAttention({ kind: 'call', active: false, phase: 'ended' })
          } else if (cmd === AudioCommand.AudioAttentionRinging) {
            applyAttention({ kind: 'call', active: true, phase: 'ringing' })
          }
          break
        }

        case 'audioInfo': {
          const p = d.payload as { sampleRate?: number } | undefined
          if (!p) break
          setAudioInfo({ sampleRate: p.sampleRate ?? 0 })
          break
        }

        case 'command': {
          const value = (d as { message?: { value?: number } }).message?.value
          if (typeof value !== 'number') break

          if (value === CommandMapping.requestHostUI) {
            gotoHostUI()
            break
          }
          if (value === CommandMapping.voiceAssistantUiActive) {
            applyAttention({ kind: 'voiceAssistant', active: true })
            break
          }
          if (value === CommandMapping.voiceAssistantUiIdle) {
            applyAttention({ kind: 'voiceAssistant', active: false })
            break
          }

          break
        }

        case 'session': {
          const protocol = (d as { protocol?: ActiveProtocol }).protocol ?? null
          setActiveProtocol(protocol)
          break
        }

        case 'failure': {
          setStreaming(false)
          setActiveProtocol(null)
          setReceivingVideo(false)
          break
        }
      }
    }

    const unsubscribe = window.projection.ipc.onEvent(handler)
    return unsubscribe
  }, [
    gotoHostUI,
    setReceivingVideo,
    navigate,
    setStreaming,
    isStreaming,
    setActiveProtocol,
    applyAttention,
    setAudioInfo,
    setBluetoothPairedList,
    bumpAudioDevicesRevision,
    settings.dashboards
  ])

  // Key commands. Fire only when the counter actually advances
  const lastSentCommandCounterRef = useRef(0)
  useEffect(() => {
    if (!commandCounter) return
    if (commandCounter === lastSentCommandCounterRef.current) return
    lastSentCommandCounterRef.current = commandCounter
    window.projection.ipc.sendCommand(command)
  }, [command, commandCounter])

  /* ------------------------------- UI binding ------------------------------ */

  const mode: 'idle' | 'phone' = !isProjectionActive ? 'idle' : 'phone'

  const inProjection = pathname === '/'
  const showProjectionOverlay = inProjection

  const resolvedNegotiatedWidth = negotiatedWidth ?? 0
  const resolvedNegotiatedHeight = negotiatedHeight ?? 0

  // The phone renders a user-chosen AR inside the transport tier
  const aaContent =
    resolvedNegotiatedWidth > 0 &&
    resolvedNegotiatedHeight > 0 &&
    settings.projectionWidth > 0 &&
    settings.projectionHeight > 0
      ? aaContentArea(
          { width: resolvedNegotiatedWidth, height: resolvedNegotiatedHeight },
          { width: settings.projectionWidth, height: settings.projectionHeight }
        )
      : null

  const visibleWidth = aaContent?.contentWidth ?? resolvedNegotiatedWidth
  const visibleHeight = aaContent?.contentHeight ?? resolvedNegotiatedHeight

  const touchHandlers = useProjectionMultiTouch(
    videoContainerRef,
    resolvedNegotiatedWidth > 0 && resolvedNegotiatedHeight > 0
      ? {
          streamWidth: resolvedNegotiatedWidth,
          streamHeight: resolvedNegotiatedHeight,
          cropLeft: Math.max(0, (resolvedNegotiatedWidth - visibleWidth) / 2),
          cropTop: Math.max(0, (resolvedNegotiatedHeight - visibleHeight) / 2),
          visibleWidth,
          visibleHeight
        }
      : undefined
  )

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
