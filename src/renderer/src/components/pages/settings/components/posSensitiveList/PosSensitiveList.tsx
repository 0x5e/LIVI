import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Box, IconButton, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { StackItem } from '../stackItem'

export type PosRow = {
  id: string
  label: string
  /** Takes the row's icon slot. */
  leading?: ReactNode
  /** Controls in front of the arrows. */
  trailing?: ReactNode
  dimmed?: boolean
}

type Props = {
  rows: PosRow[]
  onMove: (id: string, by: -1 | 1) => void
}

/** For trailing buttons, so they match the arrows. */
export const rowIconSx = { fontSize: 'clamp(22px, 4.2vh, 34px)' } as const
export const rowButtonSx = { padding: 'clamp(4px, 1.2vh, 10px)' } as const
const slotStyle = {
  flex: 'none',
  display: 'flex',
  marginLeft: 'var(--livi-row-pad, 12px)'
} as const

export const PosSensitiveList = ({ rows, onMove }: Props) => {
  const { t } = useTranslation()
  return (
    <>
      {rows.map((row, i) => (
        <StackItem key={row.id} ownIcon={row.leading !== undefined} dimmed={row.dimmed}>
          {row.leading !== undefined && <span style={slotStyle}>{row.leading}</span>}
          <Typography>{row.label}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {row.trailing}
            <IconButton
              sx={rowButtonSx}
              aria-label={t('settings.moveUp')}
              disabled={i === 0}
              onClick={() => onMove(row.id, -1)}
            >
              <ExpandLessIcon sx={rowIconSx} />
            </IconButton>
            <IconButton
              sx={rowButtonSx}
              aria-label={t('settings.moveDown')}
              disabled={i === rows.length - 1}
              onClick={() => onMove(row.id, 1)}
            >
              <ExpandMoreIcon sx={rowIconSx} />
            </IconButton>
          </Box>
        </StackItem>
      ))}
    </>
  )
}
