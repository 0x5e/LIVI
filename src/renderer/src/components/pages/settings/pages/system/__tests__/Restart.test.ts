const coreAction = vi.fn()

vi.mock('@store/store', () => ({
  coreAction: (action: unknown) => coreAction(action)
}))

import { __resetRestartGuardForTests, Restart } from '../Restart'

describe('Restart', () => {
  beforeEach(() => {
    __resetRestartGuardForTests()
    coreAction.mockReset()
  })

  test('asks core to restart and returns null', () => {
    const catchMock = vi.fn()
    coreAction.mockReturnValue({ catch: catchMock })

    const result = Restart()

    expect(result).toBeNull()
    expect(coreAction).toHaveBeenCalledWith({ kind: 'restart' })
    expect(catchMock).toHaveBeenCalledWith(console.error)
  })

  test('asks only once over several renders', () => {
    coreAction.mockReturnValue({ catch: vi.fn() })

    Restart()
    Restart()
    Restart()

    expect(coreAction).toHaveBeenCalledTimes(1)
  })
})
