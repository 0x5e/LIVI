const coreAction = vi.fn()

vi.mock('@store/store', () => ({
  coreAction: (action: unknown) => coreAction(action)
}))

import { __resetPowerOffGuardForTests, PowerOff } from '../PowerOff'

describe('PowerOff', () => {
  beforeEach(() => {
    __resetPowerOffGuardForTests()
    coreAction.mockReset()
  })

  test('asks core to quit and returns null', () => {
    const catchMock = vi.fn()
    coreAction.mockReturnValue({ catch: catchMock })

    const result = PowerOff()

    expect(result).toBeNull()
    expect(coreAction).toHaveBeenCalledWith({ kind: 'quit' })
    expect(catchMock).toHaveBeenCalledWith(console.error)
  })

  test('asks only once over several renders', () => {
    coreAction.mockReturnValue({ catch: vi.fn() })

    PowerOff()
    PowerOff()
    PowerOff()

    expect(coreAction).toHaveBeenCalledTimes(1)
  })
})
