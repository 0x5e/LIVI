import type { Display, System, WifiBand } from '@shared/core/contract'
import type { Config } from '@shared/types'
import { PAGES, WIFI_PASSWORD_MAX, WIFI_PASSWORD_MIN } from '@shared/types'
import {
  MAX_HEIGHT,
  MAX_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH
} from '../../components/pages/settings/constants'
import { Camera } from '../../components/pages/settings/pages/camera'
import { DashboardLayouts } from '../../components/pages/settings/pages/dashboard/DashboardLayouts'
import { GpsHwInfo } from '../../components/pages/settings/pages/general/gps/GpsHwInfo'
import { GpsInfo } from '../../components/pages/settings/pages/general/gps/GpsInfo'
import { WifiLinkInfo } from '../../components/pages/settings/pages/general/wifi/WifiLinkInfo'
import { coreAction, useLiviStore } from '../../store/store'
import { SelectOption, SettingsNode } from '../types'
import { dabSchema } from './dabSchema'

const panelDefaultOption: SelectOption = {
  value: '',
  label: 'Panel default',
  labelKey: 'settings.displayModeDefault'
}

const autoConnectorOption: SelectOption = {
  value: '',
  label: 'Automatic',
  labelKey: 'settings.displayConnectorAuto'
}

type ScreenKey = 'main' | 'cluster' | 'aux'

function displayFor(screen: ScreenKey): Display | undefined {
  const { system, settings } = useLiviStore.getState()
  const displays = system?.displays ?? []
  const chosen = settings?.displayConnector[screen] ?? ''
  const shown = displays.find((d) => (chosen ? d.connector === chosen : d.screen === screen))
  return shown ?? (screen === 'main' && !chosen ? displays[0] : undefined)
}

const loadDisplayModes = (screen: ScreenKey) => async (): Promise<SelectOption[]> => {
  const modes = displayFor(screen)?.modes ?? []
  return [panelDefaultOption, ...modes.map((m) => ({ value: m, label: m }))]
}

async function loadConnectors(): Promise<SelectOption[]> {
  const displays = useLiviStore.getState().system?.displays ?? []
  return [
    autoConnectorOption,
    ...displays.map((d) => ({
      value: d.connector,
      label: d.panel ? `${d.connector} · ${d.panel}` : d.connector
    }))
  ]
}

const notSettable = (system: System | null): boolean => !system?.displaysSettable
const sizeFollowsDisplay = (system: System | null): boolean => system?.displaysSettable === true

const displayRows = (screen: ScreenKey): SettingsNode<Config>[] => [
  {
    type: 'select',
    label: 'Connector',
    labelKey: 'settings.displayConnector',
    icon: 'displayConnector',
    path: `displayConnector.${screen}`,
    displayValue: true,
    options: [autoConnectorOption],
    loadOptions: loadConnectors,
    readOnly: notSettable,
    page: {
      title: 'Connector',
      labelTitle: 'settings.displayConnector'
    }
  },
  {
    type: 'select',
    label: 'Display Mode',
    labelKey: 'settings.displayMode',
    icon: 'displayMode',
    path: `displayMode.${screen}`,
    displayValue: true,
    options: [panelDefaultOption],
    loadOptions: loadDisplayModes(screen),
    readOnly: notSettable,
    page: {
      title: 'Display Mode',
      labelTitle: 'settings.displayMode'
    }
  }
]

const BAND_LABELS: Record<WifiBand, string> = {
  '2.4ghz': '2.4 GHz',
  '5ghz': '5 GHz',
  '6ghz': '6 GHz'
}

/** The bands the chosen radio can run an access point on, 2.4 and 5 GHz until it says. */
async function loadWifiBands(): Promise<SelectOption[]> {
  const bands = useLiviStore.getState().system?.wifiBands ?? []
  const shown: WifiBand[] = bands.length > 0 ? bands : ['2.4ghz', '5ghz']
  return shown.map((b) => ({ value: b, label: BAND_LABELS[b] }))
}

async function loadWifiChannels(): Promise<SelectOption[]> {
  const list = useLiviStore.getState().system?.wifiChannels ?? []
  return list.map((c) => ({ value: c, label: String(c) }))
}

async function loadWifiCountryCodes(): Promise<SelectOption[]> {
  const list = useLiviStore.getState().system?.wifiCountries ?? []
  return list.map((c) => ({ value: c, label: c }))
}

const DONGLE_LINK = 'livi-link'

function adapterOption(
  value: string,
  switchedOn: boolean | null | undefined,
  model: string | undefined
): SelectOption {
  if (value !== DONGLE_LINK) return { value, label: model ? `${value} (${model})` : value }
  if (switchedOn === false) {
    return { value, label: 'LIVI Link (off)', labelKey: 'settings.dongleSwitchedOff' }
  }
  return { value, label: 'LIVI Link' }
}

async function loadWifiInterfaces(): Promise<SelectOption[]> {
  const system = useLiviStore.getState().system
  return (system?.wifiInterfaces ?? []).map((i) =>
    adapterOption(i, system?.dongle?.wifi, system?.interfaceModels?.[i])
  )
}

async function loadBtAdapters(): Promise<SelectOption[]> {
  const system = useLiviStore.getState().system
  return (system?.btAdapters ?? []).map((i) =>
    adapterOption(i, system?.dongle?.bt, system?.interfaceModels?.[i])
  )
}

const switchDongleOn =
  (radio: 'wifi' | 'bt') =>
  (value: string | number): void => {
    if (value === DONGLE_LINK)
      coreAction({ kind: 'setDongleRadio', radio, on: true }).catch(() => {})
  }

export const generalSchema: SettingsNode<Config> = {
  route: 'general',
  label: 'General',
  labelKey: 'settings.general',
  icon: 'general',
  type: 'route',
  path: '',
  children: [
    {
      type: 'route',
      route: 'connections',
      label: 'Connections',
      labelKey: 'settings.connections',
      icon: 'connections',
      path: '',
      children: [
        {
          type: 'string',
          label: 'Car Name',
          labelKey: 'settings.carName',
          icon: 'carName',
          path: 'carName',
          displayValue: true,
          page: {
            title: 'Car Name',
            labelTitle: 'settings.carName'
          }
        },
        {
          type: 'string',
          label: 'UI Name',
          labelKey: 'settings.uiName',
          icon: 'uiName',
          path: 'oemName',
          displayValue: true,
          page: {
            title: 'UI Name',
            labelTitle: 'settings.uiName'
          }
        },
        {
          type: 'route',
          route: 'wifi',
          label: 'Wi-Fi',
          labelKey: 'settings.wifi',
          icon: 'wifi',
          path: '',
          children: [
            {
              type: 'select',
              label: 'Wi-Fi Frequency',
              labelKey: 'settings.wifiFrequency',
              icon: 'wifiFrequency',
              path: 'wifiType',
              displayValue: true,
              options: [],
              loadOptions: loadWifiBands,
              page: {
                title: 'Wi-Fi Frequency',
                labelTitle: 'settings.wifiFrequency'
              }
            },
            {
              type: 'string',
              label: 'Wi-Fi Password',
              labelKey: 'settings.wifiPassword',
              icon: 'wifiPassword',
              path: 'wifiPassword',
              minLength: WIFI_PASSWORD_MIN,
              maxLength: WIFI_PASSWORD_MAX,
              displayValue: true,
              page: {
                title: 'Wi-Fi Password',
                labelTitle: 'settings.wifiPassword'
              }
            },
            {
              type: 'select',
              label: 'Wi-Fi Channel',
              labelKey: 'settings.wifiChannel',
              icon: 'wifiChannel',
              path: 'wifiChannel',
              displayValue: true,
              options: [],
              loadOptions: loadWifiChannels,
              page: {
                title: 'Wi-Fi Channel',
                labelTitle: 'settings.wifiChannel'
              }
            },
            {
              type: 'select',
              label: 'Wi-Fi Channel Width',
              labelKey: 'settings.wifiChannelWidth',
              icon: 'wifiChannel',
              path: 'wifiChannelWidth',
              displayValue: true,
              options: [
                {
                  label: '20 MHz',
                  value: 20
                },
                {
                  label: '40 MHz',
                  value: 40
                },
                {
                  label: '80 MHz',
                  value: 80
                }
              ],
              page: {
                title: 'Wi-Fi Channel Width',
                labelTitle: 'settings.wifiChannelWidth'
              }
            },
            {
              type: 'select',
              label: 'Wi-Fi Country',
              labelKey: 'settings.wifiCountry',
              icon: 'wifiCountry',
              path: 'country',
              displayValue: true,
              options: [],
              loadOptions: loadWifiCountryCodes,
              page: {
                title: 'Wi-Fi Country',
                labelTitle: 'settings.wifiCountry'
              }
            },
            {
              type: 'select',
              label: 'Wi-Fi Interface',
              labelKey: 'settings.wifiInterface',
              icon: 'wifiInterface',
              path: 'wifiInterface',
              displayValue: true,
              options: [],
              loadOptions: loadWifiInterfaces,
              onPick: switchDongleOn('wifi'),
              page: {
                title: 'Wi-Fi Interface',
                labelTitle: 'settings.wifiInterface'
              }
            },
            {
              type: 'checkbox',
              label: 'Dedicated Interface',
              labelKey: 'settings.wifiDedicatedInterface',
              icon: 'dedicatedInterface',
              path: 'wifiDedicatedInterface',
              disabled: window.app?.platform !== 'linux'
            },
            {
              type: 'custom',
              label: 'Link Speed',
              labelKey: 'settings.wifiLinkSpeed',
              path: 'wifiInterface',
              component: WifiLinkInfo
            }
          ]
        },
        {
          type: 'select',
          label: 'Bluetooth Interface',
          labelKey: 'settings.btAdapter',
          icon: 'btInterface',
          path: 'btAdapter',
          displayValue: true,
          options: [],
          loadOptions: loadBtAdapters,
          onPick: switchDongleOn('bt'),
          page: {
            title: 'Bluetooth Interface',
            labelTitle: 'settings.btAdapter'
          }
        },
        {
          type: 'checkbox',
          label: 'Wireless Android Auto',
          labelKey: 'settings.wirelessAaEnabled',
          icon: 'wirelessAa',
          path: 'wirelessAaEnabled'
        },
        {
          type: 'checkbox',
          label: 'Wireless CarPlay',
          labelKey: 'settings.wirelessCpEnabled',
          icon: 'wirelessCp',
          path: 'wirelessCpEnabled'
        },
        {
          type: 'checkbox',
          label: 'Auto Connect',
          labelKey: 'settings.autoConnect',
          icon: 'autoConnect',
          path: 'autoConn'
        }
      ]
    },
    {
      type: 'route',
      route: 'windowSettings',
      label: 'Window Settings',
      labelKey: 'settings.windowSettings',
      icon: 'windowSettings',
      path: '',
      children: [
        {
          type: 'route',
          label: 'Main Screen',
          labelKey: 'settings.mainScreen',
          icon: 'mainScreen',
          route: 'mainScreen',
          path: '',
          children: [
            ...displayRows('main'),
            {
              type: 'number',
              label: 'Width',
              labelKey: 'settings.mainScreenWidth',
              icon: 'width',
              path: 'mainScreenWidth',
              disabled: sizeFollowsDisplay,
              min: MIN_WIDTH,
              max: MAX_WIDTH,
              step: 1,
              displayValue: true,
              page: {
                title: 'Main Screen Width',
                labelTitle: 'settings.mainScreenWidth'
              }
            },
            {
              type: 'number',
              label: 'Height',
              labelKey: 'settings.mainScreenHeight',
              icon: 'height',
              path: 'mainScreenHeight',
              disabled: sizeFollowsDisplay,
              min: MIN_HEIGHT,
              max: MAX_HEIGHT,
              step: 1,
              displayValue: true,
              page: {
                title: 'Main Screen Height',
                labelTitle: 'settings.mainScreenHeight'
              }
            },
            {
              type: 'checkbox',
              label: 'Fullscreen',
              labelKey: 'settings.fullscreen',
              icon: 'fullscreen',
              path: 'kiosk.main'
            }
          ]
        },
        {
          type: 'route',
          label: 'Cluster Screen',
          labelKey: 'settings.clusterScreen',
          icon: 'clusterScreen',
          route: 'clusterScreen',
          path: '',
          children: [
            {
              type: 'checkbox',
              label: 'Active',
              labelKey: 'settings.clusterScreenActive',
              icon: 'active',
              path: 'clusterScreenActive'
            },
            ...displayRows('cluster'),
            {
              type: 'number',
              label: 'Width',
              labelKey: 'settings.clusterScreenWidth',
              icon: 'width',
              path: 'clusterScreenWidth',
              disabled: sizeFollowsDisplay,
              min: MIN_WIDTH,
              max: MAX_WIDTH,
              step: 1,
              displayValue: true,
              page: {
                title: 'Cluster Screen Width',
                labelTitle: 'settings.clusterScreenWidth'
              }
            },
            {
              type: 'number',
              label: 'Height',
              labelKey: 'settings.clusterScreenHeight',
              icon: 'height',
              path: 'clusterScreenHeight',
              disabled: sizeFollowsDisplay,
              min: MIN_HEIGHT,
              max: MAX_HEIGHT,
              step: 1,
              displayValue: true,
              page: {
                title: 'Cluster Screen Height',
                labelTitle: 'settings.clusterScreenHeight'
              }
            },
            {
              type: 'checkbox',
              label: 'Fullscreen',
              labelKey: 'settings.fullscreen',
              icon: 'fullscreen',
              path: 'kiosk.cluster'
            }
          ]
        },
        {
          type: 'route',
          label: 'Aux Screen',
          labelKey: 'settings.auxScreen',
          icon: 'auxScreen',
          route: 'auxScreen',
          path: '',
          children: [
            {
              type: 'checkbox',
              label: 'Active',
              labelKey: 'settings.auxScreenActive',
              icon: 'active',
              path: 'auxScreenActive'
            },
            ...displayRows('aux'),
            {
              type: 'number',
              label: 'Width',
              labelKey: 'settings.auxScreenWidth',
              icon: 'width',
              path: 'auxScreenWidth',
              disabled: sizeFollowsDisplay,
              min: MIN_WIDTH,
              max: MAX_WIDTH,
              step: 1,
              displayValue: true,
              page: {
                title: 'Aux Screen Width',
                labelTitle: 'settings.auxScreenWidth'
              }
            },
            {
              type: 'number',
              label: 'Height',
              labelKey: 'settings.auxScreenHeight',
              icon: 'height',
              path: 'auxScreenHeight',
              disabled: sizeFollowsDisplay,
              min: MIN_HEIGHT,
              max: MAX_HEIGHT,
              step: 1,
              displayValue: true,
              page: {
                title: 'Aux Screen Height',
                labelTitle: 'settings.auxScreenHeight'
              }
            },
            {
              type: 'checkbox',
              label: 'Fullscreen',
              labelKey: 'settings.fullscreen',
              icon: 'fullscreen',
              path: 'kiosk.aux'
            }
          ]
        }
      ]
    },
    {
      type: 'route',
      label: 'Tab Settings',
      labelKey: 'settings.tabSettings',
      icon: 'tabSettings',
      route: 'tabSettings',
      path: '',
      children: [
        {
          type: 'route',
          label: 'Dashboard',
          labelKey: 'settings.dashboard',
          icon: 'dashboards',
          route: 'dashboard',
          path: '',
          children: [
            {
              type: 'checkbox',
              label: 'Main',
              labelKey: 'settings.mainScreen',
              icon: 'mainScreen',
              path: 'dashboard.main'
            },
            {
              type: 'checkbox',
              label: 'Cluster',
              labelKey: 'settings.clusterScreen',
              icon: 'clusterScreen',
              path: 'dashboard.cluster'
            },
            {
              type: 'checkbox',
              label: 'Aux',
              labelKey: 'settings.auxScreen',
              icon: 'auxScreen',
              path: 'dashboard.aux'
            },
            {
              type: 'route',
              label: 'Dashboards',
              labelKey: 'settings.dashboardLayouts',
              icon: 'dashboards',
              route: 'layouts',
              path: '',
              children: [
                {
                  type: 'custom',
                  label: 'Dashboards',
                  labelKey: 'settings.dashboardLayouts',
                  path: 'dashboardLayouts',
                  component: DashboardLayouts
                }
              ]
            }
          ]
        },
        {
          type: 'route',
          label: 'Media',
          labelKey: 'settings.media',
          icon: 'media',
          route: 'media',
          path: '',
          children: [
            {
              type: 'checkbox',
              label: 'Main',
              labelKey: 'settings.mainScreen',
              icon: 'mainScreen',
              path: 'media.main'
            },
            {
              type: 'checkbox',
              label: 'Cluster',
              labelKey: 'settings.clusterScreen',
              icon: 'clusterScreen',
              path: 'media.cluster'
            },
            {
              type: 'checkbox',
              label: 'Aux',
              labelKey: 'settings.auxScreen',
              icon: 'auxScreen',
              path: 'media.aux'
            }
          ]
        },
        {
          type: 'route',
          label: 'Reverse Camera',
          labelKey: 'settings.reverseCamera',
          icon: 'reverseCamera',
          route: 'camera',
          path: '',
          displayValue: true,
          children: [
            {
              type: 'checkbox',
              label: 'Automatic on reverse gear',
              labelKey: 'settings.autoSwitchOnReverse',
              icon: 'autoReverse',
              path: 'autoSwitchOnReverse'
            },
            {
              type: 'checkbox',
              label: 'Main',
              labelKey: 'settings.mainScreen',
              icon: 'mainScreen',
              path: 'camera.main'
            },
            {
              type: 'checkbox',
              label: 'Cluster',
              labelKey: 'settings.clusterScreen',
              icon: 'clusterScreen',
              path: 'camera.cluster'
            },
            {
              type: 'checkbox',
              label: 'Aux',
              labelKey: 'settings.auxScreen',
              icon: 'auxScreen',
              path: 'camera.aux'
            },
            {
              type: 'checkbox',
              label: 'Mirror',
              labelKey: 'settings.cameraMirror',
              icon: 'cameraMirror',
              path: 'cameraMirror'
            },
            {
              type: 'select',
              label: 'Rotation',
              labelKey: 'settings.cameraRotation',
              icon: 'cameraRotation',
              path: 'cameraRotation',
              displayValue: true,
              options: [
                { label: '0°', value: 0 },
                { label: '90°', value: 90 },
                { label: '180°', value: 180 },
                { label: '270°', value: 270 }
              ],
              page: {
                title: 'Camera Rotation',
                labelTitle: 'settings.cameraRotation'
              }
            },
            {
              type: 'route',
              label: 'Camera',
              labelKey: 'settings.camera',
              icon: 'camera',
              route: 'select',
              path: '',
              children: [
                {
                  path: 'cameraId',
                  type: 'custom',
                  label: 'Camera',
                  labelKey: 'settings.camera',
                  component: Camera
                }
              ]
            }
          ]
        },
        {
          type: 'route',
          label: 'Custom Tab',
          labelKey: 'settings.customTab',
          icon: 'customTab',
          route: 'custom',
          path: '',
          displayValue: true,
          children: [
            {
              type: 'checkbox',
              label: 'Main',
              labelKey: 'settings.mainScreen',
              icon: 'mainScreen',
              path: 'custom.main'
            },
            {
              type: 'checkbox',
              label: 'Cluster',
              labelKey: 'settings.clusterScreen',
              icon: 'clusterScreen',
              path: 'custom.cluster'
            },
            {
              type: 'checkbox',
              label: 'Aux',
              labelKey: 'settings.auxScreen',
              icon: 'auxScreen',
              path: 'custom.aux'
            },
            {
              type: 'string',
              label: 'Address',
              labelKey: 'settings.customUrl',
              icon: 'customUrl',
              path: 'customUrl',
              format: 'url',
              displayValue: true,
              page: {
                title: 'Address',
                labelTitle: 'settings.customUrl'
              }
            }
          ]
        }
      ]
    },
    {
      type: 'route',
      label: 'Key Bindings',
      labelKey: 'settings.keyBindings',
      icon: 'keyBindings',
      route: 'keyBindings',
      path: '',
      children: [
        {
          type: 'keybinding',
          label: 'Up',
          labelKey: 'settings.up',
          path: 'bindings',
          bindingKey: 'up'
        },
        {
          type: 'keybinding',
          label: 'Down',
          labelKey: 'settings.down',
          path: 'bindings',
          bindingKey: 'down'
        },
        {
          type: 'keybinding',
          label: 'Left',
          labelKey: 'settings.left',
          path: 'bindings',
          bindingKey: 'left'
        },
        {
          type: 'keybinding',
          label: 'Right',
          labelKey: 'settings.right',
          path: 'bindings',
          bindingKey: 'right'
        },

        {
          type: 'keybinding',
          label: 'Select Up',
          labelKey: 'settings.selectUp',
          path: 'bindings',
          bindingKey: 'selectUp'
        },
        {
          type: 'keybinding',
          label: 'Select Down',
          labelKey: 'settings.selectDown',
          path: 'bindings',
          bindingKey: 'selectDown'
        },

        {
          type: 'keybinding',
          label: 'Back',
          labelKey: 'settings.back',
          path: 'bindings',
          bindingKey: 'back'
        },

        {
          type: 'keybinding',
          label: 'Knob Left',
          labelKey: 'settings.knobLeft',
          path: 'bindings',
          bindingKey: 'knobLeft'
        },
        {
          type: 'keybinding',
          label: 'Knob Right',
          labelKey: 'settings.knobRight',
          path: 'bindings',
          bindingKey: 'knobRight'
        },
        {
          type: 'keybinding',
          label: 'Knob Up',
          labelKey: 'settings.knobUp',
          path: 'bindings',
          bindingKey: 'knobUp'
        },
        {
          type: 'keybinding',
          label: 'Knob Down',
          labelKey: 'settings.knobDown',
          path: 'bindings',
          bindingKey: 'knobDown'
        },

        {
          type: 'keybinding',
          label: 'Home',
          labelKey: 'settings.home',
          path: 'bindings',
          bindingKey: 'home'
        },
        {
          type: 'keybinding',
          label: 'Cycle Session',
          labelKey: 'settings.cycleSession',
          path: 'bindings',
          bindingKey: 'cycleSession'
        },
        {
          type: 'keybinding',
          label: 'Cluster Layout',
          labelKey: 'settings.clusterLayout',
          path: 'bindings',
          bindingKey: 'clusterLayout'
        },
        {
          type: 'keybinding',
          label: 'Cluster View',
          labelKey: 'settings.clusterView',
          path: 'bindings',
          bindingKey: 'clusterContent'
        },

        {
          type: 'keybinding',
          label: 'Play/Pause',
          labelKey: 'settings.playPause',
          path: 'bindings',
          bindingKey: 'playPause'
        },
        {
          type: 'keybinding',
          label: 'Play',
          labelKey: 'settings.play',
          path: 'bindings',
          bindingKey: 'play'
        },
        {
          type: 'keybinding',
          label: 'Pause',
          labelKey: 'settings.pause',
          path: 'bindings',
          bindingKey: 'pause'
        },

        {
          type: 'keybinding',
          label: 'Next',
          labelKey: 'settings.next',
          path: 'bindings',
          bindingKey: 'next'
        },
        {
          type: 'keybinding',
          label: 'Previous',
          labelKey: 'settings.previous',
          path: 'bindings',
          bindingKey: 'prev'
        },

        {
          type: 'keybinding',
          label: 'Accept Call',
          labelKey: 'settings.acceptCall',
          path: 'bindings',
          bindingKey: 'acceptPhone'
        },
        {
          type: 'keybinding',
          label: 'Reject Call',
          labelKey: 'settings.rejectCall',
          path: 'bindings',
          bindingKey: 'rejectPhone'
        },

        {
          type: 'keybinding',
          label: 'Phone Key 0',
          labelKey: 'settings.phoneKey0',
          path: 'bindings',
          bindingKey: 'phoneKey0'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 1',
          labelKey: 'settings.phoneKey1',
          path: 'bindings',
          bindingKey: 'phoneKey1'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 2',
          labelKey: 'settings.phoneKey2',
          path: 'bindings',
          bindingKey: 'phoneKey2'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 3',
          labelKey: 'settings.phoneKey3',
          path: 'bindings',
          bindingKey: 'phoneKey3'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 4',
          labelKey: 'settings.phoneKey4',
          path: 'bindings',
          bindingKey: 'phoneKey4'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 5',
          labelKey: 'settings.phoneKey5',
          path: 'bindings',
          bindingKey: 'phoneKey5'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 6',
          labelKey: 'settings.phoneKey6',
          path: 'bindings',
          bindingKey: 'phoneKey6'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 7',
          labelKey: 'settings.phoneKey7',
          path: 'bindings',
          bindingKey: 'phoneKey7'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 8',
          labelKey: 'settings.phoneKey8',
          path: 'bindings',
          bindingKey: 'phoneKey8'
        },
        {
          type: 'keybinding',
          label: 'Phone Key 9',
          labelKey: 'settings.phoneKey9',
          path: 'bindings',
          bindingKey: 'phoneKey9'
        },
        {
          type: 'keybinding',
          label: 'Phone Key *',
          labelKey: 'settings.phoneKeyStar',
          path: 'bindings',
          bindingKey: 'phoneKeyStar'
        },
        {
          type: 'keybinding',
          label: 'Phone Key #',
          labelKey: 'settings.phoneKeyHash',
          path: 'bindings',
          bindingKey: 'phoneKeyHash'
        },
        {
          type: 'keybinding',
          label: 'Hook Switch',
          labelKey: 'settings.phoneKeyHookSwitch',
          path: 'bindings',
          bindingKey: 'phoneKeyHookSwitch'
        },

        {
          type: 'keybinding',
          label: 'Voice Assistant',
          labelKey: 'settings.voiceAssistant',
          path: 'bindings',
          bindingKey: 'voiceAssistant'
        },
        {
          type: 'keybinding',
          label: 'Voice Assistant Release',
          labelKey: 'settings.voiceAssistantRelease',
          path: 'bindings',
          bindingKey: 'voiceAssistantRelease'
        }
      ]
    },
    {
      type: 'select',
      label: 'Start Page',
      labelKey: 'settings.startPage',
      icon: 'startPage',
      path: 'startPage',
      displayValue: true,
      options: PAGES.map(({ path, label, labelKey }) => ({ label, labelKey, value: path })),
      page: {
        title: 'Start Page',
        labelTitle: 'settings.startPage'
      }
    },
    {
      type: 'number',
      label: 'FFT Delay',
      labelKey: 'settings.fftDelay',
      icon: 'fftDelay',
      path: 'visualAudioDelayMs',
      displayValue: true,
      valueTransform: {
        toView: (v: number) => v,
        fromView: (v: number) => v,
        format: (v: number) => `${v} ms`
      },
      page: {
        title: 'FFT Visualization Delay',
        labelTitle: 'settings.fftDelay'
      }
    },
    {
      type: 'number',
      label: 'UI Zoom',
      labelKey: 'settings.uiZoom',
      icon: 'uiZoom',
      path: 'uiZoomPercent',
      displayValue: true,
      min: 50,
      max: 200,
      step: 10,
      valueTransform: {
        toView: (v: number) => v,
        fromView: (v: number) => v,
        format: (v: number) => `${v}%`
      },
      page: {
        title: 'UI Zoom',
        labelTitle: 'settings.uiZoom'
      }
    },
    {
      type: 'select',
      label: 'Language',
      labelKey: 'settings.language',
      icon: 'language',
      path: 'language',
      displayValue: true,
      options: [
        { label: 'English', labelKey: 'settings.english', value: 'en' },
        { label: 'German', labelKey: 'settings.german', value: 'de' },
        { label: 'Ukrainian', labelKey: 'settings.ukrainian', value: 'ua' },
        { label: 'French', labelKey: 'settings.french', value: 'fr' }
      ],
      page: {
        title: 'Language',
        labelTitle: 'settings.language'
      }
    },
    {
      type: 'route',
      label: 'MFi',
      labelKey: 'settings.mfi',
      icon: 'mfi',
      route: 'mfi',
      path: '',
      children: [
        {
          type: 'number',
          label: 'I2C Bus',
          labelKey: 'settings.i2cBus',
          icon: 'i2cBus',
          path: 'carPlayMfiI2cBus',
          min: 0,
          max: 20,
          step: 1,
          default: 2,
          displayValue: true,
          page: {
            title: 'I2C Bus',
            labelTitle: 'settings.i2cBus'
          }
        },
        {
          type: 'number',
          label: 'Power Pin',
          labelKey: 'settings.mfiPowerGpio',
          icon: 'powerPin',
          path: 'carPlayMfiPowerGpio',
          min: -1,
          max: 27,
          step: 1,
          default: -1,
          displayValue: true,
          valueTransform: {
            toView: (v: number) => v,
            fromView: (v: number) => v,
            format: (v: number) => (v < 0 ? '-' : `${v}`)
          },
          page: {
            title: 'Power Pin',
            labelTitle: 'settings.mfiPowerGpio'
          }
        }
      ]
    },
    dabSchema,
    {
      type: 'route',
      label: 'GPS',
      labelKey: 'settings.gps',
      icon: 'gps',
      route: 'gps',
      path: '',
      children: [
        {
          type: 'checkbox',
          label: 'Enable',
          labelKey: 'settings.gpsEnabled',
          icon: 'gpsEnabled',
          path: 'gpsEnabled'
        },
        {
          type: 'string',
          label: 'Device',
          labelKey: 'settings.gpsDevice',
          icon: 'gpsDevice',
          path: 'gpsDevice',
          page: {
            title: 'Device',
            labelTitle: 'settings.gpsDevice'
          }
        },
        {
          type: 'select',
          label: 'Baud Rate',
          labelKey: 'settings.gpsBaudRate',
          icon: 'gpsBaudRate',
          path: 'gpsBaudRate',
          options: [
            { label: '4800', value: 4800 },
            { label: '9600', value: 9600 },
            { label: '19200', value: 19200 },
            { label: '38400', value: 38400 },
            { label: '57600', value: 57600 },
            { label: '115200', value: 115200 }
          ],
          page: {
            title: 'Baud Rate',
            labelTitle: 'settings.gpsBaudRate'
          }
        },
        {
          type: 'route',
          label: 'GPS Data',
          labelKey: 'settings.gpsInfo',
          icon: 'gpsInfo',
          route: 'info',
          path: '',
          children: [
            {
              type: 'custom',
              label: 'GPS Data',
              labelKey: 'settings.gpsInfo',
              path: 'carName',
              component: GpsInfo
            }
          ]
        },
        {
          type: 'route',
          label: 'HW Info',
          labelKey: 'settings.gpsHwInfo',
          icon: 'gpsHwInfo',
          route: 'hwinfo',
          path: '',
          children: [
            {
              type: 'custom',
              label: 'HW Info',
              labelKey: 'settings.gpsHwInfo',
              path: 'carName',
              component: GpsHwInfo
            }
          ]
        }
      ]
    },
    {
      type: 'checkbox',
      label: 'Video in the car',
      labelKey: 'settings.carPlayHlsVideo',
      icon: 'media',
      path: 'carPlayHlsVideo'
    },
    {
      type: 'route',
      label: 'CarPlay Ultra',
      labelKey: 'settings.carPlaySection',
      icon: 'wirelessCp',
      route: 'carplay',
      path: '',
      children: [
        {
          type: 'string',
          label: 'Theme',
          labelKey: 'settings.carPlayTheme',
          icon: 'uiColors',
          path: 'carPlayTheme',
          displayValue: true,
          page: {
            title: 'Theme',
            labelTitle: 'settings.carPlayTheme'
          }
        },
        {
          type: 'string',
          label: 'Vehicle Model',
          labelKey: 'settings.carPlayVehicleModel',
          icon: 'car',
          path: 'carPlayVehicleModel',
          displayValue: true,
          page: {
            title: 'Vehicle Model',
            labelTitle: 'settings.carPlayVehicleModel'
          }
        }
      ]
    }
  ]
}
