import type {
  Action,
  DeviceView,
  FromCore,
  Front,
  Input,
  Navigation,
  NowPlaying,
  PerScreen,
  Screen,
  Sessions,
  System,
  ToCore,
  Update
} from '@shared/core/contract'
import { CoreSession } from '@shared/core/session'
import type { Config, TelemetryPayload } from '@shared/types'
import { create } from 'zustand'

type CoreBridge = {
  connect: (
    client: string,
    onMessage: (msg: FromCore) => void,
    onClose?: () => void
  ) => { send: (msg: ToCore) => boolean; close: () => void }
}

const getCoreBridge = (): CoreBridge | null => {
  if (typeof window === 'undefined') return null
  return (window as unknown as { core?: CoreBridge }).core ?? null
}

let session: CoreSession | null = null

export function coreAction(action: Action): Promise<void> {
  if (!session) return Promise.reject(new Error('core is not connected'))
  return session.act(action)
}

/** The route, only because statusData.json publishes it. */
export function reportPath(path: string): void {
  session?.path(path)
}

export function sendInput(input: Input): void {
  session?.input(input)
}

/** What a screen shows, so core puts the projection in front. */
export function reportShown(screen: Screen, front: Front): void {
  session?.show(screen, front)
}

/** Whether this window draws the spectrum, core only sends frames while it does. */
export function reportSpectrum(on: boolean): void {
  session?.spectrum(on)
}

/** Whether this window shows the link speed, core only asks the dongle for it then. */
export function reportLinkSpeed(on: boolean): void {
  session?.linkSpeed(on)
}

export function onSpectrum(listener: (bands: number[]) => void): () => void {
  return session?.onSpectrum(listener) ?? (() => {})
}

const applyDerivedFromSettings = (s: Config) => {
  const audioVolume = s.audioVolume ?? 1.0
  const navVolume = s.navVolume ?? 0.5
  const voiceAssistantVolume = s.voiceAssistantVolume ?? 0.5
  const callVolume = s.callVolume ?? 1.0

  return { audioVolume, navVolume, voiceAssistantVolume, callVolume }
}

const applyTelemetryControls = (msg: TelemetryPayload, prev: TelemetryPayload | null) => {
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

  // Momentary navigation request, the snapshot keeps the last one
  if (typeof msg.path === 'string' && msg.path !== prev?.path) {
    useStatusStore.getState().requestPath(msg.path)
  }
}

export interface CarplayStore {
  settings: Config | null

  sessions: Sessions
  front: PerScreen<Front> | null
  nowPlaying: NowPlaying | null
  navigation: Navigation | null

  system: System | null

  devices: DeviceView[]

  telemetry: TelemetryPayload | null

  update: Update | null

  restartBaseline: Config | null
  markRestartBaseline: () => void

  init: () => void

  saveSettings: (patch: Partial<Config>) => Promise<void>

  audioVolume: number
  navVolume: number
  voiceAssistantVolume: number
  callVolume: number

  audioDevicesRevision: number
}

export const useLiviStore = create<CarplayStore>((set, get) => {
  // Prevent double init (strict mode / hot reload)
  let didInit = false

  // With no phone connected core takes a change at once, nothing waits for apply.
  const followCore = (config: Config, sessions: Sessions) => {
    const baseline = get().restartBaseline
    set({
      settings: config,
      restartBaseline: sessions.total === 0 ? config : (baseline ?? config),
      ...applyDerivedFromSettings(config)
    })
  }

  const followSessions = (sessions: Sessions) => {
    set(sessions.total === 0 ? { sessions, restartBaseline: get().settings } : { sessions })
    const status = useStatusStore.getState()
    status.setActiveProtocol(sessions.active)
    status.setStreaming(sessions.active !== null)
  }

  const followSystem = (system: System, prev: System | undefined) => {
    const audioChanged =
      system.audioSinks !== prev?.audioSinks || system.audioSources !== prev?.audioSources
    set((s) => ({
      system,
      audioDevicesRevision: s.audioDevicesRevision + (audioChanged ? 1 : 0)
    }))
  }

  return {
    settings: null,
    sessions: { active: null, position: 0, total: 0 },
    front: null,
    nowPlaying: null,
    navigation: null,
    system: null,
    devices: [],
    telemetry: null,
    update: null,

    audioDevicesRevision: 0,

    restartBaseline: null,
    markRestartBaseline: () => {
      const s = get().settings
      if (!s) return
      set({ restartBaseline: s })
    },

    init: () => {
      if (didInit) return
      didInit = true

      const bridge = getCoreBridge()
      if (bridge) {
        const role = new URLSearchParams(window.location.search).get('role') ?? 'main'
        const current = new CoreSession((msg) => link.send(msg))
        session = current
        current.subscribe((state, prev) => {
          if (state.config !== prev?.config) {
            followCore(state.config as unknown as Config, state.sessions)
          }
          if (state.sessions !== prev?.sessions) followSessions(state.sessions)
          if (state.front !== prev?.front) set({ front: state.front })
          if (state.nowPlaying !== prev?.nowPlaying) set({ nowPlaying: state.nowPlaying })
          if (state.navigation !== prev?.navigation) set({ navigation: state.navigation })
          if (state.system !== prev?.system) followSystem(state.system, prev?.system)
          if (state.devices !== prev?.devices) set({ devices: state.devices })
          if (state.update !== prev?.update) set({ update: state.update })
          if (state.telemetry !== prev?.telemetry) {
            const telemetry = state.telemetry as TelemetryPayload
            const was = (prev?.telemetry as TelemetryPayload | undefined) ?? null
            set({ telemetry })
            applyTelemetryControls(telemetry, was)
          }
        })
        const link = bridge.connect(
          `ui:${role}`,
          (msg) => current.receive(msg),
          () => current.disconnected()
        )
      }
    },

    saveSettings: async (patch) => {
      // Optimistic, so the UI follows at once. Core's patch settles it.
      const prev = get().settings
      if (prev) {
        const merged = { ...prev, ...patch } as Config
        set({ settings: merged, ...applyDerivedFromSettings(merged) })
      }
      if (!session) return
      try {
        await session.act({ kind: 'setConfig', patch })
      } catch (err) {
        console.warn('settings not saved', err)
        session.resync()
      }
    },

    audioVolume: 0.95,
    navVolume: 0.95,
    voiceAssistantVolume: 0.95,
    callVolume: 0.95
  }
})

useLiviStore.getState().init()

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

export const useSessionsOpen = (): boolean => useLiviStore((s) => s.sessions.total > 0)
