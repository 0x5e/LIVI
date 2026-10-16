import { fireEvent, render, screen } from '@testing-library/react'
import { StationBand } from '../StationBand'
import { station } from './fixtures'

const band = (onPick = vi.fn()) => {
  const kultur = { ...station(2, 'Dlf Kultur'), shortLabel: '' }
  const doku = { ...station(3, 'Doku'), hidden: true }
  render(
    <StationBand
      stations={[station(1, 'Dlf', true), doku, kultur]}
      tuned={2}
      tile={100}
      onPick={onPick}
    />
  )
  return onPick
}

describe('StationBand', () => {
  test('numbered tiles in list order, hidden ones left out, the tuned one pressed', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const onPick = band()
    const tiles = screen.getAllByRole('button')
    expect(tiles.map((t) => t.textContent)).toEqual(['1DLDlf', '2DKDlf Kultur'])
    expect(tiles[1]).toHaveAttribute('aria-pressed', 'true')
    expect(tiles[0]).toHaveAttribute('aria-pressed', 'false')
    expect(scroll).toHaveBeenCalled()
    fireEvent.mouseUp(tiles[0])
    fireEvent.click(tiles[0])
    expect(onPick).toHaveBeenCalledWith(1)
  })

  test('favorites carry a star', () => {
    band()
    const stars = screen.getAllByTestId('favorite-star')
    expect(stars).toHaveLength(1)
    expect(screen.getAllByRole('button')[0]).toContainElement(stars[0])
  })

  test('dragging scrolls the band and swallows the click it ends with', () => {
    const onPick = band()
    const row = screen.getByTestId('station-band')
    const tile = screen.getAllByRole('button')[0]

    fireEvent.pointerDown(row, { clientX: 200, pointerType: 'mouse' })
    fireEvent.pointerMove(row, { clientX: 197 })
    expect(row.scrollLeft).toBe(0)
    fireEvent.pointerMove(row, { clientX: 150 })
    expect(row.scrollLeft).toBe(50)
    fireEvent.pointerUp(row)
    fireEvent.click(tile)
    expect(onPick).not.toHaveBeenCalled()

    fireEvent.click(tile)
    expect(onPick).toHaveBeenCalledWith(1)
  })

  test('a short press still picks, touch and leaving end no drag', () => {
    const onPick = band()
    const row = screen.getByTestId('station-band')
    const tile = screen.getAllByRole('button')[0]

    fireEvent.pointerDown(row, { clientX: 200, pointerType: 'mouse' })
    fireEvent.pointerUp(row)
    fireEvent.click(tile)
    expect(onPick).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(row, { clientX: 200, pointerType: 'touch' })
    fireEvent.pointerMove(row, { clientX: 100 })
    expect(row.scrollLeft).toBe(0)

    fireEvent.pointerDown(row, { clientX: 200, pointerType: 'mouse' })
    fireEvent.pointerLeave(row)
    fireEvent.pointerMove(row, { clientX: 100 })
    expect(row.scrollLeft).toBe(0)
  })
})
