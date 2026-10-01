import { AudioCommand, CommandMapping } from '@shared/types/ProjectionEnums'
import { act, render, waitFor } from '@testing-library/react'
import { Projection } from '../Projection'

const navigateMock = vi.fn()
let mockPathname = '/'

type AnyFn = (...args: any[]) => any

const statusState: Record<string, any> = {
  isStreaming: true,
  activeProtocol: null,
  setStreaming: vi.fn(),
  setActiveProtocol: vi.fn()
}

const liviState: Record<string, any> = {
  negotiatedWidth: 0,
  negotiatedHeight: 0,
  setAudioInfo: vi.fn(),
  setPcmData: vi.fn(),
  bumpAudioDevicesRevision: vi.fn()
}

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: mockPathname })
}))

vi.mock('../../../../store/store', async () => {
  const useStatusStore: any = (selector: AnyFn) => selector(statusState)
  useStatusStore.setState = (patch: Record<string, any>) => Object.assign(statusState, patch)

  const useLiviStore: any = (selector: AnyFn) => selector(liviState)
  useLiviStore.setState = (patch: Record<string, any> | AnyFn) => {
    if (typeof patch === 'function') {
      Object.assign(liviState, patch(liviState))
    } else {
      Object.assign(liviState, patch)
    }
  }

  const useProjectionActive = () => statusState.activeProtocol != null

  return { useStatusStore, useLiviStore, useProjectionActive }
})

vi.mock('../hooks/useProjectionTouch', () => ({
  useProjectionMultiTouch: () => ({})
}))

describe('Projection page', () => {
  let onEventCb: AnyFn | undefined

  beforeEach(() => {
    navigateMock.mockReset()
    mockPathname = '/'

    statusState.isStreaming = true
    statusState.activeProtocol = null
    statusState.setStreaming.mockClear()
    statusState.setActiveProtocol.mockClear()

    liviState.negotiatedWidth = 0
    liviState.negotiatedHeight = 0
    liviState.setAudioInfo.mockClear()
    liviState.setPcmData.mockClear()
    liviState.bumpAudioDevicesRevision.mockClear()

    ;(global as any).ResizeObserver = vi.fn(function () {
      return {
        observe: vi.fn(),
        disconnect: vi.fn()
      }
    })
    ;(window as any).projection = {
      ipc: {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        sendFrame: vi.fn().mockResolvedValue(undefined),
        setVisible: vi.fn().mockResolvedValue(undefined),
        onAudioChunk: vi.fn(),
        offAudioChunk: vi.fn(),
        onEvent: vi.fn((cb: AnyFn) => (onEventCb = cb)),
        sendCommand: vi.fn()
      }
    }
  })

  test('projection event drives video visibility', async () => {
    const setReceivingVideo = vi.fn()

    render(<Projection {...baseProps({ setReceivingVideo })} />)

    await act(async () => {
      onEventCb?.(null, { type: 'projection', shown: true })
    })
    expect(setReceivingVideo).toHaveBeenCalledWith(true)

    setReceivingVideo.mockClear()
    await act(async () => {
      onEventCb?.(null, { type: 'projection', shown: false })
    })
    expect(setReceivingVideo).toHaveBeenCalledWith(false)
  })

  test('handles audioInfo event', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'audioInfo',
        payload: {
          codec: 'aac',
          sampleRate: 48000,
          channels: 2,
          bitDepth: 16
        }
      })
    })

    expect(liviState.setAudioInfo).toHaveBeenCalledWith({ sampleRate: 48000 })
  })

  test('requestHostUI navigates', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.requestHostUI }
      })
    })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/media', { replace: true })
    })
  })

  test('handles audioInfo event', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'audioInfo',
        payload: {
          codec: 'aac',
          sampleRate: 48000,
          channels: 2,
          bitDepth: 16
        }
      })
    })

    expect(liviState.setAudioInfo).toHaveBeenCalledWith({ sampleRate: 48000 })
  })

  test('handles phone call start (auto switch)', async () => {
    mockPathname = '/media'

    render(
      <Projection
        {...baseProps()}
        settings={{ width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any}
      />
    )

    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStart }
      })
    })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  test('sends key command when commandCounter changes and stream is active', async () => {
    statusState.isStreaming = true

    render(<Projection {...baseProps()} command={'home' as any} commandCounter={1} />)

    expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledWith('home')
  })

  test('does not re-send last key command on isStreaming flicker', async () => {
    statusState.isStreaming = true

    const { rerender } = render(
      <Projection {...baseProps()} command={'home' as any} commandCounter={1} />
    )
    expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledTimes(1)
    expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledWith('home')

    statusState.isStreaming = false
    rerender(<Projection {...baseProps()} command={'home' as any} commandCounter={1} />)
    statusState.isStreaming = true
    rerender(<Projection {...baseProps()} command={'home' as any} commandCounter={1} />)

    expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledTimes(1)
  })

  // ── IPC plugged / unplugged / failure events ──────────────────────────────

  test('IPC session end clears the active protocol, not the video plane', async () => {
    const setReceivingVideo = vi.fn()

    render(<Projection {...baseProps({ setReceivingVideo })} />)

    act(() => {
      onEventCb?.(null, { type: 'session', protocol: null })
    })

    expect(statusState.setActiveProtocol).toHaveBeenCalledWith(null)
    expect(setReceivingVideo).not.toHaveBeenCalled()
    expect(statusState.setStreaming).not.toHaveBeenCalled()
  })

  // ── Audio command events ──────────────────────────────────────────────────

  test('AudioPhonecallStop releases call attention and returns to previous route', async () => {
    mockPathname = '/media'

    const { rerender } = render(
      <Projection
        {...baseProps()}
        settings={{ width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any}
      />
    )

    // arm: switch to projection on call start
    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStart }
      })
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))

    navigateMock.mockClear()
    mockPathname = '/'

    rerender(
      <Projection
        {...baseProps()}
        settings={{ width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any}
      />
    )

    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStop }
      })
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/media', { replace: true }))
  })

  test('a call Siri placed inherits the way back from Siri', async () => {
    mockPathname = '/media'

    const { rerender } = render(
      <Projection
        {...baseProps()}
        settings={{ width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any}
      />
    )

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiActive }
      })
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))

    navigateMock.mockClear()
    mockPathname = '/'
    rerender(
      <Projection
        {...baseProps()}
        settings={{ width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any}
      />
    )

    // The call takes over while Siri still holds the projection, and Siri ends afterwards.
    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStart }
      })
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiIdle }
      })
    })
    expect(navigateMock).not.toHaveBeenCalled()

    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStop }
      })
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/media', { replace: true }))
  })

  test('AudioAttentionRinging triggers call attention switch when autoSwitchOnPhoneCall', async () => {
    mockPathname = '/media'

    render(
      <Projection
        {...baseProps()}
        settings={{ width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any}
      />
    )

    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioAttentionRinging }
      })
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))
  })

  test('voiceAssistantUiActive triggers voiceAssistant attention switch', async () => {
    mockPathname = '/media'

    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiActive }
      })
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))
  })

  test('voiceAssistantUiIdle returns to previous route immediately (no timer)', async () => {
    mockPathname = '/media'

    const { rerender } = render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiActive }
      })
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))

    navigateMock.mockClear()
    mockPathname = '/'
    rerender(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiIdle }
      })
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/media', { replace: true }))
  })

  // ── applyAttention: already on projection path ────────────────────────────

  test('applyAttention does nothing when already on projection route', async () => {
    mockPathname = '/'

    render(
      <Projection
        {...baseProps()}
        settings={{ width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any}
      />
    )

    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStart }
      })
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  // ── handleAudio: PCM conversion ───────────────────────────────────────────

  test('handleAudio converts int16 chunk to float32 and schedules setPcmData', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(<Projection {...baseProps()} />)

    const ipc = (window as any).projection.ipc
    const audioChunkFn: AnyFn = ipc.onAudioChunk.mock.calls[0]?.[0]

    const int16 = new Int16Array([0, 16384, -16384, 32767])
    const buf = int16.buffer

    act(() => {
      audioChunkFn?.({ chunk: { buffer: buf } })
      vi.runAllTimers()
    })

    expect(liviState.setPcmData).toHaveBeenCalledTimes(1)
    const f32: Float32Array = liviState.setPcmData.mock.calls[0][0]
    expect(f32).toBeInstanceOf(Float32Array)
    expect(f32.length).toBe(4)
    expect(f32[0]).toBeCloseTo(0)
    expect(f32[1]).toBeCloseTo(0.5, 1)

    vi.useRealTimers()
  })

  test('handleAudio cleanup clears pending timers on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { unmount } = render(<Projection {...baseProps()} />)

    const ipc = (window as any).projection.ipc
    const audioChunkFn: AnyFn = ipc.onAudioChunk.mock.calls[0]?.[0]

    const int16 = new Int16Array([1000])
    act(() => {
      audioChunkFn?.({ chunk: { buffer: int16.buffer } })
    })

    // Unmount before timer fires → cleanup cancels it
    unmount()

    act(() => {
      vi.runAllTimers()
    })

    expect(liviState.setPcmData).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  test('IPC command with unrecognized value hits final break', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: 9999 }
      })
    })

    // No throw, no navigation
    expect(navigateMock).not.toHaveBeenCalled()
  })

  // ── attention back-path cleared when user navigates manually ─────────────

  test('pathname change while attention is armed clears attentionSwitchedByRef', async () => {
    mockPathname = '/media'

    const { rerender } = render(<Projection {...baseProps()} />)

    // Arm voiceAssistant attention
    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiActive }
      })
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))

    // User manually navigates to '/settings' while voiceAssistant is active
    // → the pathname effect clears attentionSwitchedByRef
    mockPathname = '/settings'
    rerender(<Projection {...baseProps()} />)

    navigateMock.mockClear()

    // VoiceAssistant inactive now: attentionSwitchedByRef is already null → no navigation back
    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiIdle }
      })
    })

    // No back-navigation since attentionSwitchedByRef was cleared
    expect(navigateMock).not.toHaveBeenCalledWith('/media', expect.anything())
  })

  // ── recalc runs when content-root element is present ─────────────────────

  test('overlay offset recalc runs when content-root is in the DOM', async () => {
    const anchor = document.createElement('div')
    anchor.id = 'content-root'
    document.body.appendChild(anchor)

    // No throw; recalc should execute the full body with a zero DOMRect
    expect(() => {
      render(<Projection {...baseProps()} />)
    }).not.toThrow()

    document.body.removeChild(anchor)
  })

  test('navigating back to projection presses home and requests a frame', async () => {
    mockPathname = '/media'
    statusState.activeProtocol = 'carplay'

    const { rerender } = render(<Projection {...baseProps()} />)
    ;(window as any).projection.ipc.sendCommand.mockClear()
    ;(window as any).projection.ipc.sendFrame.mockClear()

    mockPathname = '/'
    rerender(<Projection {...baseProps()} />)

    await waitFor(() =>
      expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledWith('home')
    )
    expect((window as any).projection.ipc.sendFrame).toHaveBeenCalled()
  })

  test('navigating back to projection is a no-op while projection is inactive', async () => {
    statusState.activeProtocol = null

    mockPathname = '/media'
    const { rerender } = render(<Projection {...baseProps()} />)
    ;(window as any).projection.ipc.sendCommand.mockClear()

    mockPathname = '/'
    rerender(<Projection {...baseProps()} />)

    expect((window as any).projection.ipc.sendCommand).not.toHaveBeenCalledWith('home')
  })

  test('back-to-projection frame request swallows a rejection', async () => {
    ;(window as any).projection.ipc.sendFrame = vi.fn().mockRejectedValue(new Error('no frame'))

    mockPathname = '/media'
    statusState.activeProtocol = 'carplay'
    const { rerender } = render(<Projection {...baseProps()} />)

    mockPathname = '/'
    expect(() => rerender(<Projection {...baseProps()} />)).not.toThrow()

    await waitFor(() =>
      expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledWith('home')
    )
  })

  test('visibility update swallows a rejection', async () => {
    ;(window as any).projection.ipc.setVisible = vi.fn().mockRejectedValue(new Error('hidden'))

    expect(() => render(<Projection {...baseProps()} />)).not.toThrow()

    await waitFor(() => expect((window as any).projection.ipc.setVisible).toHaveBeenCalled())
  })

  test('overlay recalc tolerates a missing ResizeObserver', () => {
    const anchor = document.createElement('div')
    anchor.id = 'content-root'
    document.body.appendChild(anchor)

    const { rerender } = render(
      <Projection {...baseProps({ settings: baseSettings({ hand: 'left' }) })} />
    )

    const original = (global as any).ResizeObserver
    ;(global as any).ResizeObserver = undefined

    expect(() =>
      rerender(<Projection {...baseProps({ settings: baseSettings({ hand: 'right' }) })} />)
    ).not.toThrow()

    ;(global as any).ResizeObserver = original
    document.body.removeChild(anchor)
  })

  test('audioDevicesChanged bumps the audio devices revision', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'audioDevicesChanged' })
    })

    expect(liviState.bumpAudioDevicesRevision).toHaveBeenCalled()
  })

  test('resolution event stores negotiated dimensions', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'resolution', payload: { width: 1280, height: 720 } })
    })

    expect(liviState.negotiatedWidth).toBe(1280)
    expect(liviState.negotiatedHeight).toBe(720)
  })

  test('resolution event without a payload is ignored', async () => {
    liviState.negotiatedWidth = 42

    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'resolution' })
    })

    expect(liviState.negotiatedWidth).toBe(42)
  })

  test('resolution event with a non-numeric width is ignored', async () => {
    liviState.negotiatedWidth = 43

    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'resolution', payload: { width: 'x', height: 100 } })
    })

    expect(liviState.negotiatedWidth).toBe(43)
  })

  test('resolution event with a missing height is ignored', async () => {
    liviState.negotiatedWidth = 44

    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'resolution', payload: { width: 100 } })
    })

    expect(liviState.negotiatedWidth).toBe(44)
  })

  test('audio event with a non-numeric command is ignored', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'audio', payload: {} })
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('ipc audioInfo without a payload is ignored', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'audioInfo' })
    })

    expect(liviState.setAudioInfo).not.toHaveBeenCalled()
  })

  test('ipc audioInfo without a sample rate defaults to zero', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'audioInfo', payload: {} })
    })

    expect(liviState.setAudioInfo).toHaveBeenCalledWith({ sampleRate: 0 })
  })

  test('ipc command with a non-numeric value is ignored', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'command', message: {} })
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('key command effect skips when the counter matches the last sent value', async () => {
    const { rerender } = render(
      <Projection {...baseProps()} command={'home' as any} commandCounter={1} />
    )
    expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledTimes(1)

    rerender(<Projection {...baseProps()} command={'back' as any} commandCounter={1} />)

    expect((window as any).projection.ipc.sendCommand).toHaveBeenCalledTimes(1)
  })

  test('computes the touch transform when dimensions are negotiated', () => {
    liviState.negotiatedWidth = 1920
    liviState.negotiatedHeight = 1080

    expect(() =>
      render(
        <Projection
          {...baseProps({
            settings: baseSettings({ projectionWidth: 800, projectionHeight: 480 })
          })}
        />
      )
    ).not.toThrow()
  })

  test('handles null negotiated dimensions', () => {
    liviState.negotiatedWidth = null
    liviState.negotiatedHeight = null

    expect(() => render(<Projection {...baseProps()} />)).not.toThrow()
  })

  test('handles negotiated width without a negotiated height', () => {
    liviState.negotiatedWidth = 100
    liviState.negotiatedHeight = 0

    expect(() => render(<Projection {...baseProps()} />)).not.toThrow()
  })

  test('handles negotiated dimensions with a zero projection width', () => {
    liviState.negotiatedWidth = 100
    liviState.negotiatedHeight = 100

    expect(() =>
      render(
        <Projection
          {...baseProps({ settings: baseSettings({ projectionWidth: 0, projectionHeight: 480 }) })}
        />
      )
    ).not.toThrow()
  })

  test('handles negotiated dimensions with a zero projection height', () => {
    liviState.negotiatedWidth = 100
    liviState.negotiatedHeight = 100

    expect(() =>
      render(
        <Projection
          {...baseProps({ settings: baseSettings({ projectionWidth: 800, projectionHeight: 0 }) })}
        />
      )
    ).not.toThrow()
  })

  test('requestHostUI does not navigate when already on the host route', async () => {
    mockPathname = '/media'

    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'command', message: { value: CommandMapping.requestHostUI } })
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('call attention stays armed when active follows ringing on projection', async () => {
    mockPathname = '/media'
    const settings = baseSettings({ autoSwitchOnPhoneCall: true })

    const { rerender } = render(<Projection {...baseProps({ settings })} />)

    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioAttentionRinging }
      })
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))

    navigateMock.mockClear()
    mockPathname = '/'
    rerender(<Projection {...baseProps({ settings })} />)

    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStart }
      })
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('voiceAssistant idle does not navigate back when not on the projection route', async () => {
    mockPathname = '/media'

    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiActive }
      })
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))

    navigateMock.mockClear()

    act(() => {
      onEventCb?.(null, {
        type: 'command',
        message: { value: CommandMapping.voiceAssistantUiIdle }
      })
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('audio event with an unrecognized numeric command is ignored', async () => {
    render(<Projection {...baseProps()} />)

    act(() => {
      onEventCb?.(null, { type: 'audio', payload: { command: 99999 } })
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  // ── receivingVideo=true: overlay hides, video plane reveals ──────────────

  test('receiving video hides the status overlay and reveals the video plane', () => {
    mockPathname = '/'

    const { container } = render(<Projection {...baseProps({ receivingVideo: true })} />)

    const overlay = container.querySelector('[role="status"]') as HTMLElement
    expect(overlay).toHaveStyle({ display: 'none' })

    const videoContainer = container.querySelector('#videoContainer') as HTMLElement
    expect(videoContainer.style.backgroundColor).toBe('transparent')
    expect(videoContainer.style.visibility).toBe('visible')
    expect(videoContainer.style.zIndex).toBe('1')
  })

  // ── returning to projection while attention already switched us there ────

  test('does not press home when attention already switched us to projection', async () => {
    mockPathname = '/media'
    statusState.activeProtocol = 'carplay'

    const settings = { width: 800, height: 480, fps: 60, autoSwitchOnPhoneCall: true } as any

    const { rerender } = render(<Projection {...baseProps({ settings })} />)

    // Arm call attention (calls navigate('/', ...), attentionSwitchedByRef.current = 'call')
    act(() => {
      onEventCb?.(null, {
        type: 'audio',
        payload: { command: AudioCommand.AudioPhonecallStart }
      })
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))

    ;(window as any).projection.ipc.sendCommand.mockClear()

    // Pathname actually flips to '/' while attentionSwitchedByRef.current is still 'call' and
    // isProjectionActive stays true: the 'home' press must be skipped so an in-progress
    // Siri/call session isn't dismissed.
    mockPathname = '/'
    rerender(<Projection {...baseProps({ settings })} />)

    expect((window as any).projection.ipc.sendCommand).not.toHaveBeenCalledWith('home')
  })
})

function baseSettings(overrides: any = {}) {
  return {
    width: 800,
    height: 480,
    fps: 60,
    cluster: { main: false, dash: false, aux: false },
    ...overrides
  }
}

function baseProps(overrides: any = {}) {
  return {
    receivingVideo: false,
    setReceivingVideo: vi.fn(),
    settings: {
      width: 800,
      height: 480,
      fps: 60,
      cluster: { main: false, dash: false, aux: false }
    },
    command: '' as any,
    commandCounter: 0,
    ...overrides
  }
}
