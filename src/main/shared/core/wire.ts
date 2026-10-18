import { type FromCore, MAX_FRAME, type ToCore } from './contract'

const LEN_BYTES = 4
const utf8In = new TextEncoder()
const utf8Out = new TextDecoder()

export class FrameTooLarge extends Error {
  constructor(len: number) {
    super(`frame of ${len} bytes exceeds ${MAX_FRAME}`)
  }
}

/** A little-endian u32 byte count, then that many bytes of JSON. */
export function encodeFrame(msg: ToCore | FromCore): Uint8Array {
  const body = utf8In.encode(JSON.stringify(msg))
  if (body.length > MAX_FRAME) throw new FrameTooLarge(body.length)
  const out = new Uint8Array(LEN_BYTES + body.length)
  new DataView(out.buffer).setUint32(0, body.length, true)
  out.set(body, LEN_BYTES)
  return out
}

/** After `FrameTooLarge` the stream cannot find the next frame again. */
export class FrameDecoder {
  private buf = new Uint8Array(0)

  push(chunk: Uint8Array): FromCore[] {
    const joined = new Uint8Array(this.buf.length + chunk.length)
    joined.set(this.buf)
    joined.set(chunk, this.buf.length)
    this.buf = joined

    const out: FromCore[] = []
    while (this.buf.length >= LEN_BYTES) {
      const len = new DataView(this.buf.buffer, this.buf.byteOffset).getUint32(0, true)
      if (len > MAX_FRAME) throw new FrameTooLarge(len)
      if (this.buf.length < LEN_BYTES + len) break
      const body = this.buf.subarray(LEN_BYTES, LEN_BYTES + len)
      this.buf = this.buf.slice(LEN_BYTES + len)
      try {
        out.push(JSON.parse(utf8Out.decode(body)) as FromCore)
      } catch {
        console.warn('[core] skipped a frame that is not a message')
      }
    }
    return out
  }
}
