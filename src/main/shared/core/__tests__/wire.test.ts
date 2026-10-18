vi.mock('../contract', () => ({ MAX_FRAME: 64, PROTOCOL: 1 }))

import type { FromCore } from '../contract'
import { encodeFrame, FrameDecoder, FrameTooLarge } from '../wire'

const reply = (id: number): FromCore => ({ type: 'reply', id })

function frame(body: string): Uint8Array {
  const bytes = new TextEncoder().encode(body)
  const out = new Uint8Array(4 + bytes.length)
  new DataView(out.buffer).setUint32(0, bytes.length, true)
  out.set(bytes, 4)
  return out
}

describe('encodeFrame', () => {
  test('puts the byte count in front, little endian', () => {
    const out = encodeFrame({ type: 'resync' })
    const body = '{"type":"resync"}'
    expect(new DataView(out.buffer).getUint32(0, true)).toBe(body.length)
    expect(new TextDecoder().decode(out.subarray(4))).toBe(body)
  })

  test('refuses a message over the limit', () => {
    expect(() => encodeFrame({ type: 'path', path: 'x'.repeat(80) })).toThrow(FrameTooLarge)
  })
})

describe('FrameDecoder', () => {
  test('waits for a frame split over chunks', () => {
    const dec = new FrameDecoder()
    const bytes = encodeFrame(reply(1))
    expect(dec.push(bytes.subarray(0, 2))).toEqual([])
    expect(dec.push(bytes.subarray(2, 9))).toEqual([])
    expect(dec.push(bytes.subarray(9))).toEqual([reply(1)])
  })

  test('takes several frames out of one chunk', () => {
    const a = encodeFrame(reply(1))
    const b = encodeFrame(reply(2))
    const both = new Uint8Array(a.length + b.length)
    both.set(a)
    both.set(b, a.length)
    expect(new FrameDecoder().push(both)).toEqual([reply(1), reply(2)])
  })

  test('skips a frame that is not JSON and goes on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = frame('{nope')
    const good = encodeFrame(reply(3))
    const both = new Uint8Array(bad.length + good.length)
    both.set(bad)
    both.set(good, bad.length)
    expect(new FrameDecoder().push(both)).toEqual([reply(3)])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('gives up on a frame announced over the limit', () => {
    const head = new Uint8Array(4)
    new DataView(head.buffer).setUint32(0, 65, true)
    expect(() => new FrameDecoder().push(head)).toThrow(FrameTooLarge)
  })
})
