import { type ActionResponse, HelperSockClient, HelperSockError } from './HelperSockClient'

/**
 * Client for livi-helperd's shared socket: what every projection path uses alike, Android Auto
 * and CarPlay. BlueZ device management (list_paired / connect / disconnect / remove), the
 * access point and the AVRCP player, plus their events.
 */

export const SHARED_SOCK_PATH = '/tmp/livi-shared.sock'

export type PairedDevice = {
  mac: string
  name: string
  connected: boolean
  trusted: boolean
  class: number
  path: string
}

type ListPairedResponse = { ok: true; devices: PairedDevice[] } | { ok: false; error: string }

export class BluezDeviceClient extends HelperSockClient {
  constructor(path: string = SHARED_SOCK_PATH) {
    super(path, 'shared sock')
  }

  // Enumerate all paired BT devices known to BlueZ
  async listPaired(timeoutMs = 5000): Promise<PairedDevice[]> {
    const resp = (await this.request('list_paired', timeoutMs)) as ListPairedResponse
    if (!resp.ok) {
      throw new HelperSockError(resp.error || 'list_paired failed')
    }
    return resp.devices
  }

  // Initiate a BT connection to the given MAC (BlueZ Device1.ConnectProfile).
  async connect(mac: string, timeoutMs = 32000, uuid?: string): Promise<ActionResponse> {
    const line = uuid ? `connect ${mac} ${uuid}` : `connect ${mac}`
    return (await this.request(line, timeoutMs)) as ActionResponse
  }

  // Connect all auto-connect profiles (A2DP + HFP + HSP)
  async connectFull(mac: string, timeoutMs = 32000): Promise<ActionResponse> {
    return (await this.request(`connect-full ${mac}`, timeoutMs)) as ActionResponse
  }

  // Tear down one profile connection (BlueZ Device1.DisconnectProfile)
  async disconnectProfile(mac: string, uuid: string, timeoutMs = 10000): Promise<ActionResponse> {
    return (await this.request(`disconnect-profile ${mac} ${uuid}`, timeoutMs)) as ActionResponse
  }

  // Tear down the BT connection (BlueZ Device1.Disconnect)
  async disconnect(mac: string, timeoutMs = 10000): Promise<ActionResponse> {
    return (await this.request(`disconnect ${mac}`, timeoutMs)) as ActionResponse
  }

  // Unpair / forget the device (BlueZ Adapter1.RemoveDevice)
  async remove(mac: string, timeoutMs = 10000): Promise<ActionResponse> {
    return (await this.request(`remove ${mac}`, timeoutMs)) as ActionResponse
  }

  // Kick every associated Wi-Fi station off the AP
  async deauthApClients(timeoutMs = 5000): Promise<ActionResponse> {
    return (await this.request('deauth-ap', timeoutMs)) as ActionResponse
  }

  /** Mirrors the active session's play state into the helper's AVRCP player. */
  async setPlaybackStatus(state: 'playing' | 'paused' | 'stopped'): Promise<ActionResponse> {
    return (await this.request(`playback-status ${state}`)) as ActionResponse
  }
}
