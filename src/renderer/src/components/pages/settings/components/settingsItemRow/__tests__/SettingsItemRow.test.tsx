import { render, screen } from '@testing-library/react'
import { SettingsItemRow } from '../SettingsItemRow'

vi.mock('../../stackItem', () => ({
  StackItem: ({ children, ownIcon }: any) => (
    <div data-testid="stack-item" data-own-icon={String(Boolean(ownIcon))}>
      {children}
    </div>
  )
}))

describe('SettingsItemRow', () => {
  test('renders label and children inside StackItem', () => {
    render(
      <SettingsItemRow label="Audio">
        <span>Control</span>
      </SettingsItemRow>
    )
    expect(screen.getByTestId('stack-item')).toHaveAttribute('data-own-icon', 'false')
    expect(screen.getByText('Audio')).toBeInTheDocument()
    expect(screen.getByText('Control')).toBeInTheDocument()
  })

  test('a row without a node brings its own symbol', () => {
    const { container } = render(<SettingsItemRow label="Receiver" icon="dabReceiver" />)
    expect(screen.getByTestId('stack-item')).toHaveAttribute('data-own-icon', 'true')
    expect(container.querySelector('svg')).not.toBeNull()
  })
})
