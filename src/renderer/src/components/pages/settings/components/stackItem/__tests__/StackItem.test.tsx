import type { SettingsNode } from '@renderer/routes/types'
import type { Config } from '@shared/types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StackItem } from '../StackItem'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => `t:${key}:${fallback ?? ''}`
  })
}))

describe('StackItem', () => {
  test('renders a leading icon when the node carries an icon key', () => {
    const node = {
      type: 'route',
      label: 'Devices',
      route: 'devices',
      path: '',
      icon: 'devices',
      children: []
    } as SettingsNode<Config>

    const { container } = render(
      <StackItem node={node} withForwardIcon onClick={() => {}}>
        <span>Devices</span>
      </StackItem>
    )

    expect(container.querySelector('svg[data-testid="SmartphoneOutlinedIcon"]')).toBeTruthy()
  })

  test('renders no leading icon for an unknown icon key', () => {
    const node = {
      type: 'route',
      label: 'X',
      route: 'x',
      path: '',
      icon: 'nope',
      children: []
    } as SettingsNode<Config>

    const { container } = render(
      <StackItem node={node}>
        <span>X</span>
      </StackItem>
    )

    expect(container.querySelectorAll('svg')).toHaveLength(0)
  })

  test('renders translated label for select option', () => {
    const node = {
      type: 'select',
      label: 'Theme',
      path: 'theme',
      options: [{ value: 'light', label: 'Light', labelKey: 'settings.theme.light' }]
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="light">
        <span>Theme</span>
      </StackItem>
    )

    expect(screen.getByText('t:settings.theme.light:Light')).toBeInTheDocument()
  })

  test('shows fallback --- for null-like formatted values', () => {
    const node = {
      type: 'number',
      label: 'Speed',
      path: 'speed',
      valueTransform: { format: () => 'undefined' }
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value={42}>
        <span>Speed</span>
      </StackItem>
    )

    expect(screen.getByText('---')).toBeInTheDocument()
  })

  test('invokes onClick on Enter and Space keys', () => {
    const onClick = vi.fn()
    render(
      <StackItem onClick={onClick}>
        <span>Open</span>
      </StackItem>
    )

    const el = screen.getByRole('button')
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: ' ' })

    expect(onClick).toHaveBeenCalledTimes(2)
  })

  test('shows empty value when select option is not found', () => {
    const node = {
      type: 'select',
      label: 'Theme',
      path: 'theme',
      options: [{ value: 'light', label: 'Light', labelKey: 'settings.theme.light' }]
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="dark">
        <span>Theme</span>
      </StackItem>
    )

    const valueContainer = screen.getByText('Theme').parentElement
    expect(valueContainer).toBeInTheDocument()
    expect(screen.queryByText('t:settings.theme.light:Light')).not.toBeInTheDocument()
  })

  test('shows fallback --- for null-like string "null"', () => {
    const node = {
      type: 'number',
      label: 'Speed',
      path: 'speed',
      valueTransform: { format: () => 'null' }
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value={42}>
        <span>Speed</span>
      </StackItem>
    )

    expect(screen.getByText('---')).toBeInTheDocument()
  })

  test('does not invoke onClick for other keys', () => {
    const onClick = vi.fn()

    render(
      <StackItem onClick={onClick}>
        <span>Open</span>
      </StackItem>
    )

    const el = screen.getByRole('button')
    fireEvent.keyDown(el, { key: 'Escape' })

    expect(onClick).not.toHaveBeenCalled()
  })

  test('a disabled row dims, drops the button role and swallows clicks and keys', () => {
    const onClick = vi.fn()
    render(
      <StackItem onClick={onClick} disabled>
        <span>Blocked</span>
      </StackItem>
    )

    expect(screen.queryByRole('button')).toBeNull()
    const el = screen.getByText('Blocked').parentElement as HTMLElement
    fireEvent.click(el)
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onClick).not.toHaveBeenCalled()
    expect(el.style.opacity).toBe('0.45')
    expect(el.style.pointerEvents).toBe('none')
  })

  test('a dimmed row keeps its interaction but lowers opacity', () => {
    const onClick = vi.fn()
    render(
      <StackItem onClick={onClick} dimmed>
        <span>Offline</span>
      </StackItem>
    )

    const el = screen.getByRole('button')
    fireEvent.click(el)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(el.style.opacity).toBe('0.45')
    expect(el.style.pointerEvents).not.toBe('none')
  })

  test('does not get button role or tab focus without onClick', () => {
    const { container } = render(
      <StackItem>
        <span>Static item</span>
      </StackItem>
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelector('[tabindex="0"]')).not.toBeInTheDocument()
  })

  test('a focusable static item gets tab focus but no button role', () => {
    const { container } = render(
      <StackItem focusable>
        <span>Info row</span>
      </StackItem>
    )

    expect(container.querySelector('[tabindex="0"]')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('uses valueTransform.toView before formatting', () => {
    const node = {
      type: 'number',
      label: 'Speed',
      path: 'speed',
      valueTransform: {
        toView: (v: number) => v / 2,
        format: (v: number) => `${v} km/h`
      }
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value={100}>
        <span>Speed</span>
      </StackItem>
    )

    expect(screen.getByText('50 km/h')).toBeInTheDocument()
  })

  test('shows a number in the unit the node picks from the settings', () => {
    const unit = vi.fn(() => ({ factor: 0.5, suffix: 'mph' }))
    const node = { type: 'number', label: 'Top', path: 'top', unit } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value={201}>
        <span>Top</span>
      </StackItem>
    )

    expect(unit).toHaveBeenCalledWith(null)
    expect(screen.getByText('101 mph')).toBeInTheDocument()
  })

  test('a number in a unit lands on the whole step it is edited in', () => {
    const unit = () => ({ factor: 1 / 1.609344, suffix: 'mph' })
    const node = {
      type: 'number',
      label: 'Max',
      path: 'max',
      step: 20,
      unit
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value={200}>
        <span>Max</span>
      </StackItem>
    )

    expect(screen.getByText('120 mph')).toBeInTheDocument()
  })

  test('a number in a unit uses the unit step and stops at its cap', () => {
    const unit = () => ({ factor: 1, suffix: 'km/h', step: 40, max: 120 })
    const node = {
      type: 'number',
      label: 'Max',
      path: 'max',
      step: 7,
      unit
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value={300}>
        <span>Max</span>
      </StackItem>
    )

    expect(screen.getByText('120 km/h')).toBeInTheDocument()
  })

  test('renders plain option label when select option has no labelKey', () => {
    const node = {
      type: 'select',
      label: 'Theme',
      path: 'theme',
      options: [{ value: 'light', label: 'Light' }]
    } as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="light">
        <span>Theme</span>
      </StackItem>
    )

    expect(screen.getByText('Light')).toBeInTheDocument()
  })

  test('ignores Enter key when onClick is not provided', () => {
    render(
      <StackItem>
        <span>Static item</span>
      </StackItem>
    )

    fireEvent.keyDown(screen.getByText('Static item'), { key: 'Enter' })
    expect(screen.getByText('Static item')).toBeInTheDocument()
  })

  test('renders forward icon when requested', () => {
    const { container } = render(
      <StackItem withForwardIcon>
        <span>Forward item</span>
      </StackItem>
    )

    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  test('resolves dynamic select options and shows the live label', async () => {
    const node = {
      type: 'select',
      label: 'Out',
      path: 'dyn.live',
      options: [{ value: 'v', label: 'Static', labelKey: 'k.static' }],
      loadOptions: async () => [{ value: 'v', label: 'Live', labelKey: 'k.live' }]
    } as unknown as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="v">
        <span>Out</span>
      </StackItem>
    )

    expect(await screen.findByText('t:k.live:Live')).toBeInTheDocument()
  })

  test('shows saved label while dynamic options are still loading', async () => {
    const node = {
      type: 'select',
      label: 'Out',
      path: 'dyn.saved',
      options: [{ value: 'other', label: 'Other' }],
      loadOptions: async () => [{ value: 'v', label: 'Live' }]
    } as unknown as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="v" savedLabel="Saved">
        <span>Out</span>
      </StackItem>
    )

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(await screen.findByText('Live')).toBeInTheDocument()
  })

  test('shows empty pre-fetch label when no static hit and no saved label', async () => {
    const node = {
      type: 'select',
      label: 'Out',
      path: 'dyn.empty',
      options: [{ value: 'other', label: 'Other' }],
      loadOptions: async () => [{ value: 'v', label: 'Live' }]
    } as unknown as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="v">
        <span>Out</span>
      </StackItem>
    )

    expect(await screen.findByText('Live')).toBeInTheDocument()
  })

  test('uses a plain static label during pre-fetch when labelKey is absent', async () => {
    const node = {
      type: 'select',
      label: 'Out',
      path: 'dyn.plainstatic',
      options: [{ value: 'v', label: 'StaticPlain' }],
      loadOptions: async () => [{ value: 'v', label: 'Live' }]
    } as unknown as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="v">
        <span>Out</span>
      </StackItem>
    )

    expect(await screen.findByText('Live')).toBeInTheDocument()
  })

  test('ignores resolved options after unmount', async () => {
    const node = {
      type: 'select',
      label: 'Out',
      path: 'dyn.unmount',
      options: [{ value: 'v', label: 'Static' }],
      loadOptions: async () => [{ value: 'v', label: 'Live' }]
    } as unknown as SettingsNode<Config>

    const { unmount } = render(
      <StackItem node={node} showValue value="v">
        <span>Out</span>
      </StackItem>
    )
    unmount()
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
  })

  test('formats an offline option label', () => {
    const node = {
      type: 'select',
      label: 'Out',
      path: 'offline.static',
      options: [{ value: 'bt', label: 'Headset', offline: true }]
    } as unknown as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value="bt">
        <span>Out</span>
      </StackItem>
    )

    expect(screen.getByText(/t:settings.audioDeviceOffline:/)).toBeInTheDocument()
  })

  test('renders a color swatch with the custom value', () => {
    const node = {
      type: 'color',
      label: 'Primary',
      path: 'primaryColorDark'
    } as unknown as SettingsNode<Config>

    const { container } = render(
      <StackItem node={node} showValue value="#123456">
        <span>Primary</span>
      </StackItem>
    )

    const swatch = container.querySelector('div[style*="border-radius"]') as HTMLElement
    expect(swatch).toBeInTheDocument()
    expect(swatch.style.backgroundColor).toBe('rgb(18, 52, 86)')
  })

  test('renders a color swatch with the default when value is empty', () => {
    const node = {
      type: 'color',
      label: 'Primary',
      path: 'primaryColorDark'
    } as unknown as SettingsNode<Config>

    const { container } = render(
      <StackItem node={node} showValue value={null}>
        <span>Primary</span>
      </StackItem>
    )

    const swatch = container.querySelector('div[style*="border-radius"]') as HTMLElement
    expect(swatch).toBeInTheDocument()
    expect(swatch.style.backgroundColor).not.toBe('')
  })

  test('does not render a value box for a null non-color value', () => {
    const node = {
      type: 'number',
      label: 'Speed',
      path: 'speed'
    } as unknown as SettingsNode<Config>

    render(
      <StackItem node={node} showValue value={null}>
        <span>Speed</span>
      </StackItem>
    )

    expect(screen.getByText('Speed')).toBeInTheDocument()
  })
})
