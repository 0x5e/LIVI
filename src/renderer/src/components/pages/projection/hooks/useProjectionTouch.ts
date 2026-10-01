import { MultiTouchAction, TouchAction } from '@shared/types/ProjectionEnums'
import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react'

type Handlers = {
  onPointerDown: React.PointerEventHandler<HTMLDivElement>
  onPointerMove: React.PointerEventHandler<HTMLDivElement>
  onPointerUp: React.PointerEventHandler<HTMLDivElement>
  onPointerCancel: React.PointerEventHandler<HTMLDivElement>
  onPointerOut: React.PointerEventHandler<HTMLDivElement>
  onLostPointerCapture: React.PointerEventHandler<HTMLDivElement>
  onContextMenu: React.MouseEventHandler<HTMLDivElement>
}

type MTPoint = { id: number; x: number; y: number; action: MultiTouchAction }

type TouchTransform = {
  streamWidth: number
  streamHeight: number
  cropLeft: number
  cropTop: number
  visibleWidth: number
  visibleHeight: number
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

const norm = (
  eventTarget: HTMLElement,
  videoRef: RefObject<HTMLElement | null>,
  cx: number,
  cy: number,
  transform?: TouchTransform
) => {
  const target = videoRef.current ?? eventTarget
  const r = target.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return null

  // No usable transform yet: map straight to the container.
  if (
    !transform ||
    transform.visibleWidth <= 0 ||
    transform.visibleHeight <= 0 ||
    transform.streamWidth <= 0 ||
    transform.streamHeight <= 0
  ) {
    const lx = cx - r.left
    const ly = cy - r.top
    if (lx < 0 || lx > r.width || ly < 0 || ly > r.height) return null
    return { x: clamp01(lx / r.width), y: clamp01(ly / r.height) }
  }

  // display-letterbox by the content AR
  const contentAR = transform.visibleWidth / transform.visibleHeight
  let dispW = r.width
  let dispH = r.height
  let offX = 0
  let offY = 0
  if (r.width / r.height > contentAR) {
    dispW = r.height * contentAR
    offX = (r.width - dispW) / 2
  } else {
    dispH = r.width / contentAR
    offY = (r.height - dispH) / 2
  }

  const lx = cx - r.left - offX
  const ly = cy - r.top - offY
  if (lx < 0 || lx > dispW || ly < 0 || ly > dispH) return null

  // content-crop onto the transport tier
  const streamX = transform.cropLeft + (lx / dispW) * transform.visibleWidth
  const streamY = transform.cropTop + (ly / dispH) * transform.visibleHeight
  return {
    x: clamp01(streamX / transform.streamWidth),
    y: clamp01(streamY / transform.streamHeight)
  }
}

export const useProjectionMultiTouch = (
  videoRef: RefObject<HTMLElement | null>,
  transform?: TouchTransform
): Handlers => {
  const slotByPointerId = useRef(new Map<number, number>())
  const active = useRef(new Map<number, { x: number; y: number }>())
  const freeSlots = useRef<number[]>([])
  const nextSlot = useRef(0)
  const mouseDown = useRef(false)
  const rafId = useRef<number | null>(null)
  const lastMouse = useRef<{ x: number; y: number } | null>(null)

  const alloc = useCallback((pid: number) => {
    const old = slotByPointerId.current.get(pid)
    if (old !== undefined) return old
    const reuse = freeSlots.current.pop()
    const slot = reuse ?? nextSlot.current++
    slotByPointerId.current.set(pid, slot)
    return slot
  }, [])

  const free = useCallback((pid: number) => {
    const slot = slotByPointerId.current.get(pid) as number
    slotByPointerId.current.delete(pid)
    active.current.delete(slot)
    freeSlots.current.push(slot)
  }, [])

  const sendFullFrame = useCallback((overrides?: Map<number, MultiTouchAction>) => {
    const pts: MTPoint[] = []
    active.current.forEach((pos, id) => {
      const action = overrides?.get(id) ?? MultiTouchAction.Move
      pts.push({ id, x: pos.x, y: pos.y, action })
    })
    window.projection.ipc.sendMultiTouch(pts)
  }, [])

  const cancelFlush = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
  }, [])

  // Coalesce moves to one send per animation frame so the touch report rate matches the
  // display refresh rate, as the phone expects. Down/up/cancel stay immediate.
  const scheduleMove = useCallback(() => {
    if (rafId.current !== null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      if (mouseDown.current && lastMouse.current) {
        window.projection.ipc.sendTouch(lastMouse.current.x, lastMouse.current.y, TouchAction.Move)
      } else {
        sendFullFrame()
      }
    })
  }, [sendFullFrame])

  useEffect(() => cancelFlush, [cancelFlush])

  /** Lifts the mouse's finger where it last was on the picture, so the phone never keeps it. */
  const releaseMouse = useCallback((at: { x: number; y: number } | null) => {
    mouseDown.current = false
    const { x, y } = at ?? (lastMouse.current as { x: number; y: number })
    window.projection.ipc.sendTouch(x, y, TouchAction.Up)
  }, [])

  const onPointerDown = useCallback<Handlers['onPointerDown']>(
    (e) => {
      const el = e.currentTarget as HTMLElement
      const p = norm(el, videoRef, e.clientX, e.clientY, transform)
      if (!p) return
      const { x, y } = p
      cancelFlush()
      // Keeps the release coming to us when it happens off the picture or off the window
      el.setPointerCapture?.(e.pointerId)

      if (e.pointerType === 'mouse') {
        mouseDown.current = true
        lastMouse.current = { x, y }
        window.projection.ipc.sendTouch(x, y, TouchAction.Down)
        return
      }

      const id = alloc(e.pointerId)
      active.current.set(id, { x, y })
      const overrides = new Map<number, MultiTouchAction>()
      overrides.set(id, MultiTouchAction.Down)
      sendFullFrame(overrides)
    },
    [alloc, cancelFlush, sendFullFrame, videoRef, transform]
  )

  const onPointerMove = useCallback<Handlers['onPointerMove']>(
    (e) => {
      // The button came up where no pointerup reached us, such as outside the window.
      if (e.pointerType === 'mouse' && mouseDown.current && (e.buttons & 1) === 0) {
        cancelFlush()
        releaseMouse(null)
        return
      }
      const el = e.currentTarget as HTMLElement
      const p = norm(el, videoRef, e.clientX, e.clientY, transform)
      if (!p) return
      const { x, y } = p

      if (e.pointerType === 'mouse') {
        if (!mouseDown.current) return
        lastMouse.current = { x, y }
        scheduleMove()
        return
      }

      const id = slotByPointerId.current.get(e.pointerId)
      if (id === undefined) return
      active.current.set(id, { x, y })
      scheduleMove()
    },
    [cancelFlush, releaseMouse, scheduleMove, videoRef, transform]
  )

  const finishPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget as HTMLElement
      const p = norm(el, videoRef, e.clientX, e.clientY, transform)
      cancelFlush()

      if (e.pointerType === 'mouse') {
        if (!mouseDown.current) return
        el.releasePointerCapture?.(e.pointerId)
        releaseMouse(p)
        return
      }

      const id = slotByPointerId.current.get(e.pointerId)
      if (id === undefined) return

      const last = active.current.get(id) as { x: number; y: number }
      const x = p?.x ?? last.x
      const y = p?.y ?? last.y

      active.current.set(id, { x, y })
      const overrides = new Map<number, MultiTouchAction>()
      overrides.set(id, MultiTouchAction.Up)
      sendFullFrame(overrides)

      el.releasePointerCapture?.(e.pointerId)
      free(e.pointerId)
    },
    [cancelFlush, free, releaseMouse, sendFullFrame, videoRef, transform]
  )

  const onPointerUp = useCallback<Handlers['onPointerUp']>((e) => finishPointer(e), [finishPointer])
  const onPointerCancel = useCallback<Handlers['onPointerCancel']>(
    (e) => finishPointer(e),
    [finishPointer]
  )
  const onLostPointerCapture = useCallback<Handlers['onLostPointerCapture']>(
    (e) => finishPointer(e),
    [finishPointer]
  )

  const onPointerOut = useCallback<Handlers['onPointerOut']>(() => {}, [])
  const onContextMenu = useCallback<Handlers['onContextMenu']>((e) => e.preventDefault(), [])

  return useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerOut,
      onLostPointerCapture,
      onContextMenu
    }),
    [
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerOut,
      onLostPointerCapture,
      onContextMenu
    ]
  )
}
