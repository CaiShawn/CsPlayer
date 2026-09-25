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
  // 字段集 = 前端实际使用集（v0.1.6 裁剪 publishTime / size）
  id: number
  name: string
  coverUrl: string
  artistId: number
  artistName: string
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

/**
 * 队列来源（S4 结构化升级）：label 为面板展示文案（如 歌单《X》）；
 * kind+id 具备时支持队列右键「查看来源」跳详情页。
 */
export interface QueueSource {
  label: string
  kind?: 'playlist' | 'album'
  id?: number
}

export type QrStatus = 'waiting' | 'scanned' | 'success' | 'expired' | 'rate_limited'

export interface LikedSongs {
  playlistId: number
  /** 当前批次切片（单批 PAGE_SIZE 首），滚动到底续拉下一批 */
  tracks: SongSummary[]
  /** v0.1.6 起后端不再下发（与 tracks[].id 全量冗余，前端自 tracks 派生） */
  ids?: number[]
  /** 全量曲目数（拉全前为上游 trackCount hint） */
  total: number
  hasMore: boolean
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

/* ------------------------------------------------------------------------
 * 搜索 / 歌手（v0.1.3）
 * --------------------------------------------------------------------- */

export type SearchType = 'song' | 'album' | 'artist' | 'playlist'

/** 统一搜索结果信封：{ items, hasMore, total } */
export interface SearchResult<T = unknown> {
  items: T[]
  hasMore: boolean
  total: number
}

export interface ArtistBrief {
  id: number
  name: string
  avatarUrl: string
  /** 别名，多个以 / 分隔 */
  alias: string
  musicSize: number
  albumSize: number
}

export interface ArtistDetail {
  id: number
  name: string
  avatarUrl: string
  alias: string
  briefDesc: string
  hotSongs: SongSummary[]
}

/** 歌手专辑列表走分页接口，见 searchApi.artistAlbums */
