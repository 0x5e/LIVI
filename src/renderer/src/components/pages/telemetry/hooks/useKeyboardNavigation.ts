import { usePaginationDots } from '@renderer/components/pages/telemetry/hooks/usePaginationDots'
import type * as React from 'react'
import { useCallback, useRef } from 'react'

type UseKeyboardNavigationProps = {
  count: number
  isNavbarHidden: boolean
  onStep: (by: -1 | 1) => void
}

/** Keys and swipes step through the dashboard's layouts, core wraps around at the ends. */
export const useKeyboardNavigation = ({
  count,
  isNavbarHidden,
  onStep
}: UseKeyboardNavigationProps) => {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const { revealDots } = usePaginationDots(isNavbarHidden)

  const step = useCallback(
    (by: -1 | 1) => {
      if (count <= 1) return
      onStep(by)
      revealDots()
    },
    [count, onStep, revealDots]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary) return
      const start = startRef.current
      startRef.current = null
      if (!start) return

      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      const dt = performance.now() - start.t

      const absX = Math.abs(dx)
      const absY = Math.abs(dy)

      if (absX < 40) return
      if (absY > absX * 0.8) return
      if (dt > 900) return

      step(dx < 0 ? 1 : -1)
    },
    [step]
  )

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return
    startRef.current = { x: e.clientX, y: e.clientY, t: performance.now() }
  }, [])

  const prev = useCallback(() => step(-1), [step])
  const next = useCallback(() => step(1), [step])
  const canStep = useCallback(() => count > 1, [count])

  return {
    prev,
    next,
    canPrev: canStep,
    canNext: canStep,
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp
  }
}
