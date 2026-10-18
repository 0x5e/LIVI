const TICKS_ALONG = 40

export const RPM_STEP = 1000
// Past this many sections the numbers touch at the top, three digits sooner than one or two.
export const SPEED_MAX_SECTIONS = 15
export const RPM_MAX_SECTIONS = 20

export type GaugeScale = {
  scaleMax: number
  majorCount: number
  ticks: number
  labels: string[]
}

/** A mark with its number every `step`, up to `max` on a whole step. */
export function gaugeScale(
  max: number,
  step: number,
  maxSections: number,
  label: (value: number) => string
): GaugeScale {
  const sections = Math.min(maxSections, Math.max(1, Math.round(max / step)))
  const perSection = Math.max(1, Math.round(TICKS_ALONG / sections))
  return {
    scaleMax: sections * step,
    majorCount: sections + 1,
    ticks: sections * perSection + 1,
    labels: Array.from({ length: sections + 1 }, (_, i) => label(i * step))
  }
}
