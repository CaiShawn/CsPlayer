/** Shared API types — mirror backend DTOs (camelCase). */

export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

export interface UserProfile {
  userId: number
  nickname: string
  avatarUrl: string
  signature: string
}

export interface SongArtist {
  id: number
  name: string
}

export interface SongSummary {
  id: number
  name: string
  artists: SongArtist[]
  albumId: number
  albumName: string
  coverUrl: string
  durationMs: number
  playable: boolean
  reason: string
}

/** SDK song_url_v1 level */
export type QualityLevel =
  | 'standard'
  | 'higher'
  | 'exhigh'
  | 'lossless'
  | 'hires'
  | 'jyeffect'
  | 'sky'
  | 'jymaster'

export interface SongUrl {
  id: number
  url: string
  br: number
  level: QualityLevel
  expireAt: number
  playable: boolean
}

export interface LyricLine {
  timeMs: number
  text: string
}

export interface Lyric {
  lrc: LyricLine[]
  tlyric: LyricLine[]
  hasTime: boolean
}

export interface PlaylistBrief {
  id: number
  name: string
  coverUrl: string
  trackCount: number
  creatorName: string
  subscribed: boolean
}

export interface PlaylistDetail {
  id: number
  name: string
  coverUrl: string
  description: string
  creatorName: string
  subscribed: boolean
  trackCount: number
  tracks: SongSummary[]
}

export interface AlbumBrief {
  id: number
  name: string
  coverUrl: string
  artistName: string
  publishTime: number | null
  size: number
}

export interface AlbumDetail {
  id: number
  name: string
  coverUrl: string
  artistId: number
  artistName: string
  description: string
  publishTime: number | null
  tracks: SongSummary[]
}

export type PlayMode = 'order' | 'list-loop' | 'single' | 'shuffle'

export type QrStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'rate_limited'

export interface LikedSongs {
  playlistId: number
  tracks: SongSummary[]
  ids: number[]
}

export interface LikeResult {
  id: number
  liked: boolean
}

export interface RecordItem {
  song: SongSummary
  playCount: number
  score: number
}
