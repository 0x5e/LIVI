export enum CommandMapping {
  requestHostUI = 3, // the My Car button in the projection
  voiceAssistant = 5,
  voiceAssistantRelease = 6,
  frame = 12,

  left = 100,
  right = 101,
  up = 102,
  down = 103,
  selectDown = 104,
  selectUp = 105,
  back = 106,

  knobLeft = 111,
  knobRight = 112,
  knobUp = 113,
  knobDown = 114,

  home = 200,
  play = 201,
  pause = 202,
  playPause = 203,
  next = 204,
  prev = 205,

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

  // CarPlay Siri speech mode, for the projection UI only
  voiceAssistantUiActive = 600, // recognizing or speaking
  voiceAssistantUiIdle = 601, // Siri is done, its answer included

  // Android Auto
  requestVideoFocus = 500,
  releaseVideoFocus = 501,
  requestClusterFocus = 506,
  requestClusterStreamFocus = 508
}

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
