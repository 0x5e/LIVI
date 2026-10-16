import { Box, ButtonBase } from '@mui/material'
import type { Action } from '@shared/core/contract'
import { coreAction, useLiviStore } from '@store/store'
import { useTranslation } from 'react-i18next'

export const SourceTabs = () => {
  const { t } = useTranslation()
  const stick = useLiviStore((s) => s.dab?.receiver != null)
  const dabActive = useLiviStore((s) => s.dab?.active === true)

  if (!stick) return null

  const pick = (action: Action) =>
    coreAction(action).catch((err) => console.warn('[media] source not switched', err))

  const tab = (label: string, on: boolean, action: Action) => (
    <ButtonBase
      role="tab"
      aria-selected={on}
      onClick={() => !on && pick(action)}
      sx={{
        px: 2.5,
        py: 0.75,
        fontSize: 16,
        fontWeight: 700,
        borderRadius: 999,
        opacity: on ? 1 : 0.65,
        borderBottom: 2,
        borderColor: on ? 'primary.main' : 'transparent',
        '&:focus, &.Mui-focusVisible': {
          outline: 'none',
          boxShadow: (theme) => `0 0 0 3px ${theme.palette.primary.main}`
        }
      }}
      onMouseUp={(e) => e.currentTarget.blur()}
    >
      {label}
    </ButtonBase>
  )

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, flex: 'none' }}>
      <Box
        role="tablist"
        aria-label={t('media.source')}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1,
          py: 0.5,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)'
        }}
      >
        {tab(t('media.phoneSource'), !dabActive, { kind: 'dabStop' })}
        <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.75, background: 'divider' }} />
        {tab(t('media.dabSource'), dabActive, { kind: 'dabResume' })}
      </Box>
    </Box>
  )
}
