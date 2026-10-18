import AccessTimeIcon from '@mui/icons-material/AccessTime'
import RouteIcon from '@mui/icons-material/Route'
import SignpostIcon from '@mui/icons-material/Signpost'
import { Box, Typography, useTheme } from '@mui/material'
import { useLiviStore } from '@store/store'
import { CENTER_X, NAV_DIVIDER_Y, NAV_Y } from '../dashboards/constants'
import { Clock } from './Clock'
import { ManeuverGraphic } from './ManeuverIcon'

export type NavMiniProps = {
  className?: string
  iconSize?: number
}

export function NavMini({ className, iconSize = 56 }: NavMiniProps) {
  const theme = useTheme()
  // Core writes the texts in the UI's language.
  const nav = useLiviStore((s) => s.navigation)

  if (!nav?.active) {
    return (
      <Box
        sx={{
          position: 'absolute',
          left: CENTER_X,
          top: NAV_Y,
          transform: 'translate(-50%, -50%)',
          width: 280,
          height: 120,
          display: 'grid',
          placeItems: 'center'
        }}
      >
        <Clock className={className} />
      </Box>
    )
  }

  const remainDistanceText = nav.maneuverDistanceText
  const maneuverText = nav.maneuverText
  const etaText = nav.timeLeftText
  const distanceLineText = remainDistanceText || maneuverText || '—'
  const maneuverImageBase64 = nav.image || undefined
  const hasManeuverImage = Boolean(maneuverImageBase64)
  const bottomLeftText = etaText || nav.roadName || '—'

  return (
    <Box
      className={className}
      sx={{
        position: 'absolute',
        left: CENTER_X,
        top: NAV_DIVIDER_Y,
        transform: 'translateX(-50%)',
        width: 280,
        minWidth: 0
      }}
    >
      {/* Grows upward so the divider stays at NAV_DIVIDER_Y. */}
      <Box
        sx={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          pb: 1.6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          color: theme.palette.text.primary
        }}
      >
        <Box sx={{ display: 'grid', placeItems: 'center' }}>
          <ManeuverGraphic
            imageBase64={maneuverImageBase64}
            type={nav.maneuverType ?? undefined}
            turnSide={nav.turnSide ?? undefined}
            size={iconSize}
          />
        </Box>

        <Typography
          sx={{
            mt: 1.6,
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1,
            textAlign: 'center',
            whiteSpace: 'nowrap'
          }}
        >
          {distanceLineText}
        </Typography>
      </Box>

      <Box
        sx={{
          width: hasManeuverImage ? '72%' : '100%',
          mx: 'auto',
          height: 1.4,
          borderRadius: 999,
          bgcolor: theme.palette.text.secondary,
          opacity: 0.35
        }}
      />

      <Box
        sx={{
          pt: 1.6,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: hasManeuverImage ? 'center' : 'space-between',
          gap: 2.2,
          whiteSpace: 'nowrap'
        }}
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.7, minWidth: 0 }}>
          {etaText ? (
            <AccessTimeIcon sx={{ fontSize: 22, opacity: 0.9 }} />
          ) : (
            <SignpostIcon sx={{ fontSize: 22, opacity: 0.9 }} />
          )}

          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 500,
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {bottomLeftText}
          </Typography>
        </Box>

        {!hasManeuverImage && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.7 }}>
            <RouteIcon sx={{ fontSize: 22, opacity: 0.9 }} />
            <Typography
              sx={{
                fontSize: 22,
                fontWeight: 500,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {nav.destinationDistanceText || '—'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
