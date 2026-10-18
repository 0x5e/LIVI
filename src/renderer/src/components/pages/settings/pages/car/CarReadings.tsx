/** What the car reports about itself, each row once it has arrived. */

import { SettingsValueRow } from '@settings/components'
import { CarType, EvConnectorType } from '@shared/types'
import { useLiviStore } from '@store/store'
import { useTranslation } from 'react-i18next'

const finite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

export const CarReadings = () => {
  const { t } = useTranslation()
  const telemetry = useLiviStore((s) => s.telemetry)
  const carType = useLiviStore((s) => s.settings?.carType)
  const connectors = useLiviStore((s) => s.settings?.evConnectorTypes)

  const capacity = finite(telemetry?.batteryCapacityKwh)
  const level = finite(telemetry?.batteryLevelKwh)
  // An electric car sends its charge as the fuel level.
  const charge =
    level !== undefined && capacity
      ? (level / capacity) * 100
      : carType === CarType.Electric
        ? finite(telemetry?.fuelPct)
        : undefined

  return (
    <>
      {capacity !== undefined && (
        <SettingsValueRow
          label={t('settings.batteryCapacity')}
          value={`${capacity.toFixed(1)} kWh`}
        />
      )}
      {charge !== undefined && (
        <SettingsValueRow label={t('settings.stateOfCharge')} value={`${Math.round(charge)} %`} />
      )}
      {connectors?.length ? (
        <SettingsValueRow
          label={t('settings.evConnectors')}
          value={connectors.map((c) => EvConnectorType[c]).join(', ')}
        />
      ) : null}
    </>
  )
}
