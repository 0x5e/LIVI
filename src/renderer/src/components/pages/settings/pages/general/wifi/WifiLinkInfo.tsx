/** Down is phone to car (the stream), up is car to phone. */

import { SettingsValueRow } from '@settings/components'
import { reportLinkSpeed, useLiviStore } from '@store/store'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const DASH = '—'

/** A PHY rate of 0 means the driver does not report one. */
function leg(mbps: number, phy: number): string {
  const rate = `${mbps.toFixed(1)} Mbps`
  return phy > 0 ? `${rate} · ${phy} PHY` : rate
}

export const WifiLinkInfo = () => {
  const { t } = useTranslation()
  const speed = useLiviStore((s) => s.system?.linkSpeed ?? null)

  useEffect(() => {
    reportLinkSpeed(true)
    return () => reportLinkSpeed(false)
  }, [])

  const down = speed ? leg(speed.downMbps, speed.downRate) : DASH
  const up = speed ? leg(speed.upMbps, speed.upRate) : DASH

  return (
    <>
      <SettingsValueRow label={t('settings.wifiLinkDown')} value={down} mono />
      <SettingsValueRow label={t('settings.wifiLinkUp')} value={up} mono />
    </>
  )
}
