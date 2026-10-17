import { act, renderHook } from '@testing-library/react'
import type * as React from 'react'
import { useKeyboardNavigation } from '../useKeyboardNavigation'

const revealDotsMock = vi.fn()

vi.mock('@renderer/components/pages/telemetry/hooks/usePaginationDots', () => ({
  usePaginationDots: () => ({
    revealDots: revealDotsMock
  })
}))

const pointer = (clientX: number, clientY = 0, isPrimary = true) =>
  ({ isPrimary, clientX, clientY }) as React.PointerEvent

const setup = (count: number) => {
  const onStep = vi.fn()
  const { result } = renderHook(() =>
    useKeyboardNavigation({ count, isNavbarHidden: true, onStep })
  )
  return { onStep, result }
}

describe('useKeyboardNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('prev and next step through the layouts and show the dots', () => {
    const { onStep, result } = setup(3)
    expect(result.current.canPrev()).toBe(true)
    expect(result.current.canNext()).toBe(true)

    act(() => result.current.prev())
    act(() => result.current.next())
    expect(onStep.mock.calls).toEqual([[-1], [1]])
    expect(revealDotsMock).toHaveBeenCalledTimes(2)
  })

  test('one layout does not step', () => {
    const { onStep, result } = setup(1)
    expect(result.current.canPrev()).toBe(false)
    expect(result.current.canNext()).toBe(false)
    act(() => result.current.next())
    expect(onStep).not.toHaveBeenCalled()
    expect(revealDotsMock).not.toHaveBeenCalled()
  })

  test('a quick horizontal swipe steps, left forward and right back', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { onStep, result } = setup(3)

    act(() => result.current.onPointerDown(pointer(200)))
    act(() => result.current.onPointerUp(pointer(120)))
    act(() => result.current.onPointerDown(pointer(100)))
    act(() => result.current.onPointerUp(pointer(180)))
    expect(onStep.mock.calls).toEqual([[1], [-1]])
    now.mockRestore()
  })

  test('short, vertical, slow and non-primary gestures do not step', () => {
    let t = 1000
    const now = vi.spyOn(performance, 'now').mockImplementation(() => t)
    const { onStep, result } = setup(3)

    act(() => result.current.onPointerUp(pointer(0)))
    act(() => result.current.onPointerDown(pointer(100, 0, false)))
    act(() => result.current.onPointerUp(pointer(0)))
    act(() => result.current.onPointerDown(pointer(100)))
    act(() => result.current.onPointerUp(pointer(0, 0, false)))
    act(() => result.current.onPointerUp(pointer(70)))
    act(() => result.current.onPointerDown(pointer(200)))
    act(() => result.current.onPointerUp(pointer(140, 100)))
    act(() => result.current.onPointerDown(pointer(200)))
    t = 2000
    act(() => result.current.onPointerUp(pointer(100)))
    expect(onStep).not.toHaveBeenCalled()
    now.mockRestore()
  })
})
