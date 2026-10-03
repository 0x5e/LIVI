import { type ActionResponse, HelperSockClient } from '../../bt/HelperSockClient'

/** Client for livi-helperd's Android Auto socket: its USB sessions, call audio and events. */

export const AA_SOCK_PATH = '/tmp/aa-bt.sock'

export class AaHelperSock extends HelperSockClient {
  constructor(path: string = AA_SOCK_PATH) {
    super(path, 'aa sock')
  }

  // Phones that already project over USB. The helper refuses to hand them the AP credentials
  async setWiredPhones(ids: string[], timeoutMs = 5000): Promise<ActionResponse> {
    return (await this.request(`wired-phones ${JSON.stringify(ids)}`, timeoutMs)) as ActionResponse
  }

  // Where the call audio goes: the pipeline's feed and stream id, nothing to stop
  async setScoSink(feed?: string, streamId?: number, timeoutMs = 5000): Promise<ActionResponse> {
    const arg = feed && streamId != null ? ` ${feed} ${streamId}` : ''
    return (await this.request(`sco-sink${arg}`, timeoutMs)) as ActionResponse
  }

  // Ends the wired Android Auto sessions
  async restartUsb(timeoutMs = 5000): Promise<ActionResponse> {
    return (await this.request('restart-usb', timeoutMs)) as ActionResponse
  }
}
