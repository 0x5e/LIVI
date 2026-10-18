import { useLiviStore } from '@renderer/store/store'
import type { System } from '@shared/core/contract'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsFieldRow } from '../SettingsFieldRow'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, fb?: string) => `t:${k}:${fb ?? ''}` })
}))

vi.mock('../SettingsFieldControl', () => ({
  SettingsFieldControl: () => <div data-testid="field-control" />
}))
vi.mock('../SettingsFieldPage', () => ({
  SettingsFieldPage: () => <div data-testid="field-page" />
}))
vi.mock('../../pages/devices', () => ({
  Devices: () => <div data-testid="devices-tiles" />
}))
vi.mock('../stackItem', () => ({
  StackItem: ({ children, onClick, disabled }: any) => (
    <button data-testid="stack-item" onClick={disabled ? undefined : onClick}>
      {children}
    </button>
  )
}))
vi.mock('../settingsItemRow', () => ({
  SettingsItemRow: ({ children, label }: any) => (
    <div data-testid="settings-item-row">
      {label}
      {children}
    </div>
  )
}))
vi.mock('../posSensitiveList/PosSensitiveList', () => ({
  PosSensitiveList: ({ onChange }: any) => (
    <button data-testid="pos-list" onClick={() => onChange('picked')} />
  )
}))

describe('SettingsFieldRow', () => {
  test('renders the pos-sensitive list and forwards its changes', () => {
    const onChange = vi.fn()
    render(
      <SettingsFieldRow
        node={{ type: 'posList', path: 'zones', label: 'Zones' } as any}
        value={[]}
        state={{}}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByTestId('pos-list'))
    expect(onChange).toHaveBeenCalledWith('picked')
  })

  test('resolves label via labelKey when provided', () => {
    render(
      <SettingsFieldRow
        node={{ type: 'checkbox', path: 'mute', label: 'Mute', labelKey: 'settings.mute' } as any}
        value={false}
        state={{ mute: false }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('t:settings.mute:Mute')).toBeInTheDocument()
  })

  test('renders the device tiles for btDeviceList node', () => {
    render(
      <SettingsFieldRow
        node={{ type: 'btDeviceList', path: 'bt', label: 'BT' } as any}
        value={null}
        state={{}}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByTestId('devices-tiles')).toBeInTheDocument()
  })

  test('renders StackItem when onClick is provided', () => {
    const onClick = vi.fn()
    render(
      <SettingsFieldRow
        node={{ type: 'route', path: 'audio', route: 'audio', label: 'Audio', children: [] } as any}
        value={null}
        state={{}}
        onChange={vi.fn()}
        onClick={onClick}
      />
    )
    expect(screen.getByTestId('stack-item')).toBeInTheDocument()
    expect(screen.getByText('Audio')).toBeInTheDocument()
  })

  test('a clickable row still navigates when the node is enabled', () => {
    const onClick = vi.fn()
    render(
      <SettingsFieldRow
        node={{ type: 'select', path: 'wifiInterface', label: 'Wi-Fi', options: [] } as any}
        value={null}
        state={{}}
        onChange={vi.fn()}
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByTestId('stack-item'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('a disabled node dims the row and drops the navigation', () => {
    const onClick = vi.fn()
    render(
      <SettingsFieldRow
        node={
          {
            type: 'select',
            path: 'wifiInterface',
            label: 'Wi-Fi',
            options: [],
            disabled: true
          } as any
        }
        value={null}
        state={{}}
        onChange={vi.fn()}
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByTestId('stack-item'))
    expect(onClick).not.toHaveBeenCalled()
  })

  test('core decides whether a node with a disabled check can be picked', () => {
    const onClick = vi.fn()
    const node = {
      type: 'select',
      path: 'displayMode',
      label: 'Display Mode',
      options: [],
      disabled: (system: System | null) => !system?.displayModeSettable
    } as any
    const row = () => (
      <SettingsFieldRow node={node} value="" state={{}} onChange={vi.fn()} onClick={onClick} />
    )

    useLiviStore.setState({ system: { displayModeSettable: true } as System })
    const { unmount } = render(row())
    fireEvent.click(screen.getByTestId('stack-item'))
    expect(onClick).toHaveBeenCalledTimes(1)
    unmount()

    useLiviStore.setState({ system: null })
    render(row())
    fireEvent.click(screen.getByTestId('stack-item'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('renders SettingsItemRow + SettingsFieldControl by default', () => {
    render(
      <SettingsFieldRow
        node={{ type: 'checkbox', path: 'mute', label: 'Mute' } as any}
        value={false}
        state={{ mute: false }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByTestId('settings-item-row')).toBeInTheDocument()
    expect(screen.getByTestId('field-control')).toBeInTheDocument()
  })
})
