import { Box, useTheme } from '@mui/material'
import { DashboardPlaceholder } from '@renderer/components/pages/telemetry/components/DashboardPlaceholder'
import { DashboardsPagination } from '@renderer/components/pages/telemetry/components/pagination/pagination'
import { AppContext } from '@renderer/context'
import { useNavbarHidden } from '@renderer/hooks/useNavbarHidden'
import type { Screen } from '@shared/types'
import { coreAction, useLiviStore } from '@store/store'
import * as React from 'react'
import { FC, useCallback, useContext } from 'react'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { ClusterLayoutView } from './layouts/ClusterLayoutView'
import { clusterAccent, clusterLayouts, shownLayouts } from './layouts/clusterLayouts'

type TelemetryProps = {
  windowRole?: Screen
}

export const Telemetry: FC<TelemetryProps> = ({ windowRole = 'main' }) => {
  const theme = useTheme()
  const settings = useLiviStore((s) => s.settings)
  const cluster = useLiviStore((s) => s.cluster)
  const { onSetAppContext } = useContext(AppContext)

  const enabled = settings?.dashboard?.[windowRole] === true
  const layouts = shownLayouts(cluster)
  const active = clusterLayouts(cluster).find((l) => l.id === cluster?.layout)
  const index = layouts.findIndex((l) => l.id === cluster?.layout)
  const select = useCallback(
    (i: number) => {
      const layout = layouts[i]
      if (layout) coreAction({ kind: 'selectClusterLayout', layout: layout.id }).catch(() => {})
    },
    [layouts]
  )
  const step = useCallback(
    (by: -1 | 1) => coreAction({ kind: 'stepClusterLayout', by }).catch(() => {}),
    []
  )
  const { isNavbarHidden, isNavPresent } = useNavbarHidden()
  const { prev, next, canPrev, canNext, onPointerDown, onPointerUp } = useKeyboardNavigation({
    count: layouts.length,
    isNavbarHidden,
    onStep: step
  })

  React.useEffect(() => {
    if (!onSetAppContext) return

    // register (PATCH only!)
    onSetAppContext({
      telemetryPager: { prev, next, canPrev, canNext }
    })

    // cleanup on unmount
    return () => {
      onSetAppContext({
        telemetryPager: undefined
      })
    }
  }, [onSetAppContext, prev, next, canPrev, canNext])

  return (
    <Box
      id="telemetry-root"
      sx={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: theme.palette.background.default
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {!enabled && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            opacity: 0.8
          }}
        >
          <DashboardPlaceholder title="No dashboard on this screen" />
        </Box>
      )}

      {enabled && active && (
        <ClusterLayoutView
          layout={active.id}
          accent={clusterAccent(cluster, theme.palette.mode === 'dark')}
        />
      )}

      {enabled && layouts.length > 1 && (
        <DashboardsPagination
          activeIndex={index}
          dotsLength={layouts.length}
          onSetIndex={select}
          isNavbarHidden={isNavbarHidden}
          isNavPresent={isNavPresent}
        />
      )}
    </Box>
  )
}
