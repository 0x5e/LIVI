import type { PairedDevice } from '../BluezDeviceClient'
import { BtPairedRegistry } from '../BtPairedRegistry'

const PHONE_COD = 0x5a020c
const AUDIO_COD = 0x240404

const dev = (mac: string, over: Partial<PairedDevice> = {}): PairedDevice => ({
  mac,
  name: 'Dev',
  connected: false,
  trusted: true,
  class: PHONE_COD,
  path: `/org/bluez/${mac}`,
  ...over
})

describe('BtPairedRegistry.ingest', () => {
  const noCp = { cpClaimedBtMacs: new Set<string>() }

  test('builds the upper-cased name cache', () => {
    const reg = new BtPairedRegistry()
    reg.ingest(
      [dev('aa:bb:cc:dd:ee:ff', { name: 'Pixel' }), dev('11:22:33:44:55:66', { name: '' })],
      noCp
    )
    expect(reg.getName('AA:BB:CC:DD:EE:FF')).toBe('Pixel')
    expect(reg.getName('11:22:33:44:55:66')).toBe('')
  })

  test('picks the connected phone and skips cp-claimed macs', () => {
    const reg = new BtPairedRegistry()
    const res = reg.ingest(
      [
        dev('AA:BB:CC:DD:EE:FF', { connected: true }),
        dev('11:22:33:44:55:66', { connected: true })
      ],
      { cpClaimedBtMacs: new Set(['AA:BB:CC:DD:EE:FF']) }
    )
    expect(res.connectedMac).toBe('11:22:33:44:55:66')
    expect(reg.getConnectedMac()).toBe('11:22:33:44:55:66')
  })

  test('preferMac overrides connectedMac cache but returns the raw connected', () => {
    const reg = new BtPairedRegistry()
    const res = reg.ingest(
      [
        dev('AA:BB:CC:DD:EE:FF', { connected: true }),
        dev('11:22:33:44:55:66', { connected: true })
      ],
      { cpClaimedBtMacs: new Set(), preferMac: '11:22:33:44:55:66' }
    )
    expect(res.connectedMac).toBe('AA:BB:CC:DD:EE:FF')
    expect(reg.getConnectedMac()).toBe('11:22:33:44:55:66')
  })

  test('keeps the last connected phone when none is connected now', () => {
    const reg = new BtPairedRegistry()
    reg.ingest([dev('AA:BB:CC:DD:EE:FF', { connected: true })], noCp)
    const res = reg.ingest([dev('AA:BB:CC:DD:EE:FF')], {
      cpClaimedBtMacs: new Set(),
      preferMac: 'AA:BB:CC:DD:EE:FF'
    })
    expect(res.connectedMac).toBe('')
    expect(reg.getConnectedMac()).toBe('AA:BB:CC:DD:EE:FF')
  })

  test('returns only the phone-like subset', () => {
    const reg = new BtPairedRegistry()
    const res = reg.ingest(
      [dev('AA:BB:CC:DD:EE:FF'), dev('11:22:33:44:55:66', { class: AUDIO_COD })],
      noCp
    )
    expect(res.phones.map((p) => p.mac)).toEqual(['AA:BB:CC:DD:EE:FF'])
  })
})
