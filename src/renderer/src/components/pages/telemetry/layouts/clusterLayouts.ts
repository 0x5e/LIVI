import type { Cluster, ThemeLayout } from '@shared/core/contract'

const NONE: ThemeLayout[] = []

/** The cluster display's layouts of the active theme, none before core answers. */
export const clusterLayouts = (cluster: Cluster | null | undefined): ThemeLayout[] =>
  cluster?.theme.displays.find((d) => d.kind === 'cluster')?.layouts ?? NONE

/** The layouts the dashboard offers, in the user's order. */
export const shownLayouts = (cluster: Cluster | null | undefined): ThemeLayout[] => {
  const all = clusterLayouts(cluster)
  return (cluster?.shown ?? [])
    .map((id) => all.find((l) => l.id === id))
    .filter((l): l is ThemeLayout => l !== undefined)
}

/** The active palette's accent for the appearance shown, none for a palette the theme lacks. */
export const clusterAccent = (
  cluster: Cluster | null | undefined,
  dark: boolean
): string | undefined => {
  const palette = cluster?.theme.palettes.find((p) => p.id === cluster.palette)
  return palette ? (dark ? palette.accentDark : palette.accentLight) : undefined
}
