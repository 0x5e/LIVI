import type { PatchOp } from '../contract'
import { applyOps, PatchMismatch } from '../patch'

const set = (path: string[], value: unknown): PatchOp => ({ op: 'set', path, value })
const remove = (path: string[]): PatchOp => ({ op: 'remove', path })

describe('applyOps', () => {
  const root = { config: { huVolume: 0.5, kiosk: { main: false } }, front: { main: 'livi' } }

  test('sets a nested value and shares what it leaves alone', () => {
    const next = applyOps(root, [set(['config', 'huVolume'], 0.8)])
    expect(next.config.huVolume).toBe(0.8)
    expect(next.config.kiosk).toBe(root.config.kiosk)
    expect(next.front).toBe(root.front)
    expect(root.config.huVolume).toBe(0.5)
  })

  test('adds a key and removes one', () => {
    const next = applyOps(root, [set(['config', 'added'], null), remove(['front', 'main'])])
    expect(next.config).toEqual({ huVolume: 0.5, kiosk: { main: false }, added: null })
    expect(next.front).toEqual({})
  })

  test('replaces the whole tree at the empty path', () => {
    expect(applyOps(root, [set([], { a: 1 })])).toEqual({ a: 1 })
  })

  test('a copy that no longer matches throws', () => {
    expect(() => applyOps(root, [remove([])])).toThrow(PatchMismatch)
    expect(() => applyOps(root, [set(['nope', 'x'], 1)])).toThrow(PatchMismatch)
    expect(() => applyOps(root, [remove(['config', 'nope'])])).toThrow(PatchMismatch)
    expect(() => applyOps(root, [set(['config', 'huVolume', 'x'], 1)])).toThrow(PatchMismatch)
    expect(() => applyOps({ list: [1] }, [set(['list', '0'], 2)])).toThrow(PatchMismatch)
  })
})
