import { Button, CircularProgress } from '@mui/material'
import { SettingsItemRow } from '../settingsItemRow'

type Props = {
  label?: string
  buttonLabel: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'text' | 'outlined' | 'contained'
  icon?: string
}

export const SettingsButtonRow = ({
  label = '',
  buttonLabel,
  onClick,
  disabled,
  loading,
  variant = 'contained',
  icon
}: Props) => {
  return (
    <SettingsItemRow label={label} icon={icon}>
      <Button
        variant={variant}
        onClick={onClick}
        disabled={disabled || loading}
        sx={{ minWidth: '7.5rem', flexShrink: 0 }}
      >
        {loading ? <CircularProgress size={18} color="inherit" /> : buttonLabel}
      </Button>
    </SettingsItemRow>
  )
}
