import { render, screen } from '@testing-library/react'
import React from 'react'
import { ClusterLayoutView } from '../ClusterLayoutView'
import { clusterAccent, clusterLayouts, shownLayouts } from '../clusterLayouts'
import { LAYOUT_SPECS, specFor } from '../layoutSpecs'

vi.mock('../../dashboards/DashboardFrame', () => ({
  DashboardFrame: (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'frame',
        'data-cluster': String(props.clusterFull),
        'data-accent': String(props.accent)
      },
      props.children
    )
}))
vi.mock('../../dashboards/NavMiniCenter', () => ({
  NavMiniCenter: () => React.createElement('div', { 'data-testid': 'nav-mini' })
}))
vi.mock('../ClusterStreamView', () => ({
  ClusterStreamView: () => React.createElement('div', { 'data-testid': 'stream' })
}))
vi.mock('../../widgets', () => ({
  NavFull: () => React.createElement('div', { 'data-testid': 'nav-full' })
}))

describe('cluster layouts', () => {
  test('a known layout has its own drawing, an unknown one keeps gauges over the stream', () => {
    expect(specFor('livi.navMini')).toBe(LAYOUT_SPECS['livi.navMini'])
    expect(specFor('nope')).toEqual(LAYOUT_SPECS['livi.clusterFull'])
    expect(specFor(undefined)).toEqual(LAYOUT_SPECS['livi.clusterFull'])
  })

  test('the active palette brings its accent for the appearance, an unknown one none', () => {
    const theme = {
      id: 't',
      displays: [],
      palettes: [{ id: 'blue', accentDark: '#63d2ffff', accentLight: '#57aaffff' }]
    }
    const cluster = (palette: string) => ({
      theme,
      layout: '',
      palette,
      palettes: {},
      appearance: 'automatic' as const
    })
    expect(clusterAccent(cluster('blue'), true)).toBe('#63d2ffff')
    expect(clusterAccent(cluster('blue'), false)).toBe('#57aaffff')
    expect(clusterAccent(cluster('racingGreen'), true)).toBeUndefined()
    expect(clusterAccent(null, true)).toBeUndefined()
  })

  test('the cluster display carries the layouts', () => {
    const layout = { id: 'a', name: 'A', palettes: [], zones: [] }
    const cluster = {
      theme: {
        id: 't',
        displays: [{ id: 'Cluster_Display', kind: 'cluster' as const, layouts: [layout] }],
        palettes: []
      },
      layout: 'a',
      palette: '',
      palettes: {},
      appearance: 'automatic' as const
    }
    expect(clusterLayouts(cluster)).toEqual([layout])
    expect(clusterLayouts(null)).toEqual([])
    expect(clusterLayouts({ ...cluster, theme: { id: 't', displays: [], palettes: [] } })).toEqual(
      []
    )
  })

  test("the shown layouts come in the user's order, unknown ids drop out", () => {
    const layouts = ['a', 'b', 'c'].map((id) => ({ id, name: id, palettes: [], zones: [] }))
    const cluster = {
      theme: {
        id: 't',
        displays: [{ id: 'Cluster_Display', kind: 'cluster' as const, layouts }],
        palettes: []
      },
      layout: 'a',
      palette: '',
      palettes: {},
      shown: ['c', 'gone', 'a'],
      arranged: [],
      appearance: 'automatic' as const
    }
    expect(shownLayouts(cluster).map((l) => l.id)).toEqual(['c', 'a'])
    expect(shownLayouts(null)).toEqual([])
  })

  test('each layout draws its part', () => {
    const { unmount } = render(<ClusterLayoutView layout="livi.navMini" />)
    expect(screen.getByTestId('frame')).toHaveAttribute('data-cluster', 'false')
    expect(screen.getByTestId('nav-mini')).toBeInTheDocument()
    unmount()

    render(<ClusterLayoutView layout="livi.navFull" accent="#63d2ffff" />)
    expect(screen.getByTestId('nav-full')).toBeInTheDocument()
    expect(screen.getByTestId('frame')).toHaveAttribute('data-accent', '#63d2ffff')
  })

  test('the stream layout shows only the phone', () => {
    render(<ClusterLayoutView layout="livi.clusterOnly" />)
    expect(screen.getByTestId('stream')).toBeInTheDocument()
    expect(screen.queryByTestId('frame')).toBeNull()
  })
})
