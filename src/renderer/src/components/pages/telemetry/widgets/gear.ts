export function normalizeGear(g: string | number | undefined) {
  const s = String(g ?? '')
    .trim()
    .toUpperCase()
  if (!s || s === 'UNKNOWN') return '—'
  if (s === 'NEUTRAL') return 'N'
  if (s === 'REVERSE') return 'R'
  if (s === 'PARK') return 'P'
  if (s === 'DRIVE') return 'D'
  if (s === 'WINTER') return 'W'
  if (s === 'SPORT') return 'S'
  return s
}
