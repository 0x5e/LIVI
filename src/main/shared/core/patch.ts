import type { PatchOp } from './contract'

export class PatchMismatch extends Error {}

type Obj = Record<string, unknown>

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Untouched subtrees are shared with `root`, listeners compare them by identity. */
export function applyOps<T>(root: T, ops: PatchOp[]): T {
  let next: unknown = root
  for (const op of ops) next = applyAt(next, op.path, op)
  return next as T
}

function applyAt(node: unknown, path: string[], op: PatchOp): unknown {
  if (path.length === 0) {
    if (op.op === 'remove') throw new PatchMismatch('the root cannot be removed')
    return op.value
  }
  const [key, ...rest] = path
  if (!isObject(node)) throw new PatchMismatch(`no object at ${op.path.join('.')}`)
  if (rest.length > 0) {
    if (!Object.hasOwn(node, key)) throw new PatchMismatch(`no object at ${op.path.join('.')}`)
    return { ...node, [key]: applyAt(node[key], rest, op) }
  }
  if (op.op === 'set') return { ...node, [key]: op.value }
  if (!Object.hasOwn(node, key))
    throw new PatchMismatch(`nothing to remove at ${op.path.join('.')}`)
  const { [key]: _gone, ...kept } = node
  return kept
}
