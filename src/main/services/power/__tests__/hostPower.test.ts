import { spawn } from 'node:child_process'
import fs from 'node:fs'
import type { Mock } from 'vitest'
import { hostPowerAvailable, requestPowerAction, runPendingPowerAction } from '../hostPower'

vi.mock('node:child_process', () => ({ spawn: vi.fn(() => ({ unref: vi.fn() })) }))
vi.mock('node:fs', () => ({ default: { existsSync: vi.fn(() => true) } }))

const mockedSpawn = spawn as unknown as Mock
const mockedFs = fs as unknown as { existsSync: Mock }

const HELPER = '/usr/local/lib/livi/livi-power.sh'

beforeEach(() => {
  vi.clearAllMocks()
  mockedSpawn.mockImplementation(() => ({ unref: vi.fn() }))
  mockedFs.existsSync.mockReturnValue(true)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  runPendingPowerAction()
  mockedSpawn.mockClear()
})

afterEach(() => {
  delete process.env.LIVI_KIOSK
  vi.restoreAllMocks()
})

describe('hostPowerAvailable', () => {
  test('only on the appliance', () => {
    process.env.LIVI_KIOSK = '1'
    expect(hostPowerAvailable()).toBe(true)
  })

  test('not on a desktop', () => {
    delete process.env.LIVI_KIOSK
    expect(hostPowerAvailable()).toBe(false)
  })

  test('not for any other value', () => {
    process.env.LIVI_KIOSK = '0'
    expect(hostPowerAvailable()).toBe(false)
  })
})

describe('runPendingPowerAction', () => {
  test('does nothing without a request', () => {
    runPendingPowerAction()
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test.each(['poweroff', 'reboot'] as const)('runs the helper for %s', (action) => {
    requestPowerAction(action)
    runPendingPowerAction()
    expect(mockedSpawn).toHaveBeenCalledWith('sudo', ['-n', HELPER, action], {
      detached: true,
      stdio: 'ignore'
    })
  })

  test('detaches the helper so it outlives us', () => {
    const unref = vi.fn()
    mockedSpawn.mockImplementation(() => ({ unref }))
    requestPowerAction('poweroff')
    runPendingPowerAction()
    expect(unref).toHaveBeenCalled()
  })

  test('the action is consumed, so a second call is a no-op', () => {
    requestPowerAction('reboot')
    runPendingPowerAction()
    mockedSpawn.mockClear()
    runPendingPowerAction()
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('the last request wins', () => {
    requestPowerAction('reboot')
    requestPowerAction('poweroff')
    runPendingPowerAction()
    expect(mockedSpawn).toHaveBeenCalledWith('sudo', ['-n', HELPER, 'poweroff'], expect.anything())
  })

  test('says so when the helper was never installed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockedFs.existsSync.mockReturnValue(false)
    requestPowerAction('poweroff')
    runPendingPowerAction()
    expect(mockedSpawn).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('helper missing'))
  })

  test('swallows a failing spawn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockedSpawn.mockImplementation(() => {
      throw new Error('EPERM')
    })
    requestPowerAction('reboot')
    expect(() => runPendingPowerAction()).not.toThrow()
    expect(warn).toHaveBeenCalledWith('[power] could not reboot:', 'EPERM')
  })
})
