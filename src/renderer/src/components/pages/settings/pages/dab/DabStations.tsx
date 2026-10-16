import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import { IconButton, Typography } from '@mui/material'
import { StationBadge } from '@renderer/components/pages/media/dab/StationBadge'
import type { Action } from '@shared/core/contract'
import { coreAction, useLiviStore } from '@store/store'
import { useTranslation } from 'react-i18next'
import {
  PosSensitiveList,
  rowButtonSx,
  rowIconSx
} from '../../components/posSensitiveList/PosSensitiveList'

const act = (action: Action) => {
  coreAction(action).catch((err) => console.warn('[dab] action failed', err))
}

export function DabStations() {
  const { t } = useTranslation()
  const stations = useLiviStore((s) => s.dab?.stations)
  if (!stations) return null
  if (stations.length === 0) {
    return <Typography sx={{ opacity: 0.7, p: 2 }}>{t('media.noStations')}</Typography>
  }

  return (
    <PosSensitiveList
      onMove={(id, by) => act({ kind: 'dabMove', serviceId: Number(id), by })}
      rows={stations.map((st) => ({
        id: String(st.serviceId),
        label: st.label,
        leading: <StationBadge label={st.label} image={st.logo} size={28} />,
        dimmed: st.hidden,
        trailing: (
          <>
            <IconButton
              sx={rowButtonSx}
              aria-label={t('media.favorite')}
              aria-pressed={st.favorite}
              onClick={() =>
                act({ kind: 'dabFavorite', serviceId: st.serviceId, favorite: !st.favorite })
              }
            >
              {st.favorite ? (
                <StarRoundedIcon color="warning" sx={rowIconSx} />
              ) : (
                <StarBorderRoundedIcon sx={rowIconSx} />
              )}
            </IconButton>
            <IconButton
              sx={rowButtonSx}
              aria-label={st.hidden ? t('media.showStation') : t('media.hideStation')}
              aria-pressed={st.hidden}
              onClick={() => act({ kind: 'dabHide', serviceId: st.serviceId, hidden: !st.hidden })}
            >
              {st.hidden ? (
                <VisibilityOffRoundedIcon sx={rowIconSx} />
              ) : (
                <VisibilityRoundedIcon sx={rowIconSx} />
              )}
            </IconButton>
          </>
        )
      }))}
    />
  )
}
