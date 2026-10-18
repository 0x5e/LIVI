import { Typography } from '@mui/material'
import { SettingsNode } from '@renderer/routes'
import { useLiviStore } from '@renderer/store/store'
import type { Config } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { Devices } from '../pages/devices'
import { getValueByPath, isNodeDisabled } from '../utils'
import { PosSensitiveList } from './posSensitiveList/PosSensitiveList'
import { SettingsFieldControl } from './SettingsFieldControl'
import { SettingsItemRow } from './settingsItemRow'
import { StackItem } from './stackItem'

type Props<T, K> = {
  node: SettingsNode<Config>
  value: T
  state: K
  onChange: (v: T) => void
  onClick?: () => void
  onItemNavigate?: (segment: string) => void
  savedLabel?: string
  onLabelChange?: (label: string) => void
}

export const SettingsFieldRow = <T, K>({
  node,
  value,
  state,
  onChange,
  onClick,
  onItemNavigate,
  savedLabel,
  onLabelChange
}: Props<T, K>) => {
  const { t } = useTranslation()
  const rowDisabled = useLiviStore((s) => isNodeDisabled(node, s.system))
  const label = node.labelKey ? t(node.labelKey, node.label) : node.label

  if (node.type === 'posList') {
    return (
      <PosSensitiveList
        node={node}
        value={value}
        onChange={(v) => onChange(v as unknown as T)}
        onItemClick={onItemNavigate}
      />
    )
  }

  if (node.type === 'btDeviceList') {
    return <Devices />
  }

  if (onClick) {
    return (
      <StackItem
        withForwardIcon
        onClick={onClick}
        disabled={rowDisabled}
        node={node}
        value={getValueByPath(state, node.path)}
        savedLabel={savedLabel}
        showValue={node.displayValue}
      >
        <Typography>{label}</Typography>
      </StackItem>
    )
  }

  return (
    <SettingsItemRow label={label} node={node}>
      <SettingsFieldControl
        node={node}
        value={value}
        onChange={onChange}
        savedLabel={savedLabel}
        onLabelChange={onLabelChange}
      />
    </SettingsItemRow>
  )
}
