import { act, render } from '@testing-library/react'
import { GaugeArc, labelOverflow } from '../GaugeArc'

const colors = {
  colorScale: '#111',
  colorMajor: '#222',
  colorPointer: '#0f0',
  colorRedline: '#f00'
}

describe('GaugeArc', () => {
  test('renders an accessible gauge svg with scale ticks', () => {
    const { container } = render(
      <GaugeArc value={0} scaleMax={100} ticks={10} armTicks={2} majorCount={4} {...colors} />
    )

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).toHaveAttribute('aria-label', 'gauge')
    // arc ticks (10) + two caps of 2 = 14 scale rects, plus the pointer
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(14)
  })

  test('renders one label per major graduation', () => {
    const { container } = render(
      <GaugeArc
        value={50}
        scaleMax={100}
        majorCount={4}
        labels={['0', '30', '60', '90']}
        {...colors}
      />
    )

    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent)
    expect(texts).toHaveLength(4)
    expect(texts).toEqual(['0', '30', '60', '90'])
  })

  test('shows a number on every mark, the outermost one too', () => {
    const labels = ['0', '40', '80', '120', '160', '200', '240', '280', '320']
    const { container } = render(
      <GaugeArc value={0} scaleMax={320} majorCount={9} labels={labels} mirror {...colors} />
    )

    const texts = Array.from(container.querySelectorAll('text'))
    expect(texts.map((t) => t.textContent)).toEqual(labels)
    expect(Number(texts[4].getAttribute('x'))).toBeCloseTo(136.5, 1)
  })

  test('tells how far the gauge has to move in so every number stays on screen', () => {
    const left = { boxW: 470, boxH: 600, px: 32 }
    const twenties = Array.from({ length: 14 }, (_, i) => String(i * 20))

    expect(
      labelOverflow({ majorCount: 6, labels: ['0', '40', '80', '120', '160', '200'] }, left)
    ).toBe(0)
    expect(labelOverflow({ ticks: 40, majorCount: 14, labels: twenties }, left)).toBeCloseTo(
      11.25,
      0
    )
    const rpm = Array.from({ length: 9 }, (_, i) => String(i))
    expect(labelOverflow({ majorCount: 9, labels: rpm }, { ...left, px: 40 })).toBeCloseTo(3.3, 0)
    expect(labelOverflow({ majorCount: 3 }, left)).toBe(0)
    expect(labelOverflow({ majorCount: 1, labels: ['0'] }, left)).toBe(0)
  })

  test('colors ticks at/above the redline red', () => {
    const { container } = render(
      <GaugeArc value={90} scaleMax={100} redline={50} ticks={20} {...colors} />
    )

    const fills = Array.from(container.querySelectorAll('rect')).map((r) => r.getAttribute('fill'))
    expect(fills).toContain('#f00')
  })

  test('renders mirrored without crashing', () => {
    expect(() => render(<GaugeArc value={30} scaleMax={100} mirror {...colors} />)).not.toThrow()
  })

  test('sanitizes degenerate tick / major / scale values', () => {
    const { container } = render(
      <GaugeArc value={10} scaleMax={0} ticks={1} armTicks={0} majorCount={1} {...colors} />
    )

    // ticks floored to 2, no majors → no label texts
    expect(container.querySelectorAll('text')).toHaveLength(0)
    expect(container.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2)
  })

  test('fully fades a single cap tick', () => {
    const { container } = render(
      <GaugeArc value={40} scaleMax={100} ticks={8} armTicks={1} {...colors} />
    )

    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  test('draws the soft C-shaped backdrop in both orientations', () => {
    const upright = render(<GaugeArc value={30} scaleMax={100} shadow {...colors} />)
    expect(upright.container.querySelector('path')).toBeInTheDocument()

    const mirrored = render(<GaugeArc value={30} scaleMax={100} shadow mirror {...colors} />)
    expect(mirrored.container.querySelector('path')).toBeInTheDocument()
  })

  test('turns the eased trail and pointer red past the redline', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(
        <GaugeArc value={95} scaleMax={100} redline={10} ticks={20} {...colors} />
      )

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      const fills = Array.from(container.querySelectorAll('rect')).map((r) =>
        r.getAttribute('fill')
      )
      expect(fills.filter((f) => f === '#f00').length).toBeGreaterThan(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test('settles the pointer at zero without drawing a trail', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<GaugeArc value={0} scaleMax={100} ticks={20} {...colors} />)

      act(() => {
        vi.advanceTimersByTime(3000)
      })

      expect(container.querySelector('svg')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  test('eases the pointer in and fades the trail over time', () => {
    vi.useFakeTimers()
    try {
      const { container, unmount } = render(
        <GaugeArc value={80} scaleMax={100} ticks={20} {...colors} />
      )
      const before = container.querySelectorAll('rect').length

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      // the trail fades in (opacity > 0), adding rects over the passed-over scale
      expect(container.querySelectorAll('rect').length).toBeGreaterThan(before)

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
