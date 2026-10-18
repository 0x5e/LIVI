export type KeyCommand =
  | 'left'
  | 'right'
  | 'selectDown'
  | 'selectUp'
  | 'back'
  | 'down'
  | 'home'
  | 'play'
  | 'pause'
  | 'playPause'
  | 'next'
  | 'prev'
  | 'acceptPhone'
  | 'rejectPhone'
  | 'voiceAssistant'
  | 'voiceAssistantRelease'

export type BindKey =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'back'
  | 'home'
  | 'selectDown'
  | 'selectUp'
  | 'next'
  | 'prev'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'acceptPhone'
  | 'rejectPhone'
  | 'voiceAssistant'
  | 'cycleSession'

export type useKeyDownProps = {
  receivingVideo: boolean
  inContainer: (navEl?: HTMLElement | null, el?: HTMLElement | null) => boolean
  focusSelectedNav: () => boolean
  focusFirstInMain: () => boolean
  moveFocusLinear: (delta: -1 | 1) => boolean
  isFormField: (el: HTMLElement | null) => boolean
  activateControl: (el: HTMLElement | null) => boolean
}
