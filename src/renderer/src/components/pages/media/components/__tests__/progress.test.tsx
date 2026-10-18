import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ProgressBar } from '../progress'

const at = (left: number, width: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left,
    width,
    top: 0,
    right: left + width,
    bottom: 6,
    height: 6,
    x: left,
    y: 0,
    toJSON: () => ({})
  })

const bar = (props: Partial<ComponentProps<typeof ProgressBar>> = {}) => (
  <ProgressBar elapsedMs={30000} progressH={6} totalMs={120000} pct={25} {...props} />
)

const position = () => Number(screen.getByRole('slider').getAttribute('aria-valuenow'))

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn()
})

beforeEach(() => {
  at(100, 200)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ProgressBar', () => {
  it('only shows the position when it cannot seek', () => {
    const { rerender } = render(bar())
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByText('0:30')).toBeInTheDocument()
    expect(screen.getByText('-1:30')).toBeInTheDocument()

    rerender(bar({ onSeek: vi.fn(), totalMs: 0 }))
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('follows a drag and seeks where it is let go', () => {
    const onSeek = vi.fn()
    const { rerender } = render(bar({ onSeek }))
    const slider = screen.getByRole('slider')

    fireEvent.pointerMove(slider, { clientX: 200 })
    fireEvent.pointerUp(slider, { clientX: 200 })
    expect(onSeek).not.toHaveBeenCalled()
    expect(position()).toBe(30000)

    fireEvent.pointerDown(slider, { clientX: 150, pointerId: 1 })
    expect(position()).toBe(30000)
    fireEvent.pointerMove(slider, { clientX: 250 })
    expect(position()).toBe(90000)
    expect(screen.getByText('1:30')).toBeInTheDocument()

    fireEvent.pointerUp(slider, { clientX: 400 })
    expect(onSeek).toHaveBeenCalledWith(120000)
    expect(position()).toBe(120000)

    rerender(bar({ onSeek, elapsedMs: 119500 }))
    expect(position()).toBe(119500)
  })

  it('a cancelled drag seeks nowhere', () => {
    const onSeek = vi.fn()
    render(bar({ onSeek }))
    const slider = screen.getByRole('slider')

    fireEvent.pointerDown(slider, { clientX: 250, pointerId: 1 })
    expect(position()).toBe(90000)
    fireEvent.pointerCancel(slider)
    expect(position()).toBe(30000)
    expect(onSeek).not.toHaveBeenCalled()
  })

  it('jumps 15 s with the left and right keys from where it last went', () => {
    const onSeek = vi.fn()
    render(bar({ onSeek }))
    const slider = screen.getByRole('slider')

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenLastCalledWith(45000)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenLastCalledWith(60000)
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onSeek).toHaveBeenLastCalledWith(45000)
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onSeek).toHaveBeenCalledTimes(3)
  })

  it('seeks to whole ms from a played time that runs on as a fraction', () => {
    const onSeek = vi.fn()
    render(bar({ onSeek, elapsedMs: 30000.595 }))

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenCalledWith(45001)
  })

  it('stops a key jump at either end of the track', () => {
    const onSeek = vi.fn()
    const { unmount } = render(bar({ onSeek, elapsedMs: 5000 }))
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' })
    expect(onSeek).toHaveBeenLastCalledWith(0)
    unmount()

    render(bar({ onSeek, elapsedMs: 110000 }))
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onSeek).toHaveBeenLastCalledWith(120000)
  })

  it('lets go of a seek the phone never confirms', () => {
    vi.useFakeTimers()
    render(bar({ onSeek: vi.fn() }))

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(position()).toBe(45000)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(position()).toBe(30000)
  })

  it('makes the track glow while focused', () => {
    render(bar({ onSeek: vi.fn() }))
    const slider = screen.getByRole('slider')
    const track = slider.children[1] as HTMLElement

    fireEvent.focus(slider)
    expect(track.style.boxShadow).toContain('color-mix')
    fireEvent.blur(slider)
    expect(track.style.boxShadow).toBe('')
  })

  it('treats a track without width as the start', () => {
    at(100, 0)
    render(bar({ onSeek: vi.fn() }))

    fireEvent.pointerDown(screen.getByRole('slider'), { clientX: 250, pointerId: 1 })
    expect(position()).toBe(0)
  })
})
