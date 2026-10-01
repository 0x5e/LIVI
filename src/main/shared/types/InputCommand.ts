export enum InputCommand {
  Play = 'play',
  Pause = 'pause',
  PlayPause = 'playPause',
  Stop = 'stop',
  Next = 'next',
  Previous = 'previous',
  FastForward = 'fastForward',
  Rewind = 'rewind',
  VolumeUp = 'volumeUp',
  VolumeDown = 'volumeDown',
  Mute = 'mute',
  AcceptCall = 'acceptCall',
  RejectCall = 'rejectCall',
  HookSwitch = 'hookSwitch',
  VoiceAssistant = 'voiceAssistant'
}

export function isInputCommand(value: unknown): value is InputCommand {
  return typeof value === 'string' && (Object.values(InputCommand) as string[]).includes(value)
}
