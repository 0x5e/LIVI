import { LinearProgress } from '@mui/material'
import { SettingsButtonRow, SettingsValueRow } from '@settings/components'
import { coreAction, useLiviStore } from '@store/store'
import { useTranslation } from 'react-i18next'

const ask = (kind: 'dabScan' | 'dabStopScan') => {
  coreAction({ kind }).catch((err) => console.warn(`[dab] ${kind} failed`, err))
}

export function DabReceiver() {
  const { t } = useTranslation()
  const dab = useLiviStore((s) => s.dab)
  const stations = useLiviStore((s) => s.dab?.stations.length ?? 0)
  const scan = dab?.scan ?? null
  const receiver = dab?.receiver ?? null
  const pct = scan && scan.total > 0 ? Math.round((scan.done / scan.total) * 100) : 0

  return (
    <>
      <SettingsValueRow
        label={t('settings.dabReceiver')}
        value={receiver ?? t('settings.dabNoReceiver')}
        icon="dabReceiver"
      />
      {scan ? (
        <>
          <SettingsValueRow
            label={t('settings.dabScanning', { channel: scan.channel })}
            value={t('settings.dabFound', { count: scan.found })}
            icon="dabStations"
          />
          <LinearProgress variant="determinate" value={pct} />
          <SettingsButtonRow
            buttonLabel={t('settings.dabStopScan')}
            variant="outlined"
            onClick={() => ask('dabStopScan')}
          />
        </>
      ) : (
        <SettingsButtonRow
          icon="dabStations"
          label={t('settings.dabStations', { count: stations })}
          buttonLabel={t('settings.dabScan')}
          disabled={receiver === null}
          onClick={() => ask('dabScan')}
        />
      )}
      {dab?.error && <SettingsValueRow label={t('settings.dabError')} value={dab.error} />}
    </>
  )
}
