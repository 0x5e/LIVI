import AccessTimeIcon from '@mui/icons-material/AccessTime'
import AppsIcon from '@mui/icons-material/Apps'
import NavigationOutlinedIcon from '@mui/icons-material/NavigationOutlined'
import PlaceIcon from '@mui/icons-material/Place'
import RouteIcon from '@mui/icons-material/Route'
import SignpostIcon from '@mui/icons-material/Signpost'
import { Box, Stack, Typography } from '@mui/material'

import { useLiviStore } from '@store/store'
import { CENTER_X, NAV_DIVIDER_Y, NAV_Y } from '../dashboards/constants'
import { ManeuverGraphic } from './ManeuverIcon'

export type NavFullProps = {
  className?: string
}

export function NavFull({ className }: NavFullProps) {
  // Core writes the texts in the UI's language.
  const nav = useLiviStore((s) => s.navigation)

  if (!nav?.active) {
    return (
      <Box
        className={className}
        sx={{
          position: 'absolute',
          left: CENTER_X,
          top: NAV_Y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          display: 'grid',
          placeItems: 'center'
        }}
      >
        <NavigationOutlinedIcon sx={{ fontSize: 84, opacity: 0.55 }} />
      </Box>
    )
  }

  const remainDistanceText = nav.maneuverDistanceText
  const maneuverText = nav.maneuverText
  const maneuverImageBase64 = nav.image || undefined
  const hasManeuverImage = Boolean(maneuverImageBase64)
  const maneuverType = nav.maneuverType ?? undefined
  const turnSide = nav.turnSide ?? undefined

  const maneuverBlock = hasManeuverImage ? (
    <Stack spacing={1.2} sx={{ alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 92 }}>
        <ManeuverGraphic
          imageBase64={maneuverImageBase64}
          type={maneuverType}
          turnSide={turnSide}
          size={72}
        />

        {remainDistanceText && (
          <Typography
            sx={{ mt: 0.5, fontSize: 20, fontWeight: 600, letterSpacing: 0.2, lineHeight: 1 }}
          >
            {remainDistanceText}
          </Typography>
        )}
      </Box>

      {maneuverText && (
        <Typography variant="h5" sx={{ lineHeight: 1.1, textAlign: 'center' }}>
          {maneuverText}
        </Typography>
      )}
    </Stack>
  ) : (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 92 }}>
        <ManeuverGraphic
          imageBase64={maneuverImageBase64}
          type={maneuverType}
          turnSide={turnSide}
          size={72}
        />

        {remainDistanceText && (
          <Typography
            sx={{ mt: 0.5, fontSize: 20, fontWeight: 600, letterSpacing: 0.2, lineHeight: 1 }}
          >
            {remainDistanceText}
          </Typography>
        )}
      </Box>

      <Box sx={{ minWidth: 0, textAlign: 'left' }}>
        {maneuverText && (
          <Typography variant="h5" sx={{ lineHeight: 1.1, whiteSpace: 'nowrap' }}>
            {maneuverText}
          </Typography>
        )}

        {nav.roadName && (
          <Stack direction="row" spacing={1} component="div" sx={{ mt: 0.6, alignItems: 'center' }}>
            <SignpostIcon fontSize="small" sx={{ opacity: 0.85 }} />
            <Typography variant="body2" sx={{ opacity: 0.85 }} noWrap>
              {nav.roadName}
            </Typography>
          </Stack>
        )}

        {nav.afterRoadName && (
          <Typography
            variant="body1"
            noWrap
            sx={{ display: 'block', mt: 0.9, lineHeight: 1.1, textAlign: 'left' }}
          >
            {nav.afterRoadName}
          </Typography>
        )}
      </Box>
    </Stack>
  )

  return (
    <Box
      className={className}
      sx={{
        position: 'absolute',
        left: CENTER_X,
        top: NAV_DIVIDER_Y,
        transform: 'translateX(-50%)',
        width: 'fit-content',
        maxWidth: 'min(920px, 100%)',
        pointerEvents: 'none'
      }}
    >
      {/* Grows upward so the divider stays at NAV_DIVIDER_Y. */}
      <Box
        sx={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          pb: 2.6,
          display: 'flex',
          justifyContent: 'center'
        }}
      >
        {maneuverBlock}
      </Box>

      <Box
        sx={{
          width: hasManeuverImage ? '72%' : '100%',
          mx: 'auto',
          height: 1.4,
          borderRadius: 999,
          bgcolor: 'text.secondary',
          opacity: 0.35
        }}
      />

      <Stack
        direction="row"
        spacing={3}
        sx={{
          pt: 2.6,
          flexWrap: 'wrap',
          justifyContent: 'center',
          rowGap: 1
        }}
      >
        {hasManeuverImage && nav.roadName && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              minWidth: 0
            }}
          >
            <SignpostIcon fontSize="small" sx={{ opacity: 0.85 }} />
            <Typography variant="body2" sx={{ opacity: 0.85 }} noWrap>
              {nav.roadName}
            </Typography>
          </Stack>
        )}

        {nav.timeLeftText && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <AccessTimeIcon fontSize="small" />
            <Typography variant="body1">{nav.timeLeftText}</Typography>
          </Stack>
        )}

        {nav.destinationDistanceText && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <RouteIcon fontSize="small" />
            <Typography variant="body1">{nav.destinationDistanceText}</Typography>
          </Stack>
        )}

        {nav.destinationName && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              minWidth: 0
            }}
          >
            <PlaceIcon fontSize="small" />
            <Typography variant="body1" noWrap sx={{ minWidth: 0 }}>
              {nav.destinationName}
            </Typography>
          </Stack>
        )}

        {nav.appName && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              minWidth: 0
            }}
          >
            <AppsIcon fontSize="small" />
            <Typography variant="body2" sx={{ opacity: 0.85 }} noWrap>
              {nav.appName}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
