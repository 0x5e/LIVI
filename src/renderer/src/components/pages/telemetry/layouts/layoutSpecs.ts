/**
 * What LIVI draws for each cluster layout of a theme. The theme and the active layout come from
 * core, this only says how the car's own part of a layout looks.
 */
export type LayoutSpec = {
  /** `stream`: the phone's cluster stream alone. */
  frame: 'gauges' | 'stream'
  /** The phone's cluster stream fills the background. */
  clusterStream: boolean
  center: 'none' | 'navMini' | 'navFull'
}

const GAUGES: LayoutSpec = {
  frame: 'gauges',
  clusterStream: false,
  center: 'none'
}

const MAP_WITH_GAUGES: LayoutSpec = { ...GAUGES, clusterStream: true }

export const LAYOUT_SPECS: Record<string, LayoutSpec> = {
  'livi.navMini': { ...GAUGES, center: 'navMini' },
  'livi.navFull': { ...GAUGES, center: 'navFull' },
  'livi.clusterFull': MAP_WITH_GAUGES,
  'livi.clusterOnly': { ...MAP_WITH_GAUGES, frame: 'stream' }
}

/** A layout LIVI has no drawing for keeps the gauges over the stream. */
export const specFor = (layout: string | undefined): LayoutSpec =>
  (layout && LAYOUT_SPECS[layout]) || MAP_WITH_GAUGES
