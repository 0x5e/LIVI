import { MultiTouchAction, TouchAction } from '@shared/types/ProjectionEnums'
import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { useProjectionMultiTouch } from '../useProjectionTouch'

describe('useProjectionMultiTouch', () => {
  const sendTouch = vi.fn()
  const sendMultiTouch = vi.fn()

  let rafCb: FrameRequestCallback | null = null
  const flushRaf = () => {
    const cb = rafCb
    rafCb = null
    cb?.(0)
  }

  const createTarget = () => {
    const el = document.createElement('div')
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
    })
    return el
  }

  const createTargetWith = (rect: { left: number; top: number; width: number; height: number }) => {
    const el = document.createElement('div')
    el.setPointerCapture = vi.fn()
    el.releasePointerCapture = vi.fn()
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({})
      })
    })
    return el
  }

  const ptrEvent = (target: HTMLElement, options: Partial<any>) =>
    ({
      currentTarget: target,
      pointerId: 1,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
      ...options
    }) as React.PointerEvent<HTMLDivElement>

  beforeEach(() => {
    vi.clearAllMocks()
    rafCb = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCb = cb
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      rafCb = null
    })
    ;(window as any).projection = {
      ipc: {
        sendTouch,
        sendMultiTouch
      }
    }
  })

  test('handles mouse touch sequence', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerType: 'mouse' }))
    expect(sendTouch).toHaveBeenCalledWith(0.5, 0.5, TouchAction.Down)
    expect(target.setPointerCapture).toHaveBeenCalledWith(1)

    result.current.onPointerMove(
      ptrEvent(target, { pointerType: 'mouse', clientX: 60, buttons: 1 })
    )
    flushRaf()
    expect(sendTouch).toHaveBeenCalledWith(0.6, 0.5, TouchAction.Move)

    result.current.onPointerUp(ptrEvent(target, { pointerType: 'mouse', clientX: 70 }))
    expect(sendTouch).toHaveBeenCalledWith(0.7, 0.5, TouchAction.Up)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  test('a mouse button released outside the window lifts the finger on the next move', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerType: 'mouse' }))
    result.current.onPointerMove(
      ptrEvent(target, { pointerType: 'mouse', clientX: 60, buttons: 1 })
    )
    result.current.onPointerMove(
      ptrEvent(target, { pointerType: 'mouse', clientX: 80, buttons: 0 })
    )
    flushRaf()

    expect(sendTouch).toHaveBeenLastCalledWith(0.6, 0.5, TouchAction.Up)
    sendTouch.mockClear()
    result.current.onPointerMove(
      ptrEvent(target, { pointerType: 'mouse', clientX: 90, buttons: 0 })
    )
    flushRaf()
    expect(sendTouch).not.toHaveBeenCalled()
  })

  test('ignores mouse move/up when no active mouse down', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerMove(ptrEvent(target, { pointerType: 'mouse' }))
    result.current.onPointerUp(ptrEvent(target, { pointerType: 'mouse' }))

    expect(sendTouch).not.toHaveBeenCalled()
  })

  test('ignores events outside bounds', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { clientX: 200, clientY: 200 }))
    result.current.onPointerMove(ptrEvent(target, { clientX: 200, clientY: 200 }))

    expect(sendTouch).not.toHaveBeenCalled()
    expect(sendMultiTouch).not.toHaveBeenCalled()
  })

  test('handles touch down/move/up with slot allocation and release', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerType: 'touch', pointerId: 11 }))
    expect(target.setPointerCapture).toHaveBeenCalledWith(11)
    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ id: 0, action: MultiTouchAction.Down, x: 0.5, y: 0.5 })
    ])

    result.current.onPointerMove(
      ptrEvent(target, { pointerType: 'touch', pointerId: 11, clientX: 60 })
    )
    flushRaf()
    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ id: 0, action: MultiTouchAction.Move, x: 0.6, y: 0.5 })
    ])

    result.current.onPointerUp(
      ptrEvent(target, { pointerType: 'touch', pointerId: 11, clientX: 80 })
    )
    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ id: 0, action: MultiTouchAction.Up, x: 0.8, y: 0.5 })
    ])
    expect(target.releasePointerCapture).toHaveBeenCalledWith(11)
  })

  test('supports cancel/lost-capture and slot reuse', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1 }))
    result.current.onPointerCancel(ptrEvent(target, { pointerId: 1, clientX: 55 }))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 2 }))
    result.current.onLostPointerCapture(ptrEvent(target, { pointerId: 2, clientX: 65 }))

    const ids = sendMultiTouch.mock.calls
      .flatMap((c) => c[0] as Array<{ id: number; action: MultiTouchAction }>)
      .filter((x) => x.action === MultiTouchAction.Down)
      .map((x) => x.id)

    expect(ids).toContain(0)
  })

  test('uses last known touch point when finish event is out of bounds', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 12, clientX: 40, clientY: 40 }))
    result.current.onPointerOut(ptrEvent(target, { pointerId: 12 }))
    result.current.onPointerUp(ptrEvent(target, { pointerId: 12, clientX: 120, clientY: 120 }))

    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ action: MultiTouchAction.Up, x: 0.4, y: 0.4 })
    ])
  })

  test('prevents context menu', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))
    const preventDefault = vi.fn()

    result.current.onContextMenu({ preventDefault } as unknown as React.MouseEvent<HTMLDivElement>)
    expect(preventDefault).toHaveBeenCalled()
  })

  test('maps touch through a portrait letterbox transform', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const transform = {
      streamWidth: 200,
      streamHeight: 400,
      cropLeft: 0,
      cropTop: 0,
      visibleWidth: 100,
      visibleHeight: 200
    }

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef, transform))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1 }))

    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ action: MultiTouchAction.Down, x: 0.25, y: 0.25 })
    ])
  })

  test('maps touch through a landscape letterbox transform', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const transform = {
      streamWidth: 400,
      streamHeight: 200,
      cropLeft: 0,
      cropTop: 0,
      visibleWidth: 200,
      visibleHeight: 100
    }

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef, transform))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1 }))

    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ action: MultiTouchAction.Down, x: 0.25, y: 0.25 })
    ])
  })

  test('clamps transformed coordinates above one', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const transform = {
      streamWidth: 100,
      streamHeight: 100,
      cropLeft: 90,
      cropTop: 0,
      visibleWidth: 100,
      visibleHeight: 100
    }

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef, transform))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1 }))

    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ action: MultiTouchAction.Down, x: 1, y: 0.5 })
    ])
  })

  test('clamps transformed coordinates below zero', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const transform = {
      streamWidth: 100,
      streamHeight: 100,
      cropLeft: -50,
      cropTop: 0,
      visibleWidth: 100,
      visibleHeight: 100
    }

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef, transform))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1, clientX: 0 }))

    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ action: MultiTouchAction.Down, x: 0, y: 0.5 })
    ])
  })

  test('falls back to container mapping when transform is unusable', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const transform = {
      streamWidth: 0,
      streamHeight: 100,
      cropLeft: 0,
      cropTop: 0,
      visibleWidth: 100,
      visibleHeight: 100
    }

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef, transform))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1 }))

    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ action: MultiTouchAction.Down, x: 0.5, y: 0.5 })
    ])
  })

  test('ignores transformed points outside the display area', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const transform = {
      streamWidth: 200,
      streamHeight: 400,
      cropLeft: 0,
      cropTop: 0,
      visibleWidth: 100,
      visibleHeight: 200
    }

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef, transform))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1, clientX: 5 }))

    expect(sendMultiTouch).not.toHaveBeenCalled()
  })

  test('ignores events when the target rect has zero size', () => {
    const target = createTargetWith({ left: 0, top: 0, width: 0, height: 0 })
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 1 }))

    expect(sendMultiTouch).not.toHaveBeenCalled()
    expect(sendTouch).not.toHaveBeenCalled()
  })

  test('falls back to the event target when videoRef is empty', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerType: 'mouse' }))

    expect(sendTouch).toHaveBeenCalledWith(0.5, 0.5, TouchAction.Down)
  })

  test('ignores touch move for an unknown pointer', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerMove(ptrEvent(target, { pointerId: 99 }))

    expect(sendMultiTouch).not.toHaveBeenCalled()
  })

  test('ignores finish for an unknown touch pointer', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerUp(ptrEvent(target, { pointerId: 99 }))

    expect(sendMultiTouch).not.toHaveBeenCalled()
    expect(target.releasePointerCapture).not.toHaveBeenCalled()
  })

  test('a mouse released off the picture lifts the finger where it last was', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerType: 'mouse' }))
    result.current.onPointerUp(
      ptrEvent(target, { pointerType: 'mouse', clientX: 200, clientY: 200 })
    )

    expect(sendTouch).toHaveBeenCalledTimes(2)
    expect(sendTouch).toHaveBeenLastCalledWith(0.5, 0.5, TouchAction.Up)

    result.current.onPointerMove(
      ptrEvent(target, { pointerType: 'mouse', clientX: 60, buttons: 1 })
    )
    flushRaf()
    expect(sendTouch).toHaveBeenCalledTimes(2)
  })

  test('reuses the existing slot for a repeated pointerdown of the same pointer', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 7 }))
    result.current.onPointerDown(ptrEvent(target, { pointerId: 7, clientX: 60 }))

    expect(sendMultiTouch).toHaveBeenCalledTimes(2)
    const downIds = sendMultiTouch.mock.calls
      .flatMap((c) => c[0] as Array<{ id: number; action: MultiTouchAction }>)
      .filter((x) => x.action === MultiTouchAction.Down)
      .map((x) => x.id)
    expect(downIds).toEqual([0, 0])
  })

  test('coalesces successive moves into a single frame', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 3 }))
    result.current.onPointerMove(ptrEvent(target, { pointerId: 3, clientX: 60 }))
    result.current.onPointerMove(ptrEvent(target, { pointerId: 3, clientX: 70 }))
    flushRaf()

    const moveCalls = sendMultiTouch.mock.calls
      .flatMap((c) => c[0] as Array<{ action: MultiTouchAction }>)
      .filter((x) => x.action === MultiTouchAction.Move)
    expect(moveCalls).toHaveLength(1)
  })

  test('cancels a scheduled move when a finish arrives before flush', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 4 }))
    result.current.onPointerMove(ptrEvent(target, { pointerId: 4, clientX: 60 }))
    result.current.onPointerUp(ptrEvent(target, { pointerId: 4, clientX: 80 }))
    flushRaf()

    const moveCalls = sendMultiTouch.mock.calls
      .flatMap((c) => c[0] as Array<{ action: MultiTouchAction }>)
      .filter((x) => x.action === MultiTouchAction.Move)
    expect(moveCalls).toHaveLength(0)
    expect(sendMultiTouch).toHaveBeenCalledWith([
      expect.objectContaining({ action: MultiTouchAction.Up, x: 0.8, y: 0.5 })
    ])
  })

  test('cancels a pending frame on unmount', () => {
    const target = createTarget()
    const videoRef = createRef<HTMLElement>()
    videoRef.current = target

    const { result, unmount } = renderHook(() => useProjectionMultiTouch(videoRef))

    result.current.onPointerDown(ptrEvent(target, { pointerId: 5 }))
    result.current.onPointerMove(ptrEvent(target, { pointerId: 5, clientX: 60 }))

    expect(() => unmount()).not.toThrow()
  })
})
