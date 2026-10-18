import { ROUTES } from '@shared/types'
import { renderHook } from '@testing-library/react'
import { ReactNode } from 'react'
import { CYCLE_SESSION_EVENT } from '../../../constants'
import { AppContext, AppContextProps } from '../../../context'
import { useKeyDownProps } from '../types'
import { useKeyDown } from '../useKeyDown'

const mockBroadcastMediaKey = vi.fn()
const mockSendInput = vi.fn()
const mockCoreAction = vi.fn()
const key = (code: string) => ({ kind: 'key', code, down: true })

let mockPathname: string = ROUTES.HOME
let mockHash = ''
let mockSettings: any = null

vi.mock('../../../utils/broadcastMediaKey', () => ({
  broadcastMediaKey: (...args: unknown[]) => mockBroadcastMediaKey(...args)
}))

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: mockPathname, hash: mockHash })
}))

vi.mock('@store/store', () => ({
  sendInput: (...args: unknown[]) => mockSendInput(...args),
  coreAction: (...args: unknown[]) => mockCoreAction(...args),
  useLiviStore: (selector: (s: { settings: unknown }) => unknown) =>
    selector({ settings: mockSettings })
}))

const makeEvent = (code: string) => {
  const preventDefault = vi.fn()
  const stopPropagation = vi.fn()

  return {
    code,
    preventDefault,
    stopPropagation
  } as unknown as KeyboardEvent
}

const setupRoots = () => {
  document.body.innerHTML = ''

  const navRoot = document.createElement('div')
  navRoot.id = 'nav-root'
  document.body.appendChild(navRoot)

  const contentRoot = document.createElement('div')
  contentRoot.id = 'content-root'
  document.body.appendChild(contentRoot)

  return { navRoot, contentRoot }
}

const baseProps = (): useKeyDownProps => ({
  receivingVideo: false,
  inContainer: (root, el) => !!root && !!el && root.contains(el),
  focusSelectedNav: vi.fn(() => false),
  focusFirstInMain: vi.fn(() => false),
  moveFocusLinear: vi.fn(() => false),
  isFormField: vi.fn(() => false),
  activateControl: vi.fn(() => false)
})

const renderKeyDown = (props: useKeyDownProps, context: AppContextProps) =>
  renderHook(() => useKeyDown(props), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )
  })

describe('useKeyDown', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mockPathname = ROUTES.HOME
    mockHash = ''
    mockSettings = null
    document.body.innerHTML = ''
  })

  test('hands mapped keys to core in CarPlay mode', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { navRoot, contentRoot } = setupRoots()
    const mainBtn = document.createElement('button')
    contentRoot.appendChild(mainBtn)
    mainBtn.focus()

    mockSettings = {
      bindings: {
        selectDown: 'Enter'
      }
    }

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      navEl: { current: navRoot },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: true,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => true),
          focusFirstInMain: vi.fn(() => true),
          moveFocusLinear: vi.fn(() => true),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => true)
        }),
      { wrapper }
    )

    const event = makeEvent('Enter')
    result.current(event)

    expect(mockSendInput).toHaveBeenCalledWith(key('Enter'))
    expect(mockBroadcastMediaKey).toHaveBeenCalledWith('selectDown')

    // Core releases the select on its own.
    vi.advanceTimersByTime(220)

    expect(mockSendInput).toHaveBeenCalledTimes(1)
    expect(mockBroadcastMediaKey).not.toHaveBeenCalledWith('selectUp')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  test('telemetry pager handles left/right when not in nav', () => {
    setupRoots()
    mockPathname = ROUTES.TELEMETRY

    const pager = {
      prev: vi.fn(),
      next: vi.fn(),
      canPrev: vi.fn(() => true),
      canNext: vi.fn(() => true)
    }

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      telemetryPager: pager,
      onSetAppContext: vi.fn()
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: () => false,
          focusSelectedNav: vi.fn(() => true),
          focusFirstInMain: vi.fn(() => true),
          moveFocusLinear: vi.fn(() => true),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => true)
        }),
      { wrapper }
    )

    const left = makeEvent('ArrowLeft')
    result.current(left)
    expect(pager.prev).toHaveBeenCalled()

    const right = makeEvent('ArrowRight')
    result.current(right)
    expect(pager.next).toHaveBeenCalled()
    expect(right.preventDefault).toHaveBeenCalled()
  })

  test('nav container remaps left/right to up/down and handles enter', () => {
    const { navRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA
    mockSettings = { bindings: { selectDown: 'Enter' } }
    const prevRaf = window.requestAnimationFrame
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }) as typeof window.requestAnimationFrame
    const navBtn = document.createElement('button')
    navRoot.appendChild(navBtn)
    navBtn.focus()

    const dispatchSpy = vi.spyOn(navBtn, 'dispatchEvent')
    const clickSpy = vi.spyOn(navBtn, 'click')
    const activateControl = vi.fn(() => false)

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      navEl: { current: navRoot },
      onSetAppContext: vi.fn()
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const focusFirstInMain = vi.fn(() => true)

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => true),
          focusFirstInMain,
          moveFocusLinear: vi.fn(() => true),
          isFormField: vi.fn(() => false),
          activateControl
        }),
      { wrapper }
    )

    result.current(makeEvent('ArrowLeft'))
    result.current(makeEvent('ArrowRight'))
    result.current(makeEvent('Enter'))

    expect(dispatchSpy).toHaveBeenCalled()
    expect(activateControl).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(focusFirstInMain).toHaveBeenCalled()

    window.requestAnimationFrame = prevRaf
  })

  test('maps listbox navigation in main area', () => {
    const { contentRoot } = setupRoots()
    const listbox = document.createElement('div')
    listbox.setAttribute('role', 'listbox')
    const option = document.createElement('button')
    option.setAttribute('role', 'menuitem')
    listbox.appendChild(option)
    contentRoot.appendChild(listbox)
    option.focus()

    const dispatchSpy = vi.spyOn(option, 'dispatchEvent')

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => true),
          focusFirstInMain: vi.fn(() => true),
          moveFocusLinear: vi.fn(() => true),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('ArrowLeft'))
    expect(dispatchSpy).toHaveBeenCalled()
  })

  test('handles back key in settings sub-route and main interactions', () => {
    const { contentRoot } = setupRoots()

    mockPathname = '/settings/system'
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)

    const input = document.createElement('input')
    input.type = 'number'
    contentRoot.appendChild(input)
    input.focus()

    const onSetAppContext = vi.fn()
    const activateControl = vi.fn(() => true)
    const moveFocusLinear = vi.fn(() => true)

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => true),
          focusFirstInMain: vi.fn(() => true),
          moveFocusLinear,
          isFormField: (el) => !!el && el.tagName === 'INPUT',
          activateControl
        }),
      { wrapper }
    )

    result.current(makeEvent('Escape'))
    expect(backSpy).toHaveBeenCalled()

    result.current(makeEvent('Enter'))
    expect(onSetAppContext).toHaveBeenCalled()
    ;(document.activeElement as HTMLInputElement).type = 'range'
    result.current(makeEvent('ArrowRight'))
    result.current(makeEvent('ArrowDown'))
    ;(document.activeElement as HTMLInputElement).type = 'text'
    result.current(makeEvent('ArrowDown'))
    expect(moveFocusLinear).toHaveBeenCalledWith(1)

    backSpy.mockRestore()
  })

  test('handles transport keys when not in CarPlay mode', () => {
    setupRoots()
    mockPathname = ROUTES.MEDIA
    mockSettings = {
      bindings: {
        next: 'MediaNext'
      }
    }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={{ isTouchDevice: false }}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: () => false,
          focusSelectedNav: vi.fn(() => true),
          focusFirstInMain: vi.fn(() => true),
          moveFocusLinear: vi.fn(() => true),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('MediaNext'))

    expect(mockSendInput).toHaveBeenCalledWith(key('MediaNext'))
    expect(mockBroadcastMediaKey).toHaveBeenCalledWith('next')
  })

  test('focuses nav when nothing is focused and arrow key is pressed', () => {
    setupRoots()
    const focusSelectedNav = vi.fn(() => true)

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={{ isTouchDevice: false }}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: () => false,
          focusSelectedNav,
          focusFirstInMain: vi.fn(() => true),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('ArrowUp')
    result.current(event)

    expect(focusSelectedNav).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('hash without leading slash is normalised to /media route', () => {
    mockHash = '#media'
    mockPathname = ''
    setupRoots()

    const focusSelectedNav = vi.fn(() => false)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={{ isTouchDevice: false }}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: () => false,
          focusSelectedNav,
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('ArrowUp'))
    expect(focusSelectedNav).toHaveBeenCalled()
  })

  test('Backspace in a form field without editingField returns early', () => {
    const { contentRoot } = setupRoots()
    const input = document.createElement('input')
    input.type = 'text'
    contentRoot.appendChild(input)
    input.focus()

    const activateControl = vi.fn(() => false)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: () => true,
          activateControl
        }),
      { wrapper }
    )

    const event = makeEvent('Backspace')
    result.current(event)
    expect(activateControl).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('dialog root counts as inMain for focus routing', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const dialogBtn = document.createElement('button')
    dialog.appendChild(dialogBtn)
    document.body.appendChild(dialog)
    dialogBtn.focus()

    const activateControl = vi.fn(() => true)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl
        }),
      { wrapper }
    )

    result.current(makeEvent('Enter'))
    expect(activateControl).toHaveBeenCalled()

    document.body.removeChild(dialog)
  })

  test('Escape when editingField is set and on telemetry route clears it and focuses nav', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.TELEMETRY

    const btn = document.createElement('button')
    btn.id = 'some-btn'
    contentRoot.appendChild(btn)
    btn.focus()

    const focusSelectedNav = vi.fn(() => true)
    const onSetAppContext = vi.fn()
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: 'some-btn' },
      contentEl: { current: contentRoot },
      onSetAppContext
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav,
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('Escape'))
    expect(onSetAppContext).toHaveBeenCalled()
    expect(focusSelectedNav).toHaveBeenCalled()
  })

  test('handleSetFocusedElId with element having no id or aria-label sets focusedElId to null', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    const onSetAppContext = vi.fn()
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: 'previous-id' },
      contentEl: { current: contentRoot },
      onSetAppContext
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: () => true,
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('Enter'))
    expect(onSetAppContext).toHaveBeenCalledWith(
      expect.objectContaining({
        keyboardNavigation: { focusedElId: null }
      })
    )
  })

  test('transport keys: prev, playPause, play, pause, acceptPhone, rejectPhone, voiceAssistant', () => {
    setupRoots()
    mockPathname = ROUTES.MEDIA
    mockSettings = {
      bindings: {
        prev: 'MediaPrev',
        playPause: 'MediaPlayPause',
        play: 'MediaPlay',
        pause: 'MediaPause',
        acceptPhone: 'KeyA',
        rejectPhone: 'KeyR',
        voiceAssistant: 'KeyV'
      }
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={{ isTouchDevice: false }}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: () => false,
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    for (const [code, expected] of [
      ['MediaPrev', 'prev'],
      ['MediaPlayPause', 'playPause'],
      ['MediaPlay', 'play'],
      ['MediaPause', 'pause'],
      ['KeyA', 'acceptPhone'],
      ['KeyR', 'rejectPhone'],
      ['KeyV', 'voiceAssistant']
    ] as const) {
      mockSendInput.mockClear()
      result.current(makeEvent(code))
      expect(mockSendInput).toHaveBeenCalledWith(key(code))
      expect(mockBroadcastMediaKey).toHaveBeenCalledWith(expected)
    }
  })

  test('combobox with aria-expanded remaps rotary left/right to arrow up/down', () => {
    const { contentRoot } = setupRoots()
    const listbox = document.createElement('ul')
    listbox.setAttribute('role', 'listbox')
    contentRoot.appendChild(listbox)

    const combo = document.createElement('div')
    combo.setAttribute('role', 'combobox')
    combo.setAttribute('aria-expanded', 'true')
    combo.setAttribute('tabindex', '0')
    contentRoot.appendChild(combo)
    combo.focus()

    const dispatchSpy = vi.spyOn(listbox, 'dispatchEvent')

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('ArrowRight'))
    expect(dispatchSpy).toHaveBeenCalled()
  })

  test('nothing focused + arrow key on non-home route triggers focusFirstInMain', () => {
    setupRoots()
    mockPathname = ROUTES.MEDIA

    const focusFirstInMain = vi.fn(() => true)

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: () => false,
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain,
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('ArrowLeft')
    result.current(event)

    expect(focusFirstInMain).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('back key in non-settings route without editingField calls focusSelectedNav', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA

    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    const focusSelectedNav = vi.fn(() => true)

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav,
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('Escape')
    result.current(event)

    expect(focusSelectedNav).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('Enter on switch in main area calls activateControl', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const sw = document.createElement('button')
    sw.setAttribute('role', 'switch')
    contentRoot.appendChild(sw)
    sw.focus()

    const activateControl = vi.fn(() => true)
    const onSetAppContext = vi.fn()

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl
        }),
      { wrapper }
    )

    result.current(makeEvent('Enter'))
    expect(activateControl).toHaveBeenCalled()
  })

  test('Enter on dropdown in main area activates and tracks focusedElId', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const combo = document.createElement('div')
    combo.setAttribute('role', 'combobox')
    combo.setAttribute('aria-haspopup', 'listbox')
    combo.id = 'my-combo'
    combo.setAttribute('tabindex', '0')
    contentRoot.appendChild(combo)
    combo.focus()

    const activateControl = vi.fn(() => true)
    const onSetAppContext = vi.fn()

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl
        }),
      { wrapper }
    )

    result.current(makeEvent('Enter'))
    expect(activateControl).toHaveBeenCalled()
    expect(onSetAppContext).toHaveBeenCalledWith(
      expect.objectContaining({
        keyboardNavigation: expect.objectContaining({ focusedElId: 'my-combo' })
      })
    )
  })

  test('Enter on form field with editingField set clears the editing state', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'name-field'
    contentRoot.appendChild(input)
    input.focus()

    const onSetAppContext = vi.fn()
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: 'name-field' },
      contentEl: { current: contentRoot },
      onSetAppContext
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: () => true,
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('Enter'))
    expect(onSetAppContext).toHaveBeenCalledWith(
      expect.objectContaining({ keyboardNavigation: { focusedElId: null } })
    )
  })

  test('Enter on generic element in main calls activateControl fallback', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const div = document.createElement('div')
    div.setAttribute('tabindex', '0')
    contentRoot.appendChild(div)
    div.focus()

    const activateControl = vi.fn(() => true)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl
        }),
      { wrapper }
    )

    result.current(makeEvent('Enter'))
    expect(activateControl).toHaveBeenCalled()
  })

  test('Left on range slider in main returns early without moveFocusLinear', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const slider = document.createElement('input')
    slider.type = 'range'
    contentRoot.appendChild(slider)
    slider.focus()

    const moveFocusLinear = vi.fn(() => true)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear,
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('ArrowLeft')
    result.current(event)
    expect(moveFocusLinear).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('Up on range slider in main calls preventDefault without moveFocusLinear navigation', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const slider = document.createElement('input')
    slider.type = 'range'
    contentRoot.appendChild(slider)
    slider.focus()

    const moveFocusLinear = vi.fn(() => false)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear,
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('ArrowUp')
    result.current(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('Left in main with editingField on input returns early (skips moveFocusLinear)', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'edit-field'
    contentRoot.appendChild(input)
    input.focus()

    const moveFocusLinear = vi.fn(() => true)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: 'edit-field' },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear,
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('ArrowLeft'))
    expect(moveFocusLinear).not.toHaveBeenCalled()
  })

  test('Right in main with editingField on input returns early (skips moveFocusLinear)', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'edit-field-r'
    contentRoot.appendChild(input)
    input.focus()

    const moveFocusLinear = vi.fn(() => true)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: 'edit-field-r' },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear,
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    result.current(makeEvent('ArrowRight'))
    expect(moveFocusLinear).not.toHaveBeenCalled()
  })

  test('cycleSession key asks core for the next phone and swallows a rejection', async () => {
    const { contentRoot } = setupRoots()
    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    mockCoreAction.mockReturnValueOnce(Promise.reject(new Error('boom')))

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const heard = vi.fn()
    window.addEventListener(CYCLE_SESSION_EVENT, heard)
    const event = makeEvent('KeyS')
    result.current(event)
    window.removeEventListener(CYCLE_SESSION_EVENT, heard)

    expect(mockCoreAction).toHaveBeenCalledWith({ kind: 'nextDevice' })
    expect(heard).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()

    await Promise.resolve()
    await Promise.resolve()
  })

  test('voiceAssistant repeat in CarPlay mode is suppressed', () => {
    const { contentRoot } = setupRoots()
    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    mockPathname = ROUTES.HOME
    mockSettings = { bindings: { voiceAssistant: 'KeyV' } }
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: true,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('KeyV')
    ;(event as any).repeat = true
    result.current(event)

    expect(mockSendInput).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  test('Enter in nav with a different selectDown binding activates and clicks', () => {
    const { navRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA
    mockSettings = { bindings: { selectDown: 'KeyX' } }

    const navBtn = document.createElement('button')
    navRoot.appendChild(navBtn)
    navBtn.focus()

    const clickSpy = vi.spyOn(navBtn, 'click')
    const activateControl = vi.fn(() => false)

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      navEl: { current: navRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl
        }),
      { wrapper }
    )

    const event = makeEvent('Enter')
    result.current(event)

    expect(activateControl).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('Escape with editingField on a non-telemetry route clears editing state', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA

    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'field-a'
    contentRoot.appendChild(input)
    input.focus()

    const onSetAppContext = vi.fn()
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: 'field-a' },
      contentEl: { current: contentRoot },
      onSetAppContext
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('Escape')
    result.current(event)

    expect(onSetAppContext).toHaveBeenCalledWith(
      expect.objectContaining({ keyboardNavigation: { focusedElId: null } })
    )
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('Enter on a color input in main focuses and clicks it', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const color = document.createElement('input')
    color.type = 'color'
    contentRoot.appendChild(color)
    color.focus()

    const focusSpy = vi.spyOn(color, 'focus')
    const clickSpy = vi.spyOn(color, 'click')

    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('Enter')
    result.current(event)

    expect(focusSpy).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('Up in main with successful moveFocusLinear prevents default', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    const moveFocusLinear = vi.fn(() => true)
    const context: AppContextProps = {
      isTouchDevice: false,
      keyboardNavigation: { focusedElId: null },
      contentEl: { current: contentRoot },
      onSetAppContext: vi.fn()
    }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={context}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: (root, el) => !!root && !!el && root.contains(el),
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear,
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const event = makeEvent('ArrowUp')
    result.current(event)

    expect(moveFocusLinear).toHaveBeenCalledWith(-1)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
  })

  test('voiceAssistant repeat outside CarPlay is ignored and counter updater runs', () => {
    setupRoots()
    mockPathname = ROUTES.MEDIA
    mockSettings = { bindings: { voiceAssistant: 'KeyV', next: 'MediaNext' } }

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppContext.Provider value={{ isTouchDevice: false }}>{children}</AppContext.Provider>
    )

    const { result } = renderHook(
      () =>
        useKeyDown({
          receivingVideo: false,
          inContainer: () => false,
          focusSelectedNav: vi.fn(() => false),
          focusFirstInMain: vi.fn(() => false),
          moveFocusLinear: vi.fn(() => false),
          isFormField: vi.fn(() => false),
          activateControl: vi.fn(() => false)
        }),
      { wrapper }
    )

    const repeated = makeEvent('KeyV')
    ;(repeated as any).repeat = true
    result.current(repeated)
    expect(mockSendInput).not.toHaveBeenCalled()

    result.current(makeEvent('MediaNext'))
    expect(mockSendInput).toHaveBeenCalledTimes(1)
    expect(mockSendInput).toHaveBeenCalledWith(key('MediaNext'))
  })

  test('hash with leading slash resolves route directly', () => {
    setupRoots()
    mockHash = '#/telemetry'
    mockPathname = ''

    const focusSelectedNav = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), inContainer: () => false, focusSelectedNav },
      { isTouchDevice: false }
    )

    const event = makeEvent('ArrowUp')
    result.current(event)
    expect(focusSelectedNav).toHaveBeenCalled()
  })

  test('empty hash and empty pathname falls back to root route', () => {
    setupRoots()
    mockHash = ''
    mockPathname = ''

    const focusSelectedNav = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), inContainer: () => false, focusSelectedNav },
      { isTouchDevice: false }
    )

    result.current(makeEvent('KeyZ'))
    expect(focusSelectedNav).not.toHaveBeenCalled()
  })

  test('dropdown activation on already-focused element clears focusedElId', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const combo = document.createElement('div')
    combo.setAttribute('role', 'combobox')
    combo.setAttribute('aria-haspopup', 'listbox')
    combo.id = 'combo-x'
    combo.setAttribute('tabindex', '0')
    contentRoot.appendChild(combo)
    combo.focus()

    const onSetAppContext = vi.fn()
    const { result } = renderKeyDown(
      { ...baseProps(), activateControl: vi.fn(() => true) },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: 'combo-x' },
        contentEl: { current: contentRoot },
        onSetAppContext
      }
    )

    result.current(makeEvent('Enter'))
    expect(onSetAppContext).toHaveBeenCalledWith(
      expect.objectContaining({ keyboardNavigation: { focusedElId: null } })
    )
  })

  test('MuiDialog-container counts as main for both the container and its children', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)

    const container = document.createElement('div')
    container.className = 'MuiDialog-container'
    container.setAttribute('tabindex', '0')
    const child = document.createElement('button')
    container.appendChild(child)
    document.body.appendChild(container)

    const activateControl = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), activateControl },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    container.focus()
    result.current(makeEvent('Enter'))
    expect(activateControl).toHaveBeenCalledWith(container)

    child.focus()
    result.current(makeEvent('Enter'))
    expect(activateControl).toHaveBeenCalledWith(child)

    document.body.removeChild(dialog)
    document.body.removeChild(container)
  })

  test('telemetry pager ignores edges when it cannot page and passes other keys through', () => {
    setupRoots()
    mockPathname = ROUTES.TELEMETRY

    const pager = {
      prev: vi.fn(),
      next: vi.fn(),
      canPrev: vi.fn(() => false),
      canNext: vi.fn(() => false)
    }

    const focusSelectedNav = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), inContainer: () => false, focusSelectedNav },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        telemetryPager: pager,
        onSetAppContext: vi.fn()
      }
    )

    const left = makeEvent('ArrowLeft')
    result.current(left)
    expect(pager.prev).not.toHaveBeenCalled()
    expect(left.preventDefault).toHaveBeenCalled()

    const right = makeEvent('ArrowRight')
    result.current(right)
    expect(pager.next).not.toHaveBeenCalled()
    expect(right.preventDefault).toHaveBeenCalled()

    result.current(makeEvent('ArrowUp'))
    expect(focusSelectedNav).toHaveBeenCalled()
  })

  test('a mapped key in CarPlay mode goes to core, not to the menus', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.HOME
    mockSettings = { bindings: { next: 'MediaNext' } }
    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    const { result } = renderKeyDown(
      { ...baseProps(), receivingVideo: true },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    const event = makeEvent('MediaNext')
    result.current(event)
    expect(mockSendInput).toHaveBeenCalledWith(key('MediaNext'))
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('nav selectDown on home route activates without re-focusing main', () => {
    const { navRoot } = setupRoots()
    mockPathname = ROUTES.HOME
    mockSettings = { bindings: { selectDown: 'KeyX' } }

    const navBtn = document.createElement('button')
    navRoot.appendChild(navBtn)
    navBtn.focus()

    const clickSpy = vi.spyOn(navBtn, 'click')
    const focusFirstInMain = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), activateControl: vi.fn(() => true), focusFirstInMain },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        navEl: { current: navRoot },
        onSetAppContext: vi.fn()
      }
    )

    const event = makeEvent('KeyX')
    result.current(event)
    expect(clickSpy).not.toHaveBeenCalled()
    expect(focusFirstInMain).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  test('unhandled key while in nav falls through without acting', () => {
    const { navRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA

    const navBtn = document.createElement('button')
    navRoot.appendChild(navBtn)
    navBtn.focus()

    const focusFirstInMain = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), focusFirstInMain },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        navEl: { current: navRoot },
        onSetAppContext: vi.fn()
      }
    )

    const event = makeEvent('KeyZ')
    result.current(event)
    expect(focusFirstInMain).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('nav Enter with successful activateControl does not fall back to click', () => {
    const { navRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA
    mockSettings = { bindings: { selectDown: 'KeyX' } }

    const navBtn = document.createElement('button')
    navRoot.appendChild(navBtn)
    navBtn.focus()

    const clickSpy = vi.spyOn(navBtn, 'click')
    const { result } = renderKeyDown(
      { ...baseProps(), activateControl: vi.fn(() => true) },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        navEl: { current: navRoot },
        onSetAppContext: vi.fn()
      }
    )

    result.current(makeEvent('Enter'))
    expect(clickSpy).not.toHaveBeenCalled()
  })

  test('editing guard evaluates every editable-element condition for a plain element', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const div = document.createElement('div')
    div.setAttribute('tabindex', '0')
    div.setAttribute('contenteditable', 'false')
    div.id = 'plain-div'
    contentRoot.appendChild(div)
    div.focus()

    const moveFocusLinear = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), moveFocusLinear },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: 'plain-div' },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    result.current(makeEvent('ArrowLeft'))
    expect(moveFocusLinear).toHaveBeenCalledWith(-1)
  })

  test('back key with editing range input skips clearing and focuses nav', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.id = 'r-field'
    contentRoot.appendChild(slider)
    slider.focus()

    const focusSelectedNav = vi.fn(() => true)
    const onSetAppContext = vi.fn()
    const { result } = renderKeyDown(
      { ...baseProps(), focusSelectedNav },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: 'r-field' },
        contentEl: { current: contentRoot },
        onSetAppContext
      }
    )

    result.current(makeEvent('Escape'))
    expect(onSetAppContext).not.toHaveBeenCalled()
    expect(focusSelectedNav).toHaveBeenCalled()
  })

  test('telemetry back key clears editing but does not prevent default when nav focus fails', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.TELEMETRY

    const btn = document.createElement('button')
    btn.id = 't-field'
    contentRoot.appendChild(btn)
    btn.focus()

    const focusSelectedNav = vi.fn(() => false)
    const onSetAppContext = vi.fn()
    const { result } = renderKeyDown(
      { ...baseProps(), focusSelectedNav },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: 't-field' },
        contentEl: { current: contentRoot },
        onSetAppContext
      }
    )

    const event = makeEvent('Escape')
    result.current(event)
    expect(onSetAppContext).toHaveBeenCalled()
    expect(focusSelectedNav).toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('back key fallback does not prevent default when nav focus fails', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.MEDIA

    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    const focusSelectedNav = vi.fn(() => false)
    const { result } = renderKeyDown(
      { ...baseProps(), focusSelectedNav },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    const event = makeEvent('Escape')
    result.current(event)
    expect(focusSelectedNav).toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('Enter on a slider styled as a button skips activation in the control branch', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.setAttribute('role', 'button')
    contentRoot.appendChild(slider)
    slider.focus()

    const activateControl = vi.fn(() => true)
    const { result } = renderKeyDown(
      { ...baseProps(), activateControl },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    const event = makeEvent('Enter')
    result.current(event)
    expect(activateControl).toHaveBeenCalledWith(slider)
  })

  test('Enter on a switch with failing activateControl falls through', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const sw = document.createElement('button')
    sw.setAttribute('role', 'switch')
    contentRoot.appendChild(sw)
    sw.focus()

    const activateControl = vi.fn(() => false)
    const event = makeEvent('Enter')
    const { result } = renderKeyDown(
      { ...baseProps(), activateControl },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    result.current(event)
    expect(activateControl).toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('Enter on a focused text form field enters editing mode', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'text-field'
    contentRoot.appendChild(input)
    input.focus()

    const onSetAppContext = vi.fn()
    const { result } = renderKeyDown(
      { ...baseProps(), isFormField: () => true },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext
      }
    )

    result.current(makeEvent('Enter'))
    expect(onSetAppContext).toHaveBeenCalledWith(
      expect.objectContaining({
        keyboardNavigation: expect.objectContaining({ focusedElId: 'text-field' })
      })
    )
  })

  test('Up in main returns without preventing default when moveFocusLinear fails', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    const moveFocusLinear = vi.fn(() => false)
    const event = makeEvent('ArrowUp')
    const { result } = renderKeyDown(
      { ...baseProps(), moveFocusLinear },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    result.current(event)
    expect(moveFocusLinear).toHaveBeenCalledWith(-1)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  test('Down in main returns without preventing default when moveFocusLinear fails', () => {
    const { contentRoot } = setupRoots()
    mockPathname = ROUTES.SETTINGS

    const btn = document.createElement('button')
    contentRoot.appendChild(btn)
    btn.focus()

    const moveFocusLinear = vi.fn(() => false)
    const event = makeEvent('ArrowDown')
    const { result } = renderKeyDown(
      { ...baseProps(), moveFocusLinear },
      {
        isTouchDevice: false,
        keyboardNavigation: { focusedElId: null },
        contentEl: { current: contentRoot },
        onSetAppContext: vi.fn()
      }
    )

    result.current(event)
    expect(moveFocusLinear).toHaveBeenCalledWith(1)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
