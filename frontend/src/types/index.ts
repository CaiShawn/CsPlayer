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

export interface SongUrl {
  id: number
  url: string
  br: number
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
