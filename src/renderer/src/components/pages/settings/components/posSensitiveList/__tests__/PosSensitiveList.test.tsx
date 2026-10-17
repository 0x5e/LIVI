import { fireEvent, render, screen } from '@testing-library/react'
import { PosSensitiveList } from '../PosSensitiveList'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../stackItem', () => ({
  StackItem: ({
    children,
    ownIcon,
    dimmed
  }: {
    children: React.ReactNode
    ownIcon?: boolean
    dimmed?: boolean
  }) => (
    <div data-testid="row" data-own-icon={String(Boolean(ownIcon))} data-dimmed={String(!!dimmed)}>
      {children}
    </div>
  )
}))

describe('PosSensitiveList', () => {
  test('rows in order, the ends cannot leave the list', () => {
    const onMove = vi.fn()
    render(
      <PosSensitiveList
        rows={[
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' }
        ]}
        onMove={onMove}
      />
    )
    expect(screen.getAllByTestId('row').map((r) => r.textContent)).toEqual(['A', 'B', 'C'])
    const up = screen.getAllByLabelText('settings.moveUp')
    const down = screen.getAllByLabelText('settings.moveDown')
    expect(up[0]).toBeDisabled()
    expect(down[2]).toBeDisabled()
    fireEvent.click(up[1])
    fireEvent.click(down[1])
    expect(onMove.mock.calls).toEqual([
      ['b', -1],
      ['b', 1]
    ])
  })

  test('a row takes its own icon, controls in front of the arrows and may be dimmed', () => {
    render(
      <PosSensitiveList
        rows={[
          {
            id: 'a',
            label: 'A',
            leading: <i data-testid="logo" />,
            trailing: <button type="button">star</button>,
            dimmed: true
          },
          { id: 'b', label: 'B' }
        ]}
        onMove={vi.fn()}
      />
    )
    const [a, b] = screen.getAllByTestId('row')
    expect(a).toHaveAttribute('data-own-icon', 'true')
    expect(a).toHaveAttribute('data-dimmed', 'true')
    expect(a).toContainElement(screen.getByTestId('logo'))
    expect(a).toContainElement(screen.getByRole('button', { name: 'star' }))
    expect(b).toHaveAttribute('data-own-icon', 'false')
    expect(b).toHaveAttribute('data-dimmed', 'false')
  })
})
