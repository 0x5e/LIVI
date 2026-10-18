import type { System } from '@shared/core/contract'
import type { Config } from '@shared/types'
import type React from 'react'

type BivariantCallback<T extends (...args: never[]) => unknown> = {
  __bivariant(...args: Parameters<T>): ReturnType<T>
}['__bivariant']

export type ValueTransform<StoreValue = unknown, ViewValue = StoreValue> = {
  toView?: BivariantCallback<(value: StoreValue) => ViewValue>
  fromView?: BivariantCallback<(value: ViewValue, prev?: StoreValue) => StoreValue>
  format?: BivariantCallback<(value: ViewValue) => string>
}

export type NodeMeta = {
  page?: {
    title?: string
    labelTitle?: string
  }
  icon?: string
  displayValue?: boolean
  displayValueUnit?: string
  valueTransform?: ValueTransform<unknown, unknown>
  transform?: (value: unknown, prev?: unknown) => unknown
}

export type BaseFieldNode = NodeMeta & {
  label: string // TODO: goes away once labelKey covers every node
  labelKey?: string
  path: string
  disabled?: boolean | ((system: System | null) => boolean)
}

export type CheckboxNode = BaseFieldNode & {
  type: 'checkbox'
}

export type NumberNode = BaseFieldNode & {
  type: 'number'
  min?: number
  max?: number
  step?: number
  default?: number
  /** Stored as is, shown and edited times `factor`. `min` and `max` are stored values. */
  unit?: (settings: Config | null) => NumberUnit
}

/** `step` and `max` are in the unit shown, `step` wins over the node's. */
export type NumberUnit = { factor: number; suffix: string; step?: number; max?: number }

export type StringNode = BaseFieldNode & {
  type: 'string'
  minLength?: number
  maxLength?: number
  format?: 'url'
}

export type ColorNode = BaseFieldNode & {
  type: 'color'
}

export type SelectOption = {
  label: string // TODO: goes away once labelKey covers every node
  labelKey?: string
  value: string | number
  offline?: boolean
}

export type SelectNode = BaseFieldNode & {
  type: 'select'
  options: SelectOption[]
  loadOptions?: () => Promise<SelectOption[]>
  // Companion config path that mirrors the picked option's label
  labelPath?: string
  // Every tap on an option, also on the one already picked
  onPick?: (value: string | number) => void
  readOnly?: (system: System | null) => boolean
}

export type ToggleNode = BaseFieldNode & {
  type: 'toggle'
}

export type SliderNode = BaseFieldNode & {
  type: 'slider'
}

export type KeyBindingKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'selectUp'
  | 'selectDown'
  | 'back'
  | 'knobLeft'
  | 'knobRight'
  | 'knobUp'
  | 'knobDown'
  | 'home'
  | 'cycleSession'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'acceptPhone'
  | 'rejectPhone'
  | 'phoneKey0'
  | 'phoneKey1'
  | 'phoneKey2'
  | 'phoneKey3'
  | 'phoneKey4'
  | 'phoneKey5'
  | 'phoneKey6'
  | 'phoneKey7'
  | 'phoneKey8'
  | 'phoneKey9'
  | 'phoneKeyStar'
  | 'phoneKeyHash'
  | 'phoneKeyHookSwitch'
  | 'voiceAssistant'
  | 'voiceAssistantRelease'

export type KeyBindingNode = NodeMeta & {
  type: 'keybinding'
  label: string // TODO: goes away once labelKey covers every node
  labelKey?: string
  path: string
  bindingKey: KeyBindingKey
  defaultValue?: string
  resetLabel?: string
  clearLabel?: string
}

export type SettingsCustomPageProps<TStore, TValue> = {
  state: TStore
  node: SettingsCustomNode<TStore, TValue>
  onChange: BivariantCallback<(v: TValue) => void>
  requestRestart?: () => void
}

export type SettingsCustomNode<TStore, TValue = unknown> = NodeMeta & {
  type: 'custom'
  label: string // TODO: goes away once labelKey covers every node
  labelKey?: string
  path: string
  component: React.ComponentType<SettingsCustomPageProps<TStore, TValue>>
}

export type BtDeviceListNode = NodeMeta & {
  type: 'btDeviceList'
  label: string // TODO: goes away once labelKey covers every node
  labelKey?: string
  path: string
}

export type PosListItem = {
  id: string
  label: string
  labelKey?: string
  route?: string
}

export type PosListNode = NodeMeta & {
  type: 'posList'
  label: string
  labelKey?: string
  path: string
  items: PosListItem[]
}

export type RouteNode<TStore> = NodeMeta & {
  type: 'route'
  label: string // TODO: goes away once labelKey covers every node
  labelKey?: string
  route: string
  path: string
  children: SettingsNode<TStore>[]
  hidden?: boolean
}

export type SettingsNode<TStore> =
  | RouteNode<TStore>
  | ToggleNode
  | CheckboxNode
  | SelectNode
  | NumberNode
  | StringNode
  | ColorNode
  | SliderNode
  | KeyBindingNode
  | SettingsCustomNode<TStore>
  | BtDeviceListNode
  | PosListNode
