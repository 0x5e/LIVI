import { type MouseEvent, type PointerEvent, useRef } from 'react'

const DRAG_PX = 6

/** Drag a row sideways with a mouse or a touch screen that reports as one. A drag swallows the click it ends with. */
export function useDragScroll<T extends HTMLElement>() {
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const swallow = useRef(false)

  return {
    onPointerDown: (e: PointerEvent<T>) => {
      if (e.pointerType === 'touch') return
      drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false }
      swallow.current = false
    },
    onPointerMove: (e: PointerEvent<T>) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x
      if (!d.moved && Math.abs(dx) < DRAG_PX) return
      d.moved = true
      e.currentTarget.scrollLeft = d.left - dx
    },
    onPointerUp: () => {
      swallow.current = drag.current?.moved === true
      drag.current = null
    },
    onPointerLeave: () => {
      drag.current = null
    },
    onClickCapture: (e: MouseEvent<T>) => {
      if (!swallow.current) return
      swallow.current = false
      e.stopPropagation()
      e.preventDefault()
    }
  }
}
