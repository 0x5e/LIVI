import { registerIpc } from '@main/ipc'
import { registerAppIpc } from '@main/ipc/app'

vi.mock('@main/ipc/app', () => ({
  registerAppIpc: vi.fn()
}))

describe('registerIpc', () => {
  test('registers the app handlers', () => {
    const runtimeState = { config: {} } as never

    registerIpc(runtimeState)

    expect(registerAppIpc).toHaveBeenCalledWith(runtimeState)
  })
})
