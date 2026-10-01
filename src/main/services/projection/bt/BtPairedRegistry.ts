import { isPhoneLikeCod } from '../services/utils/isPhoneLikeCod'
import type { PairedDevice } from './BluezDeviceClient'

/** The name and connected-phone cache derived from the host's BlueZ paired-device list. */
export class BtPairedRegistry {
  private btNameByMac = new Map<string, string>()
  private connectedBtMac = ''

  getName(macUpper: string): string | undefined {
    return this.btNameByMac.get(macUpper)
  }

  getConnectedMac(): string {
    return this.connectedBtMac
  }

  // Fold a fresh BlueZ paired-device list into the cache. Returns the raw connected MAC (pre
  // prefer-override) and the phone subset the caller still needs for its own bookkeeping.
  ingest(
    devices: PairedDevice[],
    opts: { cpClaimedBtMacs: Set<string>; preferMac?: string }
  ): { connectedMac: string; phones: PairedDevice[] } {
    const phones = devices.filter((d) => isPhoneLikeCod(d.class))
    const connected =
      phones.find((d) => d.connected && !opts.cpClaimedBtMacs.has(d.mac.toUpperCase()))?.mac ?? ''
    this.btNameByMac = new Map(devices.map((d) => [d.mac.toUpperCase(), d.name || '']))

    const preferUp = Boolean(
      opts.preferMac &&
        phones.some((d) => d.connected && d.mac.toUpperCase() === opts.preferMac?.toUpperCase())
    )
    if (preferUp && opts.preferMac) this.connectedBtMac = opts.preferMac
    else if (connected) this.connectedBtMac = connected

    return { connectedMac: connected, phones }
  }
}
