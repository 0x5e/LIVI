import { DashboardFrame } from '../dashboards/DashboardFrame'
import { NavMiniCenter } from '../dashboards/NavMiniCenter'
import { NavFull } from '../widgets'
import { ClusterStreamView } from './ClusterStreamView'
import { specFor } from './layoutSpecs'

type ClusterLayoutViewProps = {
  layout: string
  accent?: string
}

/** The car's own part of the active cluster layout. */
export function ClusterLayoutView({ layout, accent }: ClusterLayoutViewProps) {
  const spec = specFor(layout)
  if (spec.frame === 'stream') return <ClusterStreamView />
  return (
    <DashboardFrame clusterFull={spec.clusterStream} accent={accent}>
      {spec.center === 'navMini' && <NavMiniCenter />}
      {spec.center === 'navFull' && <NavFull />}
    </DashboardFrame>
  )
}
