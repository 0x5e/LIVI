export enum CommandMapping {
  requestHostUI = 3, // 'Projection interface My Car button clicked'
  voiceAssistant = 5, // PTT press (VOICE_ASSIST keycode)
  voiceAssistantRelease = 6, // PTT release
  frame = 12,

  // D-PAD
  left = 100, // 'Button Left'
  right = 101, // 'Button Right'
  up = 102, // 'Button Up'
  down = 103, // 'Button Down'
  selectDown = 104, // 'Button Select Down'
  selectUp = 105, // 'Button Select Up'
  back = 106, // 'Button Back'

  // Rotary Knob
  knobLeft = 111,
  knobRight = 112,
  knobUp = 113,
  knobDown = 114,

  // Media Control
  home = 200, // 'Button Home'
  play = 201, // 'Button Play'
  pause = 202, // 'Button Pause'
  playPause = 203, // 'Button Toggle Play/Pause'
  next = 204, // 'Button Next Track'
  prev = 205, // 'Button Prev Track'

  // Phone
  acceptPhone = 300,
  rejectPhone = 301,
  phoneKey0 = 302,
  phoneKey1 = 303,
  phoneKey2 = 304,
  phoneKey3 = 305,
  phoneKey4 = 306,
  phoneKey5 = 307,
  phoneKey6 = 308,
  phoneKey7 = 309,
  phoneKey8 = 310,
  phoneKey9 = 311,
  phoneKeyStar = 312,
  phoneKeyHash = 313,
  phoneKeyHookSwitch = 314,

  // Internal projection UI (main -> renderer): CarPlay Siri speech-mode attention.
  voiceAssistantUiActive = 600, // speech mode recognizing/speaking
  voiceAssistantUiIdle = 601, // speech mode none (Siri fully done, incl. response)

  // Android Auto
  requestVideoFocus = 500,
  releaseVideoFocus = 501,
  requestClusterFocus = 506,
  requestClusterStreamFocus = 508
}

export type CommandValue = keyof typeof CommandMapping

export enum AudioCommand {
  AudioOutputStart = 1,
  AudioOutputStop = 2,
  AudioInputConfig = 3,
  AudioPhonecallStart = 4,
  AudioPhonecallStop = 5,
  AudioNaviStart = 6,
  AudioNaviStop = 7,
  AudioVoiceAssistantStart = 8,
  AudioVoiceAssistantStop = 9,
  AudioMediaStart = 10,
  AudioMediaStop = 11,
  AudioAttentionStart = 12,
  AudioAttentionStop = 13,
  AudioAttentionRinging = 14,
  AudioTurnByTurnStart = 15,
  AudioTurnByTurnStop = 16
}

export enum TouchAction {
  Down = 14,
  Move = 15,
  Up = 16
}

export enum MultiTouchAction {
  Down = 1,
  Move = 2,
  Up = 0
}
