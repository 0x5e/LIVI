import { Box } from '@mui/material'
import { useStatusStore } from '@store/store'
import { useEffect } from 'react'

/**
 * The phone's cluster stream alone.
 */
export function ClusterStreamView() {
  const setClusterDashboardActive = useStatusStore((s) => s.setClusterDashboardActive)
  useEffect(() => {
    setClusterDashboardActive(true)
    return () => setClusterDashboardActive(false)
  }, [setClusterDashboardActive])

  return <Box sx={{ width: '100%', height: '100%' }} />
}
