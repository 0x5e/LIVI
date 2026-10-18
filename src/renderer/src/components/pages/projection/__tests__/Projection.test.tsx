import { render, waitFor } from '@testing-library/react'
import { Projection } from '../Projection'

const navigateMock = vi.fn()
const reportShownMock = vi.fn()
let mockPathname = '/'

type AnyFn = (...args: any[]) => any

const statusState: Record<string, any> = {
  isStreaming: true,
  activeProtocol: null
}

const liviState: Record<string, any> = {}

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

  const reportShown = (screen: string, front: string) => reportShownMock(screen, front)

  return { reportShown, useStatusStore, useLiviStore, useProjectionActive }
})

vi.mock('../hooks/useProjectionTouch', () => ({
  useProjectionMultiTouch: () => ({})
}))

describe('Projection page', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    reportShownMock.mockReset()
    mockPathname = '/'

    statusState.isStreaming = true
    statusState.activeProtocol = null

    liviState.front = null
    liviState.sessions = { active: null }

    ;(global as any).ResizeObserver = vi.fn(function () {
      return {
        observe: vi.fn(),
        disconnect: vi.fn()
      }
    })
  })

  test('a phone that streams drives video visibility', () => {
    const setReceivingVideo = vi.fn()

    const { rerender } = render(<Projection {...baseProps({ setReceivingVideo })} />)
    expect(setReceivingVideo).toHaveBeenLastCalledWith(true)

    statusState.isStreaming = false
    rerender(<Projection {...baseProps({ setReceivingVideo })} />)
    expect(setReceivingVideo).toHaveBeenLastCalledWith(false)
  })

  test('the route tells core what the main screen shows', () => {
    const { rerender } = render(<Projection {...baseProps()} />)
    expect(reportShownMock).toHaveBeenLastCalledWith('main', 'projection')

    mockPathname = '/media'
    rerender(<Projection {...baseProps()} />)
    expect(reportShownMock).toHaveBeenLastCalledWith('main', 'livi')

    statusState.clusterDashActive = true
    rerender(<Projection {...baseProps()} />)
    expect(reportShownMock).toHaveBeenLastCalledWith('main', 'cluster')
    statusState.clusterDashActive = false
  })

  test('a connected phone turns the status overlay to its phone phase', () => {
    statusState.activeProtocol = 'carplay'

    const { container } = render(<Projection {...baseProps()} />)

    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  test('the UI follows core bringing the projection forward and taking it back', () => {
    mockPathname = '/settings'
    liviState.sessions = { active: 'carplay' }
    liviState.front = { main: 'livi' }
    const { rerender } = render(<Projection {...baseProps()} />)

    liviState.front = { main: 'projection' }
    rerender(<Projection {...baseProps()} />)
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })

    navigateMock.mockClear()
    mockPathname = '/'
    rerender(<Projection {...baseProps()} />)
    liviState.front = { main: 'livi' }
    rerender(<Projection {...baseProps()} />)
    expect(navigateMock).toHaveBeenCalledWith('/settings', { replace: true })
  })

  test('the phone handing the screen back leads to the media page', () => {
    liviState.sessions = { active: 'carplay' }
    liviState.front = { main: 'projection' }
    const { rerender } = render(<Projection {...baseProps()} />)

    liviState.front = { main: 'livi' }
    rerender(<Projection {...baseProps()} />)
    expect(navigateMock).toHaveBeenCalledWith('/media', { replace: true })
  })

  test('a phone that is gone leaves the projection page to its idle look', () => {
    liviState.front = { main: 'projection' }
    const { rerender } = render(<Projection {...baseProps()} />)

    liviState.front = { main: 'livi' }
    rerender(<Projection {...baseProps()} />)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('the first state and the UI moving by itself do not navigate', () => {
    mockPathname = '/media'
    liviState.sessions = { active: 'carplay' }
    const { rerender } = render(<Projection {...baseProps()} />)

    liviState.front = { main: 'projection' }
    rerender(<Projection {...baseProps()} />)
    liviState.front = { main: 'livi' }
    rerender(<Projection {...baseProps()} />)
    mockPathname = '/'
    liviState.front = { main: 'projection' }
    rerender(<Projection {...baseProps()} />)

    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('leaving the projection forgets the way back', () => {
    mockPathname = '/settings'
    liviState.sessions = { active: 'carplay' }
    liviState.front = { main: 'livi' }
    const { rerender } = render(<Projection {...baseProps()} />)
    liviState.front = { main: 'projection' }
    rerender(<Projection {...baseProps()} />)

    for (const path of ['/', '/telemetry', '/']) {
      mockPathname = path
      rerender(<Projection {...baseProps()} />)
    }
    navigateMock.mockClear()
    liviState.front = { main: 'livi' }
    rerender(<Projection {...baseProps()} />)
    expect(navigateMock).toHaveBeenCalledWith('/media', { replace: true })
  })

  test('the video shows through only on the projection route', () => {
    const { rerender } = render(<Projection {...baseProps({ receivingVideo: true })} />)
    expect(document.documentElement.classList.contains('show-video')).toBe(true)

    mockPathname = '/media'
    rerender(<Projection {...baseProps({ receivingVideo: true })} />)
    expect(document.documentElement.classList.contains('show-video')).toBe(false)
  })

  test('overlay offset recalc runs when content-root is in the DOM', async () => {
    const anchor = document.createElement('div')
    anchor.id = 'content-root'
    document.body.appendChild(anchor)

    // jsdom gives a zero DOMRect, recalc still runs through.
    expect(() => {
      render(<Projection {...baseProps()} />)
    }).not.toThrow()

    document.body.removeChild(anchor)
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
    ...overrides
  }
}
