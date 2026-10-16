import { render, screen } from '@testing-library/react'
import { hue, initials, StationBadge } from '../StationBadge'

describe('StationBadge', () => {
  test('two letters from two words, else the first two', () => {
    expect(initials('Dlf Kultur')).toBe('DK')
    expect(initials('radio-horeb')).toBe('RH')
    expect(initials('Dlf')).toBe('DL')
    expect(initials('')).toBe('?')
  })

  test('a name always gets the same colour', () => {
    expect(hue('Dlf')).toBe(hue('Dlf'))
    expect(hue('Dlf')).not.toBe(hue('NDR 2'))
    expect(hue('ENERGY')).toBeLessThan(360)
  })

  test('shows the logo when there is one, else the letters', () => {
    const { rerender } = render(<StationBadge label="Dlf" size={40} />)
    expect(screen.getByLabelText('Dlf')).toHaveTextContent('DL')
    rerender(<StationBadge label="Dlf" image="/9j/AAA" size={40} />)
    expect(screen.getByAltText('Dlf')).toHaveAttribute('src', 'data:image/jpeg;base64,/9j/AAA')
    rerender(<StationBadge label="Dlf" image="iVBOR" size={40} />)
    expect(screen.getByAltText('Dlf')).toHaveAttribute('src', 'data:image/png;base64,iVBOR')
  })
})
