type IpcHandler = (evt: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, IpcHandler>()

vi.mock('@main/ipc/register', () => ({
  registerIpcHandle: (channel: string, handler: IpcHandler) => {
    handlers.set(channel, handler)
  },
  registerIpcOn: vi.fn()
}))

import { registerTransportIpc } from '../transport'

describe('transport ipc', () => {
  beforeEach(async () => handlers.clear())

  test('device handlers delegate to the host', async () => {
    const devices = [{ id: 'AA:BB' }]
    const host = {
      getDevices: vi.fn(() => devices),
      selectDevice: vi.fn(async () => ({ ok: true })),
      cycleSession: vi.fn(async () => ({ ok: true })),
      forgetDevice: vi.fn(async () => ({ ok: true }))
    }
    registerTransportIpc(host)

    await expect(handlers.get('devices:list')!(null)).resolves.toBe(devices)
    await expect(handlers.get('devices:select')!(null, 'AA:BB')).resolves.toEqual({ ok: true })
    expect(host.selectDevice).toHaveBeenCalledWith('AA:BB')
    await expect(handlers.get('devices:cycle')!(null)).resolves.toEqual({ ok: true })
    expect(host.cycleSession).toHaveBeenCalled()
    await expect(handlers.get('devices:forget')!(null, 'AA:BB')).resolves.toEqual({ ok: true })
    expect(host.forgetDevice).toHaveBeenCalledWith('AA:BB')
  })
})
