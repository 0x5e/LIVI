import type { Config } from '@shared/types'
import { create } from 'zustand'

type VolumeStreamKey = 'music' | 'nav' | 'voiceAssistant' | 'call'

type CarplaySettingsApi = {
  get?: () => Promise<Config>
  save?: (settings: Partial<Config>) => Promise<void>
  onUpdate?: (cb: (event: unknown, settings: Config) => void) => () => void
}

type CarplayIpcApi = {
  setVolume?: (stream: VolumeStreamKey, volume: number) => void
  sendCommand?: (command: string) => void
  onTelemetry?: (handler: (payload: unknown) => void) => void
  offTelemetry?: (handler: (payload: unknown) => void) => void
  getTelemetrySnapshot?: () => Promise<unknown>
}

type ProjectionApi = {
  settings?: CarplaySettingsApi
  ipc?: CarplayIpcApi
}

const getProjectionApi = () => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { projection?: ProjectionApi }
  return w.projection ?? null
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const sendCarplayVolume = (stream: VolumeStreamKey, volume: number) => {
  const api = getProjectionApi()
  if (!api?.ipc?.setVolume) return
  try {
    api.ipc.setVolume(stream, clamp01(volume))
  } catch (err) {
    console.warn('projection-set-volume IPC failed', err)
  }
}

const sendCarplayNightMode = (nightMode: boolean) => {
  const api = getProjectionApi()
  if (!api?.ipc?.sendCommand) return

  try {
    api.ipc.sendCommand(nightMode ? 'enableNightMode' : 'disableNightMode')
  } catch (err) {
    console.warn('projection-set-night-mode IPC failed', err)
  }
}

const saveSettingsIpc = async (patch: Partial<Config>) => {
  const api = getProjectionApi()
  if (!api?.settings?.save) return
  try {
    await api.settings.save(patch)
  } catch (err) {
    console.warn('settings-save IPC failed', err)
  }
}

const getSettingsIpc = async (): Promise<Config | null> => {
  const api = getProjectionApi()
  if (!api?.settings?.get) return null
  try {
    return await api.settings.get()
  } catch (err) {
    console.warn('settings-get IPC failed', err)
    return null
  }
}

const applyDerivedFromSettings = (s: Config) => {
  const audioVolume = s.audioVolume ?? 1.0
  const navVolume = s.navVolume ?? 0.5
  const voiceAssistantVolume = s.voiceAssistantVolume ?? 0.5
  const callVolume = s.callVolume ?? 1.0
  const visualAudioDelayMs = s.visualAudioDelayMs ?? 120

  return { audioVolume, navVolume, voiceAssistantVolume, callVolume, visualAudioDelayMs }
}

const applyTelemetryControls = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return

  const msg = payload as Record<string, unknown>

  if (typeof msg.nightMode === 'boolean') {
    void useLiviStore.getState().saveSettings({ nightMode: msg.nightMode })
  }

  const explicitReverse =
    typeof msg.reverse === 'boolean'
      ? msg.reverse
      : msg.gear === 'R' || msg.gear === -1
        ? true
        : msg.gear !== undefined
          ? false
          : null
  if (explicitReverse !== null) {
    if (useStatusStore.getState().reverse !== explicitReverse) {
      useStatusStore.getState().setReverse(explicitReverse)
    }
  }

  if (typeof msg.lights === 'boolean') {
    if (useStatusStore.getState().lights !== msg.lights) {
      useStatusStore.getState().setLights(msg.lights)
    }
  }

  // Momentary navigation request
  if (typeof msg.path === 'string') {
    useStatusStore.getState().requestPath(msg.path)
  }
}

// Projection Store
export interface CarplayStore {
  // Full app config (from main, includes defaults)
  settings: Config | null

  // Used by "requires restart" logic
  restartBaseline: Config | null
  markRestartBaseline: () => void

  // Bootstrapping
  init: () => void

  // Save patches (main merges them into config.json)
  saveSettings: (patch: Partial<Config>) => Promise<void>

  // Display resolution
  negotiatedWidth: number | null
  negotiatedHeight: number | null

  // Audio metadata
  audioSampleRate: number | null
  setAudioInfo: (info: { sampleRate: number }) => void

  // PCM data for FFT
  audioPcmData: Float32Array | null
  setPcmData: (data: Float32Array) => void

  // Audio settings
  audioVolume: number
  navVolume: number
  voiceAssistantVolume: number
  callVolume: number
  visualAudioDelayMs: number

  // Bumped on every audio-device topology change from gst-device-monitor
  audioDevicesRevision: number
  bumpAudioDevicesRevision: () => void
}

export const useLiviStore = create<CarplayStore>((set, get) => {
  // Prevent double init (strict mode / hot reload)
  let didInit = false

  const refreshFromMain = async () => {
    const s = await getSettingsIpc()
    if (!s) return

    const derived = applyDerivedFromSettings(s)
    const baseline = get().restartBaseline

    set({
      settings: s,
      restartBaseline: baseline ?? s,
      ...derived
    })

    // Keep mixer in sync
    sendCarplayVolume('music', derived.audioVolume)
    sendCarplayVolume('nav', derived.navVolume)
    sendCarplayVolume('voiceAssistant', derived.voiceAssistantVolume)
    sendCarplayVolume('call', derived.callVolume)
  }

  return {
    settings: null,

    audioDevicesRevision: 0,
    bumpAudioDevicesRevision: () =>
      set((s) => ({ audioDevicesRevision: s.audioDevicesRevision + 1 })),

    restartBaseline: null,
    markRestartBaseline: () => {
      const s = get().settings
      if (!s) return
      set({ restartBaseline: s })
    },

    init: () => {
      if (didInit) return
      didInit = true

      // initial snapshot
      void refreshFromMain()

      // live sync: main -> renderer
      const api = getProjectionApi()
      if (api?.settings?.onUpdate) {
        api.settings.onUpdate((_evt, s) => {
          const derived = applyDerivedFromSettings(s)
          const baseline = get().restartBaseline

          set({
            settings: s,
            restartBaseline: baseline ?? s,
            ...derived
          })

          // keep mixer in sync
          sendCarplayVolume('music', derived.audioVolume)
          sendCarplayVolume('nav', derived.navVolume)
          sendCarplayVolume('voiceAssistant', derived.voiceAssistantVolume)
          sendCarplayVolume('call', derived.callVolume)
        })
      }

      if (api?.ipc?.onTelemetry) {
        // Hydration
        if (api.ipc.getTelemetrySnapshot) {
          void api.ipc.getTelemetrySnapshot().then((snap) => {
            if (snap && typeof snap === 'object' && Object.keys(snap).length > 0) {
              applyTelemetryControls(snap)
            }
          })
        }
        api.ipc.onTelemetry((payload) => {
          applyTelemetryControls(payload)
        })
      }
    },

    saveSettings: async (patchArg) => {
      let patch = patchArg

      // Optimistic merge so UI updates instantly
      const prev = get().settings
      if (prev) {
        const merged = { ...prev, ...patch } as Config

        const prevDerived = applyDerivedFromSettings(prev)
        const derived = applyDerivedFromSettings(merged)

        set({ settings: merged, ...derived })

        if (derived.audioVolume !== prevDerived.audioVolume) {
          sendCarplayVolume('music', derived.audioVolume)
        }
        if (derived.navVolume !== prevDerived.navVolume) {
          sendCarplayVolume('nav', derived.navVolume)
        }
        if (derived.voiceAssistantVolume !== prevDerived.voiceAssistantVolume) {
          sendCarplayVolume('voiceAssistant', derived.voiceAssistantVolume)
        }
        if (derived.callVolume !== prevDerived.callVolume) {
          sendCarplayVolume('call', derived.callVolume)
        }
        if (patch.nightMode !== undefined && Boolean(patch.nightMode) !== Boolean(prev.nightMode)) {
          sendCarplayNightMode(Boolean(patch.nightMode))
        }
      }

      // Persist patch in main
      await saveSettingsIpc(patch)

      // Re-fetch full merged config from main
      await refreshFromMain()
    },

    negotiatedWidth: null,
    negotiatedHeight: null,

    audioSampleRate: null,
    setAudioInfo: ({ sampleRate }) => set({ audioSampleRate: sampleRate }),

    audioPcmData: null,
    setPcmData: (data) => set({ audioPcmData: data }),

    // Defaults until first IPC load arrives
    audioVolume: 0.95,
    navVolume: 0.95,
    voiceAssistantVolume: 0.95,
    callVolume: 0.95,
    visualAudioDelayMs: 120
  }
})

// Auto-init
useLiviStore.getState().init()

// Status store
export type ActiveProtocol = 'carplay' | 'androidauto' | null

export interface StatusStore {
  reverse: boolean
  lights: boolean
  activeProtocol: ActiveProtocol
  isStreaming: boolean
  cameraFound: boolean
  clusterDashActive: boolean
  requestedPath: string | null

  setCameraFound: (found: boolean) => void
  setActiveProtocol: (protocol: ActiveProtocol) => void
  setStreaming: (streaming: boolean) => void
  setReverse: (reverse: boolean) => void
  setLights: (lights: boolean) => void
  setClusterDashActive: (active: boolean) => void
  requestPath: (path: string) => void
  clearRequestedPath: () => void
}

export const useStatusStore = create<StatusStore>((set, get) => ({
  reverse: false,
  lights: false,
  activeProtocol: null,
  isStreaming: false,
  cameraFound: false,
  clusterDashActive: false,
  requestedPath: null,

  setCameraFound: (found) => set({ cameraFound: found }),
  setActiveProtocol: (protocol) => {
    const wasPresent = get().activeProtocol !== null
    set({ activeProtocol: protocol })
    if (protocol !== null && !wasPresent) useLiviStore.getState().markRestartBaseline()
  },
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setReverse: (reverse) => set({ reverse }),
  setLights: (lights) => set({ lights }),
  setClusterDashActive: (active) => set({ clusterDashActive: active }),
  requestPath: (path) => set({ requestedPath: path }),
  clearRequestedPath: () => set({ requestedPath: null })
}))

export const useProjectionActive = (): boolean => useStatusStore((s) => s.activeProtocol !== null)
