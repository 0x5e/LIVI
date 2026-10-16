import { Typography } from '@mui/material'
import { SettingsNode } from '@renderer/routes'
import type { Config } from '@shared/types'
import { ReactNode } from 'react'
import { SettingsRowIcon } from '../settingsRowIcon'
import { StackItem } from '../stackItem'

type Props = {
  label: string
  node?: SettingsNode<Config>
  icon?: string
  children?: ReactNode
  focusable?: boolean
}

export const SettingsItemRow = ({ label, node, icon, children, focusable }: Props) => {
  return (
    <StackItem node={node} focusable={focusable} ownIcon={icon !== undefined}>
      {icon !== undefined && <SettingsRowIcon name={icon} />}
      <Typography>{label}</Typography>
      {children}
    </StackItem>
  )
}
