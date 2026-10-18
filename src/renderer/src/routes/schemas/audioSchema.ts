import type { AudioDevice } from '@shared/core/contract'
import type { Config } from '@shared/types'
import { useLiviStore } from '../../store/store'
import { SelectOption, SettingsNode, ValueTransform } from '../types'

const audioValueTransform: ValueTransform<number | undefined, number> = {
  toView: (v) => Math.round((v ?? 1) * 100),
  fromView: (v, prev) => {
    const next = v / 100
    if (!Number.isFinite(next)) return prev ?? 1
    return next
  },
  format: (v) => `${v} %`
}

const systemDefaultOption: SelectOption = {
  value: '',
  label: 'System default',
  labelKey: 'settings.audioDeviceSystemDefault'
}

function deviceOptions(list: AudioDevice[] | undefined): SelectOption[] {
  return [
    systemDefaultOption,
    ...(list ?? []).map((d) => ({ value: d.id, label: d.name, offline: d.offline }))
  ]
}

async function loadAudioOutputDevices(): Promise<SelectOption[]> {
  return deviceOptions(useLiviStore.getState().system?.audioSinks)
}

async function loadAudioInputDevices(): Promise<SelectOption[]> {
  return deviceOptions(useLiviStore.getState().system?.audioSources)
}

export const audioSchema: SettingsNode<Config> = {
  type: 'route',
  route: 'audio',
  label: 'Audio',
  labelKey: 'settings.audio',
  icon: 'audio',
  path: '',
  children: [
    {
      type: 'slider',
      label: 'Head Unit',
      labelKey: 'settings.huVolume',
      icon: 'huVolume',
      path: 'huVolume',
      displayValue: true,
      displayValueUnit: '%',
      valueTransform: audioValueTransform,
      page: {
        title: 'Head Unit',
        labelTitle: 'settings.huVolume'
      }
    },
    {
      type: 'slider',
      label: 'Music',
      labelKey: 'settings.music',
      icon: 'music',
      path: 'audioVolume',
      displayValue: true,
      displayValueUnit: '%',
      valueTransform: audioValueTransform,
      page: {
        title: 'Music',
        labelTitle: 'settings.music'
      }
    },
    {
      type: 'slider',
      label: 'Navigation',
      labelKey: 'settings.navigation',
      icon: 'navigation',
      path: 'navVolume',
      displayValue: true,
      displayValueUnit: '%',
      valueTransform: audioValueTransform,
      page: {
        title: 'Navigation',
        labelTitle: 'settings.navigation'
      }
    },
    {
      type: 'slider',
      label: 'Voice Assistant',
      labelKey: 'settings.voiceAssistant',
      icon: 'voiceAssistant',
      path: 'voiceAssistantVolume',
      displayValue: true,
      displayValueUnit: '%',
      valueTransform: audioValueTransform,
      page: {
        title: 'Voice Assistant',
        labelTitle: 'settings.voiceAssistant'
      }
    },
    {
      type: 'slider',
      label: 'Phone Calls',
      labelKey: 'settings.phoneCalls',
      icon: 'phoneCalls',
      path: 'callVolume',
      displayValue: true,
      displayValueUnit: '%',
      valueTransform: audioValueTransform,
      page: {
        title: 'Phone Calls',
        labelTitle: 'settings.phoneCalls'
      }
    },
    {
      type: 'slider',
      label: 'System Sounds',
      labelKey: 'settings.systemSounds',
      icon: 'systemSounds',
      path: 'systemSoundsVolume',
      displayValue: true,
      displayValueUnit: '%',
      valueTransform: audioValueTransform,
      page: {
        title: 'System Sounds',
        labelTitle: 'settings.systemSounds'
      }
    },
    {
      type: 'select',
      label: 'Audio Output',
      labelKey: 'settings.audioOutputDevice',
      icon: 'audioOutput',
      path: 'audioOutputDevice',
      labelPath: 'audioOutputDeviceLabel',
      displayValue: true,
      options: [systemDefaultOption],
      loadOptions: loadAudioOutputDevices,
      page: {
        title: 'Audio Output',
        labelTitle: 'settings.audioOutputDevice'
      }
    },
    {
      type: 'select',
      label: 'Audio Input',
      labelKey: 'settings.audioInputDevice',
      icon: 'audioInput',
      path: 'audioInputDevice',
      labelPath: 'audioInputDeviceLabel',
      displayValue: true,
      options: [systemDefaultOption],
      loadOptions: loadAudioInputDevices,
      page: {
        title: 'Audio Input',
        labelTitle: 'settings.audioInputDevice'
      }
    },
    {
      type: 'select',
      label: 'Sampling Frequency',
      labelKey: 'settings.samplingFrequency',
      icon: 'samplingFrequency',
      path: 'samplingFrequency',
      displayValue: true,
      options: [
        { label: '44.1 kHz', value: 0 },
        { label: '48 kHz', value: 1 }
      ],
      page: {
        title: 'Sampling Frequency',
        labelTitle: 'settings.samplingFrequency'
      }
    },
    {
      type: 'checkbox',
      label: 'Link Head Unit to System Volume',
      labelKey: 'settings.huVolumeLinkSystem',
      icon: 'volumeLink',
      path: 'huVolumeLinkSystem'
    },
    {
      type: 'checkbox',
      label: 'Disable Audio',
      labelKey: 'settings.disableAudio',
      icon: 'audioOff',
      path: 'disableAudioOutput'
    }
  ]
}
