import type { KeyBindings } from '@shared/core/contract'

/** Bindings that move around where the user is, the phone only gets them while it is in front. */
export const NAVIGATION_KEYS: ReadonlySet<keyof KeyBindings> = new Set<keyof KeyBindings>([
  'left',
  'right',
  'up',
  'down',
  'back',
  'selectDown',
  'selectUp',
  'knobLeft',
  'knobRight',
  'knobUp',
  'knobDown'
])

/** Whether the focus is where the user types, keys then stay there. */
export const isTextEntry = (el: Element | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && !['checkbox', 'radio', 'range'].includes(el.type)) ||
  el?.getAttribute('contenteditable') === 'true'
