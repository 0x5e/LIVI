import type { Config } from '@shared/types'
import { DabReceiver } from '../../components/pages/settings/pages/dab/DabReceiver'
import { DabStations } from '../../components/pages/settings/pages/dab/DabStations'
import { useLiviStore } from '../../store/store'
import { SelectOption, SettingsNode } from '../types'

export async function loadGainOptions(): Promise<SelectOption[]> {
  return (useLiviStore.getState().dab?.gainsDb ?? []).map((db) => ({
    value: db,
    label: `${db.toFixed(1)} dB`
  }))
}

export const dabSchema: SettingsNode<Config> = {
  type: 'route',
  route: 'dab',
  label: 'DAB+',
  labelKey: 'settings.dab',
  icon: 'dab',
  path: '',
  children: [
    {
      type: 'custom',
      label: 'Receiver',
      labelKey: 'settings.dabReceiver',
      path: 'dabGainAuto',
      component: DabReceiver
    },
    {
      type: 'route',
      route: 'dab-stations',
      label: 'Station list',
      labelKey: 'media.stationList',
      icon: 'dabStationList',
      path: '',
      children: [
        {
          type: 'custom',
          label: 'Station list',
          labelKey: 'media.stationList',
          path: 'dabGainAuto',
          component: DabStations
        }
      ]
    },
    {
      type: 'checkbox',
      label: 'Automatic gain',
      labelKey: 'settings.dabGainAuto',
      icon: 'dabGainAuto',
      path: 'dabGainAuto'
    },
    {
      type: 'select',
      label: 'Gain',
      labelKey: 'settings.dabGain',
      icon: 'dabGain',
      path: 'dabGainDb',
      displayValue: true,
      options: [],
      loadOptions: loadGainOptions,
      page: {
        title: 'Gain',
        labelTitle: 'settings.dabGain'
      }
    },
    {
      type: 'number',
      label: 'Frequency correction',
      labelKey: 'settings.dabPpm',
      icon: 'dabPpm',
      path: 'dabPpm',
      min: -100,
      max: 100,
      step: 1,
      default: 0,
      displayValue: true,
      page: {
        title: 'Frequency correction',
        labelTitle: 'settings.dabPpm'
      }
    }
  ]
}
