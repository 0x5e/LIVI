import { useLiviStore } from '@store/store'
import { act, renderHook } from '@testing-library/react'
import { useVehicleTelemetry } from '../useVehicleTelemetry'

describe('useVehicleTelemetry', () => {
  afterEach(() => {
    useLiviStore.setState({ telemetry: null })
  })

  test('shows what core holds and follows its changes', () => {
    useLiviStore.setState({ telemetry: { speedKph: 50, ts: Date.now() } })
    const { result } = renderHook(() => useVehicleTelemetry())
    expect(result.current.telemetry?.speedKph).toBe(50)
    expect(result.current.isStale).toBe(false)

    act(() => {
      useLiviStore.setState({ telemetry: { speedKph: 60, ts: Date.now() } })
    })
    expect(result.current.telemetry?.speedKph).toBe(60)
  })

  test('old data and data without a timestamp are stale', () => {
    useLiviStore.setState({ telemetry: { speedKph: 50, ts: Date.now() - 2000 } })
    const { result, rerender } = renderHook(() => useVehicleTelemetry())
    expect(result.current.isStale).toBe(true)

    act(() => {
      useLiviStore.setState({ telemetry: { speedKph: 50 } })
    })
    rerender()
    expect(result.current.isStale).toBe(true)

    act(() => {
      useLiviStore.setState({ telemetry: null })
    })
    expect(result.current.telemetry).toBeNull()
    expect(result.current.isStale).toBe(true)
  })
})
