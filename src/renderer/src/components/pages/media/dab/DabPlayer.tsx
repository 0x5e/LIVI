import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt'
import SignalCellularAlt1BarIcon from '@mui/icons-material/SignalCellularAlt1Bar'
import SignalCellularAlt2BarIcon from '@mui/icons-material/SignalCellularAlt2Bar'
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import { Box, Typography } from '@mui/material'
import type { Action, DabSignal } from '@shared/core/contract'
import { coreAction, useLiviStore } from '@store/store'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Controls, RoundButton } from '../components'
import { OPTIMISTIC_PLAY_TIMEOUT_MS } from '../constants'
import { useCarMediaKeys, useElementSize, useOptimisticPlaying, usePressFeedback } from '../hooks'
import { clamp } from '../utils'
import { mediaControlOps } from '../utils/mediaControllOps'
import { mediaScaleOps } from '../utils/mediaScaleOps'
import { StationBadge } from './StationBadge'
import { StationBand } from './StationBand'

const act = (action: Action) => {
  coreAction(action).catch((err) => console.warn('[dab] action failed', err))
}

const SignalBars = ({ signal, px }: { signal: DabSignal; px: number }) => {
  if (!signal.locked) return <Box sx={{ width: px, height: px, flex: 'none' }} />
  const Icon =
    signal.quality >= 80
      ? SignalCellularAltIcon
      : signal.quality >= 40
        ? SignalCellularAlt2BarIcon
        : SignalCellularAlt1BarIcon
  return <Icon aria-label={`${signal.quality} %`} color="primary" sx={{ fontSize: px }} />
}

export const DabPlayer = () => {
  const { t } = useTranslation()
  const [rootRef, { w, h }] = useElementSize<HTMLDivElement>()
  const dab = useLiviStore((s) => s.dab)

  const prevBtnRef = useRef<HTMLButtonElement | null>(null)
  const playBtnRef = useRef<HTMLButtonElement | null>(null)
  const nextBtnRef = useRef<HTMLButtonElement | null>(null)
  const allowBackwardOnceRef = useRef(false)
  const [focus, setFocus] = useState({ play: false, next: false, prev: false })
  const { press, bump } = usePressFeedback()
  const { uiPlaying, setOverride } = useOptimisticPlaying(dab?.playing ?? false, false, {
    timeoutMs: OPTIMISTIC_PLAY_TIMEOUT_MS
  })
  useCarMediaKeys({ bump, playBtnRef, prevBtnRef, nextBtnRef })
  const { onPlayPause, onPrev, onNext } = mediaControlOps({
    uiPlaying,
    onBump: bump,
    playBtnRef,
    prevBtnRef,
    allowBackwardOnceRef,
    nextBtnRef,
    setOverride
  })

  if (!dab) return null

  const { titlePx, artistPx, albumPx, pagePad, colGap, sectionGap, ctrlSize, ctrlGap } =
    mediaScaleOps({ w, h })
  const tile = Math.round(clamp(h * 0.26, 88, 140))
  const artPx = Math.max(0, Math.round(Math.min(h - tile - pagePad * 3 - 16, w * 0.38)))
  const iconPx = Math.round(ctrlSize * 0.46)
  const icon = { fontSize: iconPx, display: 'block' }
  const tuned = dab.stations.find((s) => s.serviceId === dab.station) ?? null

  return (
    <Box
      ref={rootRef}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: `${pagePad}px`,
        p: `${pagePad}px`,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: `minmax(0, 1fr) ${artPx}px`,
          columnGap: `${colGap}px`,
          alignItems: 'center'
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: `${sectionGap}px`,
            pl: 1
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              color="primary"
              sx={{ fontWeight: 800, fontSize: albumPx, letterSpacing: 1 }}
            >
              {t('media.dabSource')}
            </Typography>
            <Typography
              variant="h5"
              component="h2"
              noWrap
              sx={{ fontWeight: 800, fontSize: titlePx, lineHeight: 1.1, height: '1.1em' }}
            >
              {tuned?.label ?? t('media.dabSource')}
            </Typography>
            <Typography
              data-testid="dab-text"
              sx={{
                opacity: 0.9,
                fontSize: artistPx,
                lineHeight: 1.25,
                height: '2.5em',
                mt: 1,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }}
            >
              {dab.text ?? ''}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 0.5,
                height: Math.round((albumPx + 2) * 1.4)
              }}
            >
              <Typography noWrap sx={{ opacity: 0.7, fontSize: albumPx, lineHeight: 1.25 }}>
                {tuned ? `${tuned.ensemble} · ${tuned.channel}` : ''}
              </Typography>
              <SignalBars signal={dab.signal} px={albumPx + 2} />
            </Box>
          </Box>
          <Controls
            align="start"
            ctrlGap={ctrlGap}
            ctrlSize={ctrlSize}
            prevBtnRef={prevBtnRef}
            playBtnRef={playBtnRef}
            nextBtnRef={nextBtnRef}
            onSetFocus={setFocus}
            onPrev={onPrev}
            onPlayPause={onPlayPause}
            onNext={onNext}
            uiPlaying={uiPlaying}
            press={press}
            focus={focus}
            iconPx={iconPx}
          >
            <RoundButton
              size={ctrlSize}
              label={t('media.favorite')}
              pressed={tuned?.favorite ?? false}
              disabled={tuned === null}
              onClick={() =>
                tuned &&
                act({ kind: 'dabFavorite', serviceId: tuned.serviceId, favorite: !tuned.favorite })
              }
            >
              {tuned?.favorite ? (
                <StarRoundedIcon color="warning" sx={icon} />
              ) : (
                <StarBorderRoundedIcon sx={icon} />
              )}
            </RoundButton>
          </Controls>
        </Box>
        <Box
          sx={{
            width: artPx,
            height: artPx,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <StationBadge
            label={tuned?.label ?? 'DAB+'}
            image={tuned?.logo}
            size={Math.round(artPx * 0.7)}
          />
        </Box>
      </Box>
      {dab.stations.length === 0 ? (
        <Typography sx={{ opacity: 0.7, textAlign: 'center' }}>{t('media.noStations')}</Typography>
      ) : (
        <StationBand
          stations={dab.stations}
          tuned={dab.station}
          tile={tile}
          onPick={(serviceId) => act({ kind: 'dabPlay', serviceId })}
        />
      )}
    </Box>
  )
}
