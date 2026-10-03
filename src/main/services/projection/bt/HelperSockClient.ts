import * as net from 'net'

/** One line-JSON socket of livi-helperd: one-shot requests plus a long-lived event stream. */

export type ActionResponse = { ok: boolean; error?: string }

export type HelperEvent = {
  event: string
  mac?: string
  path?: string
  command?: string
  btMac?: string
  instanceId?: string
  usbSerial?: string
  up?: boolean
  pct?: number
  mtu?: number
  socket?: string
  peer?: string
}

export class HelperSockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HelperSockError'
  }
}

export class HelperSockClient {
  constructor(
    private readonly path: string,
    private readonly label: string
  ) {}

  protected request(line: string, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection(this.path)
      let buf = ''
      let settled = false
      const settle = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          sock.destroy()
        } catch {
          /* already torn down */
        }
        fn()
      }
      const timer = setTimeout(() => {
        settle(() => reject(new HelperSockError(`${this.label} timeout after ${timeoutMs}ms`)))
      }, timeoutMs)

      sock.on('connect', () => {
        sock.write(line + '\n')
      })
      sock.on('data', (data: Buffer) => {
        buf += data.toString('utf8')
        const nl = buf.indexOf('\n')
        if (nl < 0) return
        const json = buf.slice(0, nl)
        settle(() => {
          try {
            resolve(JSON.parse(json))
          } catch (e) {
            reject(new HelperSockError(`${this.label} bad json: ${json} (${(e as Error).message})`))
          }
        })
      })
      sock.on('error', (err: Error) => {
        settle(() => reject(new HelperSockError(`${this.label} error: ${err.message}`)))
      })
      sock.on('end', () => {
        if (!settled && !buf.includes('\n')) {
          settle(() => reject(new HelperSockError(`${this.label} closed without response`)))
        }
      })
    })
  }

  /** Streams the socket's events until it closes. */
  subscribe(
    onEvent: (ev: HelperEvent) => void,
    onClose?: () => void,
    onOpen?: () => void
  ): { close: () => void } {
    const sock = net.createConnection(this.path)
    let buf = ''
    let closed = false

    sock.on('connect', () => {
      sock.write('subscribe\n')
      onOpen?.()
    })
    sock.on('data', (data: Buffer) => {
      buf += data.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          const obj = JSON.parse(line)
          if (typeof obj === 'object' && obj && 'event' in obj) {
            onEvent(obj as HelperEvent)
          }
        } catch {}
      }
    })
    const fireClose = (): void => {
      if (closed) return
      closed = true
      if (onClose) onClose()
    }
    sock.on('error', fireClose)
    sock.on('close', fireClose)

    return {
      close: () => {
        try {
          sock.destroy()
        } catch {}
      }
    }
  }
}
