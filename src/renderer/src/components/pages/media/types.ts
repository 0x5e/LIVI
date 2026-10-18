export type PersistedSnapshot = { timestamp: string; payload: MediaPayload }
export type MediaPayload = {
  type: number
  media?: {
    MediaSongName?: string
    MediaAlbumName?: string
    MediaArtistName?: string
    MediaAPPName?: string
    MediaSongDuration?: number
    MediaSongPlayTime?: number
    MediaPlayStatus?: number
    MediaLyrics?: string
  }
  base64Image?: string
  error?: boolean
}

export enum MediaEventType {
  PLAY = 'play',
  PAUSE = 'pause',
  STOP = 'stop',
  PREV = 'prev',
  NEXT = 'next',
  PLAYPAUSE = 'playpause'
}
