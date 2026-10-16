import StarRoundedIcon from '@mui/icons-material/StarRounded'
import { Box, ButtonBase, Typography } from '@mui/material'
import type { DabStation } from '@shared/core/contract'
import { useEffect, useRef } from 'react'
import { StationBadge } from './StationBadge'
import { useDragScroll } from './useDragScroll'

type Props = {
  stations: DabStation[]
  tuned: number | null
  tile: number
  onPick: (serviceId: number) => void
}

export const StationBand = ({ stations, tuned, tile, onPick }: Props) => {
  const tunedRef = useRef<HTMLButtonElement | null>(null)
  const drag = useDragScroll<HTMLDivElement>()
  useEffect(() => {
    tunedRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [tuned])

  const logo = Math.round(tile * 0.55)
  return (
    <Box
      data-testid="station-band"
      {...drag}
      sx={{
        display: 'flex',
        gap: 1,
        p: 1,
        borderRadius: 3,
        background: 'rgba(255,255,255,0.06)',
        overflowX: 'auto',
        flex: 'none',
        scrollbarWidth: 'none',
        touchAction: 'pan-x',
        userSelect: 'none'
      }}
    >
      {stations
        .filter((st) => !st.hidden)
        .map((st, i) => {
          const on = st.serviceId === tuned
          return (
            <ButtonBase
              key={st.serviceId}
              ref={on ? tunedRef : undefined}
              aria-pressed={on}
              onClick={() => onPick(st.serviceId)}
              onMouseUp={(e) => e.currentTarget.blur()}
              sx={{
                position: 'relative',
                flex: 'none',
                width: tile,
                height: tile,
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 0.75,
                px: 0.75,
                borderRadius: 2.5,
                border: 2,
                borderColor: on ? 'primary.main' : 'transparent',
                background: on ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
                '&:focus, &.Mui-focusVisible': {
                  outline: 'none',
                  boxShadow: (theme) => `0 0 0 3px ${theme.palette.primary.main}`,
                  background: 'rgba(255,255,255,0.2)'
                }
              }}
            >
              <Typography
                variant="caption"
                sx={{ position: 'absolute', top: 4, right: 8, opacity: 0.7 }}
              >
                {i + 1}
              </Typography>
              <StationBadge label={st.label} image={st.logo} size={logo} />
              <Typography
                variant="caption"
                sx={{
                  width: '100%',
                  textAlign: 'center',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {st.shortLabel || st.label}
              </Typography>
              {st.favorite && (
                <StarRoundedIcon
                  data-testid="favorite-star"
                  color="warning"
                  sx={{ position: 'absolute', right: 4, bottom: 4, fontSize: 18 }}
                />
              )}
            </ButtonBase>
          )
        })}
    </Box>
  )
}
