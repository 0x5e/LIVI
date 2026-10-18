import { useLiviStore } from '@store/store'
import * as React from 'react'

const STALE_MS = 1500

export function useVehicleTelemetry() {
  const telemetry = useLiviStore((s) => s.telemetry)

  const isStale = React.useMemo(() => {
    if (typeof telemetry?.ts !== 'number') return true
    return Date.now() - telemetry.ts > STALE_MS
  }, [telemetry?.ts])

  return { telemetry, isStale }
}
