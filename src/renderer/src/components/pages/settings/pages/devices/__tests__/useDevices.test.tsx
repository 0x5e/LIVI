import type { DeviceView } from '@shared/types'
import { act, renderHook } from '@testing-library/react'
import { forgetDevice, selectDevice, useDevices } from '../useDevices'

const coreActionMock = vi.fn((_action: unknown) => Promise.resolve())

vi.mock('@store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@store/store')>()),
  coreAction: (action: unknown) => coreActionMock(action)
}))

import { useLiviStore } from '@store/store'

const dev = (id: string): DeviceView => ({ id, name: id, status: 'offline' })

afterEach(() => {
  useLiviStore.setState({ devices: [] })
  coreActionMock.mockClear()
})

describe('useDevices', () => {
  test('follows the list core publishes', () => {
    const { result } = renderHook(() => useDevices())
    expect(result.current).toEqual([])

    act(() => useLiviStore.setState({ devices: [dev('a'), dev('b')] }))
    expect(result.current.map((d) => d.id)).toEqual(['a', 'b'])
  })

  test('selectDevice asks core and says whether it took it', async () => {
    await expect(selectDevice('a')).resolves.toEqual({ ok: true })
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'selectDevice', id: 'a' })

    coreActionMock.mockReturnValueOnce(Promise.reject(new Error('not connected')))
    await expect(selectDevice('a')).resolves.toEqual({ ok: false })
  })

  test('forgetDevice asks core and swallows a refusal', async () => {
    forgetDevice('a')
    expect(coreActionMock).toHaveBeenCalledWith({ kind: 'forgetDevice', id: 'a' })

    coreActionMock.mockReturnValueOnce(Promise.reject(new Error('not connected')))
    expect(() => forgetDevice('b')).not.toThrow()
    await Promise.resolve()
  })
})
