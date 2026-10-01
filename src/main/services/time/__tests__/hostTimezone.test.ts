import type { Mock } from 'vitest'
import {
  observesDst,
  resolveZoneForOffset,
  zoneForPosition,
  zoneOffsetMinutes
} from '../hostTimezone'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('node:fs', () => ({ default: { existsSync: vi.fn(() => true) } }))

const JAN = Date.UTC(2026, 0, 15)
const JUL = Date.UTC(2026, 6, 15)

describe('zoneOffsetMinutes', () => {
  test('reads a fixed offset zone', () => {
    expect(zoneOffsetMinutes('Etc/GMT-2', JUL)).toBe(120)
  })

  test('reads UTC as zero', () => {
    expect(zoneOffsetMinutes('UTC', JUL)).toBe(0)
  })

  // Older ICU (Debian 13 / Pi) renders a zero offset without the +00:00 suffix.
  function withFormatted(text: string, run: () => void): void {
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () {
      return { format: () => text } as Intl.DateTimeFormat
    } as unknown as () => Intl.DateTimeFormat)
    try {
      run()
    } finally {
      spy.mockRestore()
    }
  }

  test('reads a bare GMT as zero', () => {
    withFormatted('7/15/2026, GMT', () => {
      expect(zoneOffsetMinutes('UTC', JUL)).toBe(0)
    })
  })

  test('rejects a shape without an offset', () => {
    withFormatted('7/15/2026', () => {
      expect(zoneOffsetMinutes('UTC', JUL)).toBeNull()
    })
  })

  test('follows daylight saving within a zone', () => {
    expect(zoneOffsetMinutes('Europe/Berlin', JAN)).toBe(60)
    expect(zoneOffsetMinutes('Europe/Berlin', JUL)).toBe(120)
  })

  test('handles a half-hour zone', () => {
    expect(zoneOffsetMinutes('Asia/Kolkata', JUL)).toBe(330)
  })

  test('handles a quarter-hour zone', () => {
    expect(zoneOffsetMinutes('Asia/Kathmandu', JUL)).toBe(345)
  })

  test('handles a negative offset', () => {
    expect(zoneOffsetMinutes('America/New_York', JAN)).toBe(-300)
  })

  test('returns null for a zone the runtime does not know', () => {
    expect(zoneOffsetMinutes('Mars/Olympus_Mons', JUL)).toBeNull()
  })
})

describe('observesDst', () => {
  test('true for a zone that shifts', () => {
    expect(observesDst('Europe/Berlin')).toBe(true)
  })

  test('false for a fixed offset zone', () => {
    expect(observesDst('Etc/GMT-2')).toBe(false)
  })

  test('false for a zone without daylight saving', () => {
    expect(observesDst('Asia/Kolkata')).toBe(false)
  })

  test('false for an unknown zone', () => {
    expect(observesDst('Nowhere/Nothing')).toBe(false)
  })
})

describe('resolveZoneForOffset', () => {
  test.each([
    [0, 'UTC'],
    [60, 'Etc/GMT-1'],
    [120, 'Etc/GMT-2'],
    [-300, 'Etc/GMT+5'],
    [-720, 'Etc/GMT+12']
  ])('maps whole hour %i to %s', (offset, zone) => {
    expect(resolveZoneForOffset(offset, JUL)).toBe(zone)
  })

  test('whole-hour zones never carry daylight saving of their own', () => {
    for (const offset of [-660, -300, 60, 120, 480]) {
      const zone = resolveZoneForOffset(offset, JUL) as string
      expect(observesDst(zone)).toBe(false)
    }
  })

  test.each([
    [330, JUL],
    [345, JUL],
    [390, JUL],
    [570, JUL],
    [765, JUL]
  ])('resolves the non-whole offset %i to a zone that really has it', (offset, at) => {
    const zone = resolveZoneForOffset(offset, at) as string
    expect(zone).toBeTruthy()
    expect(zoneOffsetMinutes(zone, at)).toBe(offset)
  })

  test('prefers a zone without daylight saving for a half-hour offset', () => {
    const zone = resolveZoneForOffset(330, JUL) as string
    expect(observesDst(zone)).toBe(false)
  })

  test('resolves an offset that only exists in winter', () => {
    // Newfoundland standard time; in summer the region reports -150 instead
    expect(resolveZoneForOffset(-210, JAN)).toBe('America/St_Johns')
    expect(resolveZoneForOffset(-210, JUL)).toBeNull()
  })

  test('falls back to a DST zone when no fixed one carries the offset', () => {
    const zone = resolveZoneForOffset(765, JUL) as string
    expect(zoneOffsetMinutes(zone, JUL)).toBe(765)
  })

  test('rejects an impossible offset', () => {
    expect(resolveZoneForOffset(20 * 60, JUL)).toBeNull()
    expect(resolveZoneForOffset(-20 * 60, JUL)).toBeNull()
  })

  test('rejects a non-finite offset', () => {
    expect(resolveZoneForOffset(Number.NaN, JUL)).toBeNull()
  })
})

type Fresh = {
  tz: typeof import('../hostTimezone')
  execFile: Mock
  existsSync: Mock
}

// The module remembers the zone it set and the one GPS named, so each test starts from a fresh copy.
async function fresh(): Promise<Fresh> {
  vi.resetModules()
  const execFile = (await import('node:child_process')).execFile as unknown as Mock
  const nodeFs = (await import('node:fs')).default as unknown as { existsSync: Mock }
  execFile.mockReset()
  nodeFs.existsSync.mockReset().mockReturnValue(true)
  return { tz: await import('../hostTimezone'), execFile, existsSync: nodeFs.existsSync }
}

describe('applyTimezone', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>
  let m: Fresh

  beforeEach(async () => {
    m = await fresh()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    logSpy.mockRestore()
  })

  test('hands a new zone to the root helper', () => {
    m.tz.applyTimezone('Asia/Kolkata')
    expect(m.execFile).toHaveBeenCalledWith(
      'sudo',
      ['-n', '/usr/local/lib/livi/livi-set-time.sh', 'tz', 'Asia/Kolkata'],
      expect.any(Function)
    )
  })

  test('logs once the helper succeeds and takes the zone as current', () => {
    m.tz.applyTimezone('Asia/Kolkata')
    m.execFile.mock.calls[0][2](null)
    expect(logSpy).toHaveBeenCalledWith('[timezone] host zone → Asia/Kolkata')
    expect(m.tz.currentZone()).toBe('Asia/Kolkata')
    m.tz.applyTimezone('Asia/Kolkata')
    expect(m.execFile).toHaveBeenCalledTimes(1)
  })

  test('warns when the helper fails and keeps the old zone', () => {
    const before = m.tz.currentZone()
    m.tz.applyTimezone('Asia/Kolkata')
    m.execFile.mock.calls[0][2](new Error('not permitted'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('could not set'), 'not permitted')
    expect(m.tz.currentZone()).toBe(before)
  })

  test('does nothing when the zone is already active', () => {
    m.tz.applyTimezone(m.tz.currentZone())
    expect(m.execFile).not.toHaveBeenCalled()
  })

  test('refuses a zone the system does not know', () => {
    m.tz.applyTimezone('Middle/Earth')
    expect(m.execFile).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a zone'))
  })

  test('points at the installer when the helper is missing', () => {
    m.existsSync.mockReturnValue(false)
    m.tz.applyTimezone('Asia/Kolkata')
    expect(m.execFile).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('re-run the installer'))
  })
})

describe('applyPhoneUtcOffset', () => {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
  let m: Fresh

  // The host runs in Asia/Kolkata (+330) for every case.
  beforeEach(async () => {
    m = await fresh()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    m.tz.applyTimezone('Asia/Kolkata')
    m.execFile.mock.calls[0][2](null)
    m.execFile.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform)
    vi.restoreAllMocks()
  })

  test('sets a zone for an offset the host zone does not show', () => {
    m.tz.applyPhoneUtcOffset(120, JUL)
    expect(m.execFile).toHaveBeenCalledWith(
      'sudo',
      ['-n', '/usr/local/lib/livi/livi-set-time.sh', 'tz', 'Etc/GMT-2'],
      expect.any(Function)
    )
  })

  test('keeps a zone that already shows the offset', () => {
    m.tz.applyPhoneUtcOffset(330, JUL)
    expect(m.execFile).not.toHaveBeenCalled()
  })

  test('stands back once GPS has named a zone', () => {
    m.tz.noteGpsZone('Europe/Berlin')
    m.tz.applyPhoneUtcOffset(120, JUL)
    expect(m.execFile).not.toHaveBeenCalled()
  })

  test('ignores an offset no zone carries', () => {
    m.tz.applyPhoneUtcOffset(9999, JUL)
    expect(m.execFile).not.toHaveBeenCalled()
  })

  test('leaves a Mac alone', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    m.tz.applyPhoneUtcOffset(120, JUL)
    expect(m.execFile).not.toHaveBeenCalled()
  })
})

describe('zoneForPosition', () => {
  test.each([
    ['Europe/Berlin', 53.3536, 10.5633],
    ['Europe/Berlin', 52.52, 13.405],
    ['Asia/Kolkata', 22.5726, 88.3639],
    ['Asia/Kathmandu', 27.7172, 85.324],
    ['Asia/Yangon', 16.8409, 96.1735],
    ['America/St_Johns', 47.5615, -52.7126],
    ['Pacific/Chatham', -43.95, -176.55]
  ])('resolves %s from its coordinates', (zone, lat, lng) => {
    expect(zoneForPosition(lat, lng)).toBe(zone)
  })

  test('names a real zone, so daylight saving comes from the tz database', () => {
    const zone = zoneForPosition(52.52, 13.405) as string
    expect(observesDst(zone)).toBe(true)
    expect(zoneOffsetMinutes(zone, Date.UTC(2026, 0, 15))).toBe(60)
    expect(zoneOffsetMinutes(zone, Date.UTC(2026, 6, 15))).toBe(120)
  })

  test('falls back to a nautical zone at sea', () => {
    expect(zoneForPosition(30, -40)).toMatch(/^Etc\/GMT/)
  })

  test.each([
    ['latitude out of range', 91, 0],
    ['longitude out of range', 0, 181],
    ['not a number', Number.NaN, 0]
  ])('rejects %s', (_label, lat, lng) => {
    expect(zoneForPosition(lat, lng)).toBeNull()
  })
})
