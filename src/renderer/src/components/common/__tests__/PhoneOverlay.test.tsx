import { DEFAULT_CONFIG, type DeviceView } from '@shared/types'
import { act, render } from '@testing-library/react'
import { CYCLE_SESSION_EVENT } from '../../../constants'
import { useLiviStore } from '../../../store/store'
import { PhoneOverlay } from '../PhoneOverlay'

const phone = (id: string, status: DeviceView['status'], name?: string, model?: string) =>
  ({ id, status, name, model }) as DeviceView

const ready = (overlayMessages = true) =>
  act(() => useLiviStore.setState({ settings: { ...DEFAULT_CONFIG, overlayMessages } }))

const devices = (list: DeviceView[]) => act(() => useLiviStore.setState({ devices: list }))

const start = (list: DeviceView[]) => {
  useLiviStore.setState({ devices: list })
  const view = render(<PhoneOverlay />)
  ready()
  return view
}

const shownName = (container: HTMLElement) => container.querySelector('div')?.textContent

const sessions = (total: number) =>
  act(() => useLiviStore.setState({ sessions: { active: 'carplay', position: 1, total } }))

const cycleKey = () => act(() => void window.dispatchEvent(new Event(CYCLE_SESSION_EVENT)))

afterEach(() => {
  useLiviStore.setState({
    devices: [],
    settings: null,
    sessions: { active: null, position: 0, total: 0 }
  })
})

describe('PhoneOverlay', () => {
  test('says nothing about the phones already there at start', () => {
    useLiviStore.setState({ devices: [phone('a', 'active', 'Anna')] })
    const { container } = render(<PhoneOverlay />)
    expect(container).toBeEmptyDOMElement()

    ready()
    expect(container).toBeEmptyDOMElement()
  })

  test('names a phone that connects', () => {
    const { container } = start([phone('a', 'active', 'Anna')])
    devices([phone('a', 'active', 'Anna'), phone('b', 'available', 'Ben')])
    expect(shownName(container)).toBe('Ben')

    const shown = container.querySelector('div')
    devices([phone('a', 'active', 'Anna'), phone('b', 'offline', 'Ben')])
    expect(container.querySelector('div')).toBe(shown)
  })

  test('names the phone that takes over and a connecting one only once', () => {
    const { container } = start([phone('a', 'active', 'Anna'), phone('b', 'available', 'Ben')])
    devices([phone('a', 'available', 'Anna'), phone('b', 'active', 'Ben')])
    expect(shownName(container)).toBe('Ben')

    const first = container.querySelector('div')
    devices([
      phone('a', 'available', 'Anna'),
      phone('b', 'available', 'Ben'),
      phone('c', 'active', 'Cleo')
    ])
    expect(shownName(container)).toBe('Cleo')
    expect(container.querySelector('div')).not.toBe(first)
  })

  test('falls back to the model and stays quiet without either', () => {
    const { container } = start([])
    devices([phone('c', 'available', undefined, 'Pixel 8')])
    expect(shownName(container)).toBe('Pixel 8')

    const shown = container.querySelector('div')
    devices([phone('c', 'available', undefined, 'Pixel 8'), phone('d', 'available')])
    expect(container.querySelector('div')).toBe(shown)
  })

  test('a phone that went offline is news again when it comes back', () => {
    const { container } = start([phone('a', 'active', 'Anna')])
    devices([phone('a', 'offline', 'Anna')])
    expect(container).toBeEmptyDOMElement()

    devices([phone('a', 'active', 'Anna')])
    expect(shownName(container)).toBe('Anna')
  })

  test('stays hidden with overlay messages off', () => {
    useLiviStore.setState({ devices: [] })
    const { container } = render(<PhoneOverlay />)
    ready(false)
    devices([phone('b', 'active', 'Ben')])
    expect(container).toBeEmptyDOMElement()
  })

  test('starts over when core comes back', () => {
    const { container } = start([])
    act(() => useLiviStore.setState({ settings: null }))
    devices([phone('a', 'active', 'Anna')])
    ready()
    expect(container).toBeEmptyDOMElement()
  })

  test('names the one phone on every cycle key, with more phones the switch names it', () => {
    sessions(1)
    const { container } = start([phone('a', 'active', 'Anna')])
    cycleKey()
    expect(shownName(container)).toBe('Anna')
    const first = container.querySelector('div')
    cycleKey()
    expect(container.querySelector('div')).not.toBe(first)

    sessions(2)
    const second = container.querySelector('div')
    cycleKey()
    expect(container.querySelector('div')).toBe(second)
  })

  test('the cycle key names nobody without a phone in front', () => {
    const { container } = start([phone('a', 'available', 'Anna')])
    cycleKey()
    expect(container).toBeEmptyDOMElement()
  })
})
