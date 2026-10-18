import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type FromCore, PROTOCOL, type ToCore } from './contract'
import { encodeFrame, FrameDecoder } from './wire'

const RETRY_MS = 500

/** Core sets LIVI_CORE_SOCKET for the UIs it starts. */
export function coreSocketPath(
  env: NodeJS.ProcessEnv = process.env,
  uid: number = process.getuid?.() ?? 0
): string {
  if (env.LIVI_CORE_SOCKET) return env.LIVI_CORE_SOCKET
  const dir = env.XDG_RUNTIME_DIR
    ? join(env.XDG_RUNTIME_DIR, 'livi')
    : join(tmpdir(), `livi-${uid}`)
  return join(dir, 'core.sock')
}

export type LinkOptions = {
  path: string
  client: string
  onMessage: (msg: FromCore) => void
  onClose?: () => void
  retryMs?: number
}

export class CoreLink {
  private socket: Socket | null = null
  private connected = false
  private closed = false
  private timer: NodeJS.Timeout | null = null
  private waitingLogged = false

  constructor(private readonly opts: LinkOptions) {
    this.connect()
  }

  send(msg: ToCore): boolean {
    if (!this.socket || !this.connected) return false
    this.socket.write(encodeFrame(msg))
    return true
  }

  close(): void {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.socket?.destroy()
  }

  private connect(): void {
    const decoder = new FrameDecoder()
    const socket = createConnection(this.opts.path)
    this.socket = socket
    socket.on('connect', () => {
      this.connected = true
      this.waitingLogged = false
      socket.write(encodeFrame({ type: 'hello', protocol: PROTOCOL, client: this.opts.client }))
    })
    socket.on('data', (chunk: Buffer) => {
      let messages: FromCore[]
      try {
        messages = decoder.push(chunk)
      } catch (e) {
        console.warn(`[core] dropping the connection: ${(e as Error).message}`)
        socket.destroy()
        return
      }
      for (const msg of messages) {
        // The same core will not take this client on another try.
        if (msg.type === 'refused') this.closed = true
        this.opts.onMessage(msg)
      }
    })
    socket.on('error', () => {
      if (!this.connected && !this.waitingLogged) {
        this.waitingLogged = true
        console.log(`[core] waiting for livi-core at ${this.opts.path}`)
      }
    })
    socket.on('close', () => {
      const was = this.connected
      this.connected = false
      this.socket = null
      if (was) this.opts.onClose?.()
      if (!this.closed) this.timer = setTimeout(() => this.connect(), this.opts.retryMs ?? RETRY_MS)
    })
  }
}
