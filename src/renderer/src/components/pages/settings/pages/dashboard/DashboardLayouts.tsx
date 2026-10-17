import { Switch } from '@mui/material'
import { coreAction, useLiviStore } from '@renderer/store/store'
import type { Action } from '@shared/core/contract'
import { useTranslation } from 'react-i18next'
import { clusterLayouts } from '../../../telemetry/layouts/clusterLayouts'
import { PosSensitiveList } from '../../components/posSensitiveList/PosSensitiveList'

const ask = (action: Action) => coreAction(action).catch(() => {})

/** The theme's dashboard layouts in the user's order, core moves and switches them. */
export const DashboardLayouts = () => {
  const { t } = useTranslation()
  const cluster = useLiviStore((s) => s.cluster)
  const names = new Map(clusterLayouts(cluster).map((l) => [l.id, l.name]))

  return (
    <PosSensitiveList
      onMove={(layout, by) => ask({ kind: 'moveClusterLayout', layout, by })}
      rows={(cluster?.arranged ?? []).map(({ id, on }) => {
        const name = names.get(id) ?? id
        return {
          id,
          label: t(`settings.layout_${id.replace('.', '_')}`, name),
          trailing: (
            <Switch
              checked={on}
              onChange={() => ask({ kind: 'showClusterLayout', layout: id, on: !on })}
              slotProps={{ input: { 'aria-label': name } }}
            />
          )
        }
      })}
    />
  )
}
